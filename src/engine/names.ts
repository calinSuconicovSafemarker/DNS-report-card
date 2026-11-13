import { RecordType, type DnsAnswer, type DnsClient } from './dns';

const NXDOMAIN = 3;

export type HostnameLookup =
  /** The Hostname doesn't exist in DNS. */
  | { exists: false }
  /** `soa` is the SOA answer for the Hostname, reused as the first step of the Zone apex walk. */
  | { exists: true; soa: DnsAnswer };

/**
 * Does the Hostname exist? One SOA query with checking disabled, so a zone
 * with broken DNSSEC still counts as existing (the DNSSEC Check judges that).
 * Throws DnsUnreachableError when no provider answered.
 */
export async function lookupHostname(dns: DnsClient, hostname: string): Promise<HostnameLookup> {
  const soa = await querySoa(dns, hostname);
  // An Alias whose target is missing still exists itself.
  const isAlias = soa.answer.some((r) => r.type === RecordType.CNAME && r.name === hostname);
  if (soa.rcode === NXDOMAIN && !isAlias) return { exists: false };
  return { exists: true, soa };
}

/**
 * The Zone apex: the nearest name at or above `hostname` that owns an SOA
 * record. Walks up one label at a time, so `www.example.co.uk` stops at
 * `example.co.uk` without needing a public suffix list. An SOA that only
 * appears after a CNAME belongs to the alias target's zone and is ignored.
 * `firstAnswer` is the SOA answer already fetched for `hostname`, if any.
 */
export async function findZoneApex(dns: DnsClient, hostname: string, firstAnswer?: DnsAnswer): Promise<string> {
  let name = hostname;
  let soa = firstAnswer ?? (await querySoa(dns, name));
  for (;;) {
    if (soa.answer.some((r) => r.type === RecordType.SOA && r.name === name)) return name;
    const dot = name.indexOf('.');
    if (dot === -1) return name; // Reached a TLD without finding an SOA owner: the TLD it is.
    name = name.slice(dot + 1);
    soa = await querySoa(dns, name);
  }
}

function querySoa(dns: DnsClient, name: string): Promise<DnsAnswer> {
  return dns.query(name, 'SOA', { checkingDisabled: true });
}

/** The Hostname is an Alias: its DNS answer is a CNAME (chain) ending at `target`. */
export interface Alias {
  name: string;
  target: string;
}

/** Follow the CNAME chain in `answer` starting at `name`. Null when `name` is not an Alias. */
export function findAlias(name: string, answer: DnsAnswer): Alias | null {
  const cnames = new Map(answer.answer.filter((r) => r.type === RecordType.CNAME).map((r) => [r.name, r.data]));
  let target = name;
  const seen = new Set<string>();
  while (cnames.has(target) && !seen.has(target)) {
    seen.add(target);
    target = cnames.get(target)!;
  }
  return target === name ? null : { name, target };
}

/** The note shown on cards whose records were read through an Alias. */
export function aliasNote(alias: Alias): string {
  return `${alias.name} is an alias of ${alias.target}; results reflect the alias target`;
}
