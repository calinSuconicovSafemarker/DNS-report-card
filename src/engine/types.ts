import type { DnsClient } from './dns';
import type { Alias } from './names';

/** Identifier of a Check. Later tickets extend this union: 'dnssec' | 'caa' | 'nameservers' | 'certificate' | 'hsts-preload'. */
export type CheckId = 'https-record';

export type Status = 'pass' | 'warning' | 'fail' | 'couldnt-check' | 'info';

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

export interface Check {
  id: CheckId;
  title: string;
  /** Weight in the Grade (spec: Grading). */
  weight: number;
  /**
   * The Check reads DNS records on the Hostname, so on an Alias they are the
   * alias target's. The engine then adds the Alias note to its result.
   */
  readsHostnameRecords?: boolean;
  run(ctx: CheckContext): Promise<CheckResult>;
}
