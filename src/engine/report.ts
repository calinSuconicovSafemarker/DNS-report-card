import { catalog, checks as registeredChecks } from './checks';
import { createDnsClient, DnsUnreachableError } from './dns';
import { gradeResults, type Grading } from './grade';
import { normalizeTarget, type TargetRejection } from './target';
import type { Check, CheckContext, CheckId, CheckResult } from './types';

export interface ReportOptions {
  fetch: typeof fetch;
  /** The Check implementations to run. Defaults to the registry in `checks/index.ts`; tests supply stand-ins. */
  checks?: readonly Check[];
  /**
   * Safety net: a Check that hasn't settled after this long becomes Couldn't check,
   * so no card spins forever. Each service also has its own, shorter timeout.
   */
  checkTimeoutMs?: number;
}

const DEFAULT_CHECK_TIMEOUT_MS = 60_000;

/** One of the six Checks as listed in a Report. `built: false` means it has no implementation yet. */
export interface ReportCheck {
  id: CheckId;
  title: string;
  /** Weight in the Grade before rescaling. */
  weight: number;
  built: boolean;
}

/** Events emitted by the Report engine, in order. */
export type ReportEvent =
  /** Report-level outcome: the Target can't be checked. Nothing else follows. */
  | { type: 'invalid-target'; reason: TargetRejection; message: string }
  /**
   * The Target was normalized. Lists all six Checks in card order; one
   * `check` event follows for each Check that is `built`.
   */
  | { type: 'started'; hostname: string; checks: ReportCheck[] }
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
  const checks = options.checks ?? registeredChecks;
  const built = new Set(checks.map((c) => c.id));
  const weightOf = (id: CheckId) => catalog.find((c) => c.id === id)?.weight ?? 0;

  yield {
    type: 'started',
    hostname,
    checks: catalog.map(({ id, title, weight }) => ({ id, title, weight, built: built.has(id) })),
  };

  const pending = new Map(
    checks.map((check, i) => [
      i,
      runCheck(check, ctx, options.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS).then((result) => ({ i, result })),
    ]),
  );
  const settled: { result: CheckResult; weight: number }[] = [];
  while (pending.size > 0) {
    const { i, result } = await Promise.race(pending.values());
    pending.delete(i);
    settled.push({ result, weight: weightOf(checks[i].id) });
    yield { type: 'check', result };
  }

  yield { type: 'graded', grading: gradeResults(settled, catalog.length) };
}

/** A Check whose service doesn't answer becomes Couldn't check, never a Fail. */
async function runCheck(check: Check, ctx: CheckContext, timeoutMs: number): Promise<CheckResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CheckTimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([check.run(ctx), deadline]);
  } catch (error) {
    return {
      check: check.id,
      status: 'couldnt-check',
      verdict: 'Couldn’t check — no response from the service',
      checkedName: ctx.hostname,
      details:
        error instanceof DnsUnreachableError || error instanceof CheckTimeoutError
          ? [{ label: 'Error', value: error.message }]
          : [],
    };
  } finally {
    clearTimeout(timer);
  }
}

class CheckTimeoutError extends Error {
  constructor(ms: number) {
    super(`No answer within ${ms / 1000} s`);
    this.name = 'CheckTimeoutError';
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
