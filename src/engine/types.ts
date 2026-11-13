import type { DnsClient } from './dns';

/** Identifier of one of the six Checks (see `checks/index.ts` for titles, weights and card order). */
export type CheckId = 'dnssec' | 'caa' | 'nameservers' | 'https-record' | 'certificate' | 'hsts-preload';

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
  /** Set when the evaluated name is an Alias (ticket 02). */
  aliasNote?: string;
}

/** What every Check receives. Later tickets add shared lookups here (Zone apex, Alias, Preload list...). */
export interface CheckContext {
  hostname: string;
  dns: DnsClient;
  fetch: typeof fetch;
}

/** An implemented Check. Its title and weight live in the catalog (`checks/index.ts`). */
export interface Check {
  id: CheckId;
  run(ctx: CheckContext): Promise<CheckResult>;
}
