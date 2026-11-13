import { RecordType, type DnsClient, type DnsRecord } from '../dns';
import type { Check, CheckResult, Detail } from '../types';

/**
 * The CAA policy that applies to the Hostname: the Relevant RRset of RFC 8659,
 * reduced to what callers need. Ticket 09 compares certificate issuers against it.
 */
export interface CaaPolicy {
  /** The name the CAA set was found at: the Hostname or the nearest parent with CAA. */
  foundAt: string;
  /**
   * CA domains from `issue` tags, sorted and deduplicated, without parameters
   * (`"letsencrypt.org; validationmethods=dns-01"` gives `letsencrypt.org`).
   * An `issue ";"` record names no CA: if `issue` tags exist but this list
   * is empty, no CA may issue.
   */
  issue: string[];
  /** CA domains from `issuewild` tags. When there are any `issuewild` tags they, not `issue`, govern wildcard certificates. */
  issuewild: string[];
  /** Report URLs from `iodef` tags, e.g. `mailto:security@example.com`. */
  iodef: string[];
}

/** The CAA Check result: a Check result plus the structured policy (null when no CAA applies). */
export interface CaaCheckResult extends CheckResult {
  check: 'caa';
  caa: CaaPolicy | null;
}

/**
 * The CAA policy carried by a Check result. Undefined when `result` is not a
 * CAA result with a policy (e.g. Couldn't check); null when no CAA applies.
 */
export function caaPolicyOf(result: CheckResult): CaaPolicy | null | undefined {
  return result.check === 'caa' && 'caa' in result ? (result as CaaCheckResult).caa : undefined;
}

/** CAA (RFC 8659): which certificate authorities may issue for the Hostname. */
export const caaCheck: Check = {
  id: 'caa',
  readsHostnameRecords: true,
  async run({ hostname, dns }): Promise<CaaCheckResult> {
    const { found, searched } = await findRelevantCaaSet(dns, hostname);

    if (!found) {
      return {
        check: 'caa',
        status: 'fail',
        verdict: 'No CAA record found',
        checkedName: hostname,
        details: [{ label: 'Searched', value: searched.join(', ') }],
        caa: null,
      };
    }

    const properties = found.records.map((r) => parseCaa(r.data));
    const values = (tag: string) => properties.filter((p) => p?.tag === tag).map((p) => p!.value);
    const issueValues = values('issue');
    const issuewildValues = values('issuewild');
    const policy: CaaPolicy = {
      foundAt: found.name,
      issue: unique(issueValues.map(issuerDomain).filter((d) => d !== '')),
      issuewild: unique(issuewildValues.map(issuerDomain).filter((d) => d !== '')),
      iodef: unique(values('iodef')),
    };
    const restricts = issueValues.length + issuewildValues.length > 0;
    const inherited = found.name !== hostname;

    const details: Detail[] = [{ label: 'Found at', value: found.name }];
    if (issueValues.length > 0) details.push({ label: 'Allowed CAs', value: caList(policy.issue) });
    if (issuewildValues.length > 0) details.push({ label: 'Allowed CAs for wildcards', value: caList(policy.issuewild) });
    if (policy.iodef.length > 0) details.push({ label: 'Report problems to (iodef)', value: policy.iodef.join(', ') });
    details.push(...found.records.map((r) => ({ label: 'Record', value: r.data })));

    if (!restricts) {
      return {
        check: 'caa',
        status: 'fail',
        verdict: 'CAA set names no certificate authority (no issue or issuewild tag)',
        checkedName: found.name,
        details,
        caa: policy,
      };
    }

    return {
      check: 'caa',
      status: 'pass',
      verdict: inherited ? `CAA set inherited from ${found.name}` : 'CAA set at this name',
      checkedName: found.name,
      details,
      caa: policy,
    };
  },
};

interface CaaWalk {
  /** The Relevant RRset (RFC 8659) and the name it was found at; null when no name up the tree has CAA. */
  found: { name: string; records: DnsRecord[] } | null;
  /** Every name queried, from the Hostname up. */
  searched: string[];
}

/**
 * RFC 8659 tree climbing: query CAA at the Hostname, then each parent in turn
 * up to the TLD; the first non-empty CAA set is the Relevant RRset. A query on
 * an Alias is answered with the alias target's records, as the resolver
 * follows the CNAME.
 */
async function findRelevantCaaSet(dns: DnsClient, hostname: string): Promise<CaaWalk> {
  const searched: string[] = [];
  for (let name = hostname; ; name = name.slice(name.indexOf('.') + 1)) {
    searched.push(name);
    const response = await dns.query(name, 'CAA');
    const records = response.answer.filter((r) => r.type === RecordType.CAA);
    if (records.length > 0) return { found: { name, records }, searched };
    if (!name.includes('.')) return { found: null, searched };
  }
}

/** Parse the presentation form `<flags> <tag> <value>`, e.g. `0 issue "pki.goog"`. Null if malformed. */
function parseCaa(data: string): { tag: string; value: string } | null {
  const match = /^\s*\d+\s+([A-Za-z0-9]+)\s+(.*?)\s*$/.exec(data);
  if (!match) return null;
  const [, tag, raw] = match;
  const value = raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2 ? raw.slice(1, -1).replace(/\\(.)/g, '$1') : raw;
  return { tag: tag.toLowerCase(), value };
}

/** The CA domain of an `issue`/`issuewild` value, without parameters. Empty for `";"` (no CA allowed). */
function issuerDomain(value: string): string {
  return value.split(';')[0].trim().toLowerCase();
}

function caList(domains: string[]): string {
  return domains.length > 0 ? domains.join(', ') : 'None (no CA may issue)';
}

function unique(items: string[]): string[] {
  return [...new Set(items)].sort();
}
