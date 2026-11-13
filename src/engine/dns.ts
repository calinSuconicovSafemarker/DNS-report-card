/** DNS record types used by the Checks (numeric codes from the DoH JSON responses). */
export const RecordType = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  DS: 43,
  RRSIG: 46,
  DNSKEY: 48,
  SVCB: 64,
  HTTPS: 65,
  CAA: 257,
} as const;
export type RecordTypeName = keyof typeof RecordType;

export interface DnsRecord {
  /** Owner name, lowercase, without a trailing dot. */
  name: string;
  type: number;
  ttl: number;
  /** Record data in presentation form, e.g. `1 . alpn=h3,h2`. */
  data: string;
}

export interface DnsAnswer {
  /** DNS RCODE: 0 NOERROR, 2 SERVFAIL, 3 NXDOMAIN. */
  rcode: number;
  /** Resolver reports the answer as DNSSEC-validated. */
  authenticated: boolean;
  answer: DnsRecord[];
  authority: DnsRecord[];
}

export interface DnsQueryOptions {
  /** Checking disabled (`cd=1`): ask the resolver not to validate DNSSEC. */
  checkingDisabled?: boolean;
}

export interface DnsClient {
  query(name: string, type: RecordTypeName, options?: DnsQueryOptions): Promise<DnsAnswer>;
}

/** Thrown when no DNS provider answered. */
export class DnsUnreachableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DnsUnreachableError';
  }
}

interface DohRecord {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DohJson {
  Status: number;
  AD?: boolean;
  Answer?: DohRecord[];
  Authority?: DohRecord[];
}

const CLOUDFLARE = 'https://cloudflare-dns.com/dns-query';

/**
 * DNS-over-HTTPS JSON client. Cloudflare only for now; ticket 02 adds the
 * per-query Google fallback, the 4 s timeout and provider normalization.
 */
export function createDnsClient(fetchImpl: typeof fetch): DnsClient {
  return {
    async query(name, type, options = {}) {
      const url = new URL(CLOUDFLARE);
      url.searchParams.set('name', name);
      url.searchParams.set('type', type);
      if (options.checkingDisabled) url.searchParams.set('cd', '1');

      let body: DohJson;
      try {
        // Cloudflare returns 400 without this header. It is CORS-safelisted, so no preflight.
        const res = await fetchImpl(url.href, { headers: { Accept: 'application/dns-json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        body = (await res.json()) as DohJson;
      } catch (cause) {
        throw new DnsUnreachableError(`DNS lookup for ${name} ${type} failed`, { cause });
      }
      return normalize(body);
    },
  };
}

function normalize(body: DohJson): DnsAnswer {
  const records = (list: DohRecord[] | undefined): DnsRecord[] =>
    (list ?? []).map((r) => ({
      name: r.name.toLowerCase().replace(/\.$/, ''),
      type: r.type,
      ttl: r.TTL,
      data: r.data,
    }));
  return {
    rcode: body.Status,
    authenticated: body.AD === true,
    answer: records(body.Answer),
    authority: records(body.Authority),
  };
}
