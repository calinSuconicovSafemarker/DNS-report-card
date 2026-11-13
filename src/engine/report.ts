import { checks as registeredChecks } from './checks';
import { createDnsClient, DnsUnreachableError } from './dns';
import { gradeResults, type Grading } from './grade';
import { normalizeTarget, type TargetRejection } from './target';
import type { Check, CheckContext, CheckId, CheckResult } from './types';

export interface ReportOptions {
  fetch: typeof fetch;
}

/** Events emitted by the Report engine, in order. */
export type ReportEvent =
  /** Report-level outcome: the Target can't be checked. Nothing else follows. */
  | { type: 'invalid-target'; reason: TargetRejection; message: string }
  /** The Target was normalized; one `check` event per listed Check follows. */
  | { type: 'started'; hostname: string; checks: { id: CheckId; title: string }[] }
  /** One Check settled. */
  | { type: 'check'; result: CheckResult }
  /** Every Check settled. `grading` is null when no Check could be graded. */
  | { type: 'graded'; grading: Grading | null };

/**
 * The Report engine, and the project's single test seam:
 * Target + injected fetch -> a progressive stream of ReportEvents.
 * All Checks start in parallel; each result is yielded as soon as it
 * settles; the Score and Grade come last.
 */
export async function* runReport(target: string, options: ReportOptions): AsyncGenerator<ReportEvent> {
  const normalized = normalizeTarget(target);
  if (!normalized.ok) {
    yield { type: 'invalid-target', reason: normalized.reason, message: normalized.message };
    return;
  }
  const { hostname } = normalized;
  const ctx: CheckContext = { hostname, dns: createDnsClient(options.fetch), fetch: options.fetch };
  const checks = registeredChecks;

  yield { type: 'started', hostname, checks: checks.map((c) => ({ id: c.id, title: c.title })) };

  const pending = new Map(
    checks.map((check, i) => [i, runCheck(check, ctx).then((result) => ({ i, result }))]),
  );
  const settled: { result: CheckResult; weight: number }[] = [];
  while (pending.size > 0) {
    const { i, result } = await Promise.race(pending.values());
    pending.delete(i);
    settled.push({ result, weight: checks[i].weight });
    yield { type: 'check', result };
  }

  yield { type: 'graded', grading: gradeResults(settled) };
}

/** A Check whose service doesn't answer becomes Couldn't check, never a Fail. */
async function runCheck(check: Check, ctx: CheckContext): Promise<CheckResult> {
  try {
    return await check.run(ctx);
  } catch (error) {
    return {
      check: check.id,
      status: 'couldnt-check',
      verdict: 'Couldn’t check — no response from the service',
      checkedName: ctx.hostname,
      details: error instanceof DnsUnreachableError ? [{ label: 'Error', value: error.message }] : [],
    };
  }
}

export type CollectedReport =
  | { kind: 'report'; hostname: string; results: CheckResult[]; grading: Grading | null }
  | { kind: 'invalid-target'; reason: TargetRejection; message: string };

/** Drain `runReport` into its final state. For tests and non-progressive callers. */
export async function collectReport(target: string, options: ReportOptions): Promise<CollectedReport> {
  let hostname = '';
  const results: CheckResult[] = [];
  for await (const event of runReport(target, options)) {
    switch (event.type) {
      case 'invalid-target':
        return { kind: 'invalid-target', reason: event.reason, message: event.message };
      case 'started':
        hostname = event.hostname;
        break;
      case 'check':
        results.push(event.result);
        break;
      case 'graded':
        return { kind: 'report', hostname, results, grading: event.grading };
    }
  }
  throw new Error('Report ended without a Grade');
}
