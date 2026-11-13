import type { DnsClient } from './dns';
import type { Alias } from './names';

/** Identifier of one of the six Checks (see `checks/index.ts` for titles, weights and card order). */
export type CheckId = 'dnssec' | 'caa' | 'nameservers' | 'https-record' | 'certificate' | 'hsts-preload';

export type Status = 'pass' | 'warning' | 'fail' | 'couldnt-check' | 'info';

/**
 * The cases of a Status, per Check, for Checks whose Status covers several
 * (e.g. DNSSEC Fail: `broken` vs `none`). Each selects its own explanation copy.
 */
export interface CheckReasons {
  dnssec: 'validated' | 'no-ds' | 'not-validated' | 'broken' | 'none';
  caa: 'no-ca-named';
}
export type CheckReason = CheckReasons[keyof CheckReasons];

export interface Detail {
  label: string;
  value: string;
}

/** The outcome of one Check (see GLOSSARY.md). Explanation copy is looked up separately, by `check` × `status`. */
export interface CheckResult {
  check: CheckId;
  status: Status;
  /** One-line verdict shown on the card. */
  verdict: string;
  /** The name the Check was evaluated on, e.g. the Hostname or the Zone apex. */
  checkedName: string;
  /** Raw data for technical users. */
  details: Detail[];
  /** Which case of the Status this is, when a Check has several (e.g. DNSSEC `broken` vs `none`). Selects the explanation copy. */
  reason?: CheckReason;
  /** Set by the Report engine when the Check read records on an Alias Hostname. */
  aliasNote?: string;
}

/** What every Check receives. Later tickets add shared lookups here (Preload list...). */
export interface CheckContext {
  hostname: string;
  /** DoH client: Cloudflare, falling back to Google per query, 4 s timeout each. */
  dns: DnsClient;
  fetch: typeof fetch;
  /** Set when the Hostname is an Alias (its answer is a CNAME chain). */
  alias: Alias | null;
  /**
   * The Hostname's Zone apex, found by walking up with SOA queries. Memoized:
   * every Check shares one walk. Rejects with DnsUnreachableError if DNS stops answering.
   */
  zoneApex(): Promise<string>;
}

/**
 * Cross-Check post-processing: refines one Check result using the results of
 * other Checks that have settled (keyed by Check). Runs every time a Check
 * settles, on every settled result. Returns `result` itself when it has
 * nothing to add; any other object is sent as a replacement result.
 * Must not change the Status (the Grade is computed from refined results).
 */
export type Refiner = (result: CheckResult, settled: ReadonlyMap<CheckId, CheckResult>) => CheckResult;

/** An implemented Check. Its title and weight live in the catalog (`checks/index.ts`). */
export interface Check {
  id: CheckId;
  /**
   * The Check reads DNS records on the Hostname, so on an Alias they are the
   * alias target's. The engine then adds the Alias note to its result.
   */
  readsHostnameRecords?: boolean;
  run(ctx: CheckContext): Promise<CheckResult>;
}
