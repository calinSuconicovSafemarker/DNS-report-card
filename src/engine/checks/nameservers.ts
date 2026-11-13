import { recordsOf } from '../dns';
import type { Check, CheckResult, Detail } from '../types';

interface Nameserver {
  hostname: string;
  /** Registrable domain of the nameserver hostname, used as the provider. */
  provider: string;
  ipv4: string[];
}

/**
 * Nameservers of the Zone apex: how many, which provider domains run them and
 * which IPv4 /24 networks they sit in. No ASN or third-party IP lookups.
 */
export const nameserversCheck: Check = {
  id: 'nameservers',
  async run({ dns, zoneApex }): Promise<CheckResult> {
    const apex = await zoneApex();
    const hostnames = unique(recordsOf(await dns.query(apex, 'NS'), 'NS').map((r) => r.data)).sort();

    const nameservers: Nameserver[] = await Promise.all(
      hostnames.map(async (hostname) => {
        const a = recordsOf(await dns.query(hostname, 'A'), 'A');
        return {
          hostname,
          provider: registrableDomain(hostname),
          ipv4: a.filter((r) => r.name === hostname).map((r) => r.data).sort(byAddress),
        };
      }),
    );

    const providers = unique(nameservers.map((ns) => ns.provider)).sort();
    const networks = unique(nameservers.flatMap((ns) => ns.ipv4.map(network24))).sort(byAddress);

    const details: Detail[] = [
      ...nameservers.map((ns) => ({
        label: ns.hostname,
        value: [ns.provider, ...ns.ipv4.map((ip) => `${ip} (${network24(ip)})`)].join(' · '),
      })),
      { label: 'Provider domains', value: providers.join(', ') || 'None' },
      { label: '/24 networks', value: networks.join(', ') || 'None' },
    ];
    const result = (status: CheckResult['status'], verdict: string): CheckResult => ({
      check: 'nameservers',
      status,
      verdict,
      checkedName: apex,
      details,
    });

    const count = plural(nameservers.length, 'nameserver');
    if (nameservers.length < 2) {
      return result('fail', nameservers.length === 0 ? 'No nameservers found' : 'Only one nameserver');
    }
    const concentrated = [
      ...(providers.length < 2 ? [`all run by ${providers[0]}`] : []),
      ...(networks.length === 0 ? ['none with an IPv4 address'] : networks.length < 2 ? [`all in ${networks[0]}`] : []),
    ];
    if (concentrated.length > 0) return result('warning', [count, ...concentrated].join(', '));
    return result(
      'pass',
      `${count} across ${plural(providers.length, 'provider')} and ${plural(networks.length, '/24 network')}`,
    );
  },
};

/** Second-level labels under a two-letter country code that act as public suffixes (`co.uk`, `com.au`...). */
const COUNTRY_SECOND_LEVELS = new Set(['ac', 'co', 'com', 'edu', 'gov', 'net', 'org', 'ne', 'or', 'go', 'gv', 'ltd', 'plc']);

/**
 * The registrable domain of a hostname: its last two labels, or three under a
 * country-code second level such as `co.uk`. An approximation of the Public
 * Suffix List, good enough to tell DNS providers apart.
 */
function registrableDomain(hostname: string): string {
  const labels = hostname.split('.');
  const tld = labels.at(-1) ?? '';
  const second = labels.at(-2) ?? '';
  const keep = tld.length === 2 && COUNTRY_SECOND_LEVELS.has(second) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

function network24(ip: string): string {
  return `${ip.split('.').slice(0, 3).join('.')}.0/24`;
}

function byAddress(a: string, b: string): number {
  const key = (n: string) => n.split(/[./]/).slice(0, 4).map(Number);
  const [x, y] = [key(a), key(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3];
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
