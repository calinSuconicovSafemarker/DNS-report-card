import { checks as registeredChecks } from './checks';
import { createDnsClient, DnsUnreachableError } from './dns';
import { gradeResults, type Grading } from './grade';
import { aliasNote, findAlias, findZoneApex, lookupHostname } from './names';
import { normalizeTarget, type TargetRejection } from './target';
import type { Check, CheckContext, CheckId, CheckResult } from './types';

export interface ReportOptions {
  fetch: typeof fetch;
  /** The Checks to run. Defaults to the registry in `checks/index.ts`; tests may pass their own. */
  checks?: readonly Check[];
}

/** Events emitted by the Report engine, in order. */
export type ReportEvent =
  /** Report-level outcome: the Target can't be checked. Nothing else follows. */
  | { type: 'invalid-target'; reason: TargetRejection; message: string }
  /** Report-level outcome: the Hostname doesn't exist (NXDOMAIN). Nothing else follows. */
  | { type: 'not-found'; hostname: string; message: string }
  /** Report-level outcome: no DNS provider answered. Nothing else follows. */
  | { type: 'dns-unreachable'; hostname: string; message: string }
  /** The Target was normalized; one `check` event per listed Check follows. */
  | { type: 'started'; hostname: string; checks: { id: CheckId; title: string }[] }
  /** One Check settled. */
  | { type: 'check'; result: CheckResult }
  /** Every Check settled. `grading` is null when no Check could be graded. */
  | { type: 'graded'; grading: Grading | null };

const NOT_FOUND_MESSAGE = 'We couldn’t find this domain in DNS — check the spelling.';
const DNS_UNREACHABLE_MESSAGE = 'Couldn’t reach the DNS lookup service. Try again in a moment.';

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
  const dns = createDnsClient(options.fetch);

  let lookup;
  try {
    lookup = await lookupHostname(dns, hostname);
  } catch (error) {
    if (!(error instanceof DnsUnreachableError)) throw error;
    yield { type: 'dns-unreachable', hostname, message: DNS_UNREACHABLE_MESSAGE };
    return;
  }
  if (!lookup.exists) {
    yield { type: 'not-found', hostname, message: NOT_FOUND_MESSAGE };
    return;
  }

  const { soa } = lookup;
  let zoneApex: Promise<string> | undefined;
  const ctx: CheckContext = {
    hostname,
    dns,
    fetch: options.fetch,
    alias: findAlias(hostname, soa),
    zoneApex: () => (zoneApex ??= findZoneApex(dns, hostname, soa)),
  };
  const checks = options.checks ?? registeredChecks;

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
    const result = await check.run(ctx);
    // Records read on an Alias are the alias target's: say so, without changing the Status.
    if (check.readsHostnameRecords && ctx.alias && result.checkedName === ctx.hostname && result.status !== 'couldnt-check') {
      return { ...result, aliasNote: aliasNote(ctx.alias) };
    }
    return result;
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
  | { kind: 'invalid-target'; reason: TargetRejection; message: string }
  | { kind: 'not-found' | 'dns-unreachable'; hostname: string; message: string };

/** Drain `runReport` into its final state. For tests and non-progressive callers. */
export async function collectReport(target: string, options: ReportOptions): Promise<CollectedReport> {
  let hostname = '';
  const results: CheckResult[] = [];
  for await (const event of runReport(target, options)) {
    switch (event.type) {
      case 'invalid-target':
        return { kind: 'invalid-target', reason: event.reason, message: event.message };
      case 'not-found':
      case 'dns-unreachable':
        return { kind: event.type, hostname: event.hostname, message: event.message };
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
