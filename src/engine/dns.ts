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
  /** Resolver diagnostics (e.g. extended DNS errors), always as a list. */
  comments: string[];
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
  /** Cloudflare sends an array of strings, Google a single string. */
  Comment?: string | string[];
}

/** Per-provider timeout (spec: DNS client). */
export const DNS_TIMEOUT_MS = 4000;

interface Provider {
  name: string;
  endpoint: string;
  init: RequestInit;
}

/** Tried in order, per query. */
const PROVIDERS: Provider[] = [
  // Cloudflare returns 400 without this header. It is CORS-safelisted, so no preflight.
  { name: 'Cloudflare', endpoint: 'https://cloudflare-dns.com/dns-query', init: { headers: { Accept: 'application/dns-json' } } },
  // Google's CORS preflight carries no CORS headers: send a simple GET with no custom headers at all.
  { name: 'Google', endpoint: 'https://dns.google/resolve', init: {} },
];

/**
 * DNS-over-HTTPS JSON client. Each query tries Cloudflare, then Google; a
 * provider that errors, returns a non-2xx status or takes longer than 4 s is
 * skipped. Throws DnsUnreachableError when no provider answered.
 */
export function createDnsClient(fetchImpl: typeof fetch): DnsClient {
  return {
    async query(name, type, options = {}) {
      const failures: string[] = [];
      for (const provider of PROVIDERS) {
        const url = new URL(provider.endpoint);
        url.searchParams.set('name', name);
        url.searchParams.set('type', type);
        if (options.checkingDisabled) url.searchParams.set('cd', '1');
        try {
          return normalize(await fetchJson(fetchImpl, url.href, provider.init));
        } catch (error) {
          failures.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      throw new DnsUnreachableError(`DNS lookup for ${name} ${type} failed (${failures.join('; ')})`);
    },
  };
}

async function fetchJson(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<DohJson> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`timed out after ${DNS_TIMEOUT_MS / 1000} s`);
      controller.abort(error);
      reject(error);
    }, DNS_TIMEOUT_MS);
  });
  try {
    const request = (async () => {
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as DohJson;
    })();
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Record types whose data is a domain name (Google adds trailing dots and may vary case). */
const NAME_DATA_TYPES = new Set<number>([RecordType.CNAME, RecordType.NS]);

function normalize(body: DohJson): DnsAnswer {
  const records = (list: DohRecord[] | undefined): DnsRecord[] =>
    (list ?? []).map((r) => ({
      name: normalizeName(r.name),
      type: r.type,
      ttl: r.TTL,
      data: normalizeData(r.type, r.data),
    }));
  const comment = body.Comment;
  return {
    rcode: body.Status,
    authenticated: body.AD === true,
    answer: records(body.Answer),
    authority: records(body.Authority),
    comments: comment === undefined ? [] : Array.isArray(comment) ? comment : [comment],
  };
}

/** Lowercase, without a trailing dot. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\.$/, '');
}

function normalizeData(type: number, data: string): string {
  if (NAME_DATA_TYPES.has(type)) return normalizeName(data);
  // DS: `<key tag> <algorithm> <digest type> <digest hex>`; Google sends the digest in uppercase.
  if (type === RecordType.DS) return data.replace(/[0-9A-F]+$/i, (hex) => hex.toLowerCase());
  return data;
}
