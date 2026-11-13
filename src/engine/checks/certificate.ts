import type { CaaMismatch } from '../caaMismatch';
import type { Check, CheckResult, Detail } from '../types';

/** The public Certificate Transparency services, in the order they are asked (ADR 0002). */
export type CertificateSource = 'Cert Spotter' | 'crt.sh';

/** One certificate issued for the Hostname, as recorded in Certificate Transparency logs. */
export interface IssuedCertificate {
  /** The service's own id for the issuance (Cert Spotter issuance id, or crt.sh certificate id). */
  id: string;
  /** Short issuer name, e.g. "Let's Encrypt". Issuance history groups on this. */
  issuer: string;
  /** Full issuer distinguished name, e.g. "C=US, O=Let's Encrypt, CN=R11". */
  issuerName: string;
  dnsNames: string[];
  /** ISO 8601, UTC. */
  notBefore: string;
  /** ISO 8601, UTC. */
  notAfter: string;
}

/** The certificates of one issuer in the Issuance history, newest first. */
export interface IssuerGroup {
  issuer: string;
  certificates: IssuedCertificate[];
  /**
   * Set by the Report engine once the CAA Check has settled, when the current
   * CAA set would not allow this issuer. Informational: it changes no Status or Grade.
   */
  caaMismatch?: CaaMismatch;
}

/**
 * Issuance history: certificates issued in the 12 months up to `to`, grouped
 * by issuer. Groups are ordered by their most recent issuance, newest first.
 * Always shown with the Info Status; it is never graded.
 */
export interface IssuanceHistory {
  /** Start of the 12-month window, ISO 8601. */
  from: string;
  /** End of the window ("today"), ISO 8601. */
  to: string;
  issuers: IssuerGroup[];
}

export interface CertificateData {
  /** The service that answered. */
  source: CertificateSource;
  /**
   * The Latest issued certificate: the most recently issued one that has not
   * expired, or, when all have expired, the most recently issued one. Null when none were found.
   */
  latest: IssuedCertificate | null;
  /** Whole days until `latest` expires; negative once expired. Null when none were found. */
  daysLeft: number | null;
  history: IssuanceHistory;
}

/** The Certificate Check result: a Check result plus the structured certificate data for the card. */
export interface CertificateResult extends CheckResult {
  check: 'certificate';
  certificate: CertificateData;
}

export function isCertificateResult(result: CheckResult): result is CertificateResult {
  return result.check === 'certificate' && 'certificate' in result;
}

export interface CertificateCheckOptions {
  /** "Today", for expiry and the 12-month window. Injectable so tests are deterministic. */
  now: () => Date;
  /** Budget for all Cert Spotter pages together. */
  certSpotterTimeoutMs: number;
  crtShTimeoutMs: number;
  /**
   * Cert Spotter pages to read at most. Past this, the listing is treated as
   * no answer (its newest certificates would be missing) and crt.sh is asked.
   */
  certSpotterMaxPages: number;
}

const DEFAULTS: CertificateCheckOptions = {
  now: () => new Date(),
  certSpotterTimeoutMs: 8_000,
  crtShTimeoutMs: 20_000,
  certSpotterMaxPages: 10,
};

/** Pass needs more than this many days left on the Latest issued certificate. */
const WARNING_DAYS = 21;
const DAY_MS = 86_400_000;

/**
 * Certificate: the Latest issued certificate for the Hostname and its Issuance
 * history, from Certificate Transparency logs. Cert Spotter first, crt.sh as
 * the fallback; neither answering is Couldn't check.
 */
export function createCertificateCheck(overrides: Partial<CertificateCheckOptions> = {}): Check {
  const options = { ...DEFAULTS, ...overrides };
  return {
    id: 'certificate',
    async run({ hostname, fetch }): Promise<CheckResult> {
      const failures: Detail[] = [];
      for (const source of SOURCES) {
        try {
          const certificates = await source.lookup(fetch, hostname, options);
          return judge(hostname, source.name, certificates, options.now());
        } catch (error) {
          failures.push({ label: source.name, value: describeFailure(error) });
        }
      }
      return {
        check: 'certificate',
        status: 'couldnt-check',
        verdict: 'Couldn’t check — no response from the service',
        checkedName: hostname,
        details: failures,
      };
    },
  };
}

export const certificateCheck = createCertificateCheck();

function judge(hostname: string, source: CertificateSource, all: IssuedCertificate[], now: Date): CertificateResult {
  const byIssuance = [...all].sort((a, b) => b.notBefore.localeCompare(a.notBefore));
  const latest = byIssuance.find((c) => Date.parse(c.notAfter) > now.getTime()) ?? byIssuance[0] ?? null;
  const msLeft = latest ? Date.parse(latest.notAfter) - now.getTime() : 0;
  // Whole days, rounded toward zero both ways: 4.9 days left is 4, expired 4.9 days ago is -4.
  const daysLeft = latest ? Math.trunc(msLeft / DAY_MS) : null;
  const history = issuanceHistory(byIssuance, now);
  const certificate: CertificateData = { source, latest, daysLeft, history };
  const base = { check: 'certificate' as const, checkedName: hostname, certificate };

  if (!latest || daysLeft === null) {
    return {
      ...base,
      status: 'fail',
      verdict: 'No certificates found for this name',
      details: [{ label: 'Source', value: source }],
    };
  }

  const expired = msLeft <= 0;
  const details: Detail[] = [
    { label: 'Source', value: source },
    { label: 'Issuer', value: latest.issuer },
    { label: 'Issuer name', value: latest.issuerName },
    { label: 'Valid from', value: formatUtc(latest.notBefore) },
    { label: 'Valid until', value: formatUtc(latest.notAfter) },
    { label: 'Names', value: latest.dnsNames.join(', ') },
  ];
  if (expired) {
    const when = daysLeft === 0 ? 'today' : `${plural(-daysLeft, 'day')} ago`;
    return { ...base, status: 'fail', verdict: `Latest issued certificate expired ${when}`, details };
  }
  const status = daysLeft > WARNING_DAYS ? 'pass' : 'warning';
  const when = daysLeft === 0 ? 'today' : `in ${plural(daysLeft, 'day')}`;
  return { ...base, status, verdict: `Latest issued certificate expires ${when}`, details };
}

function issuanceHistory(byIssuance: IssuedCertificate[], now: Date): IssuanceHistory {
  const from = new Date(now);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  const groups = new Map<string, IssuedCertificate[]>();
  for (const c of byIssuance) {
    const issued = Date.parse(c.notBefore);
    if (issued < from.getTime() || issued > now.getTime()) continue;
    const group = groups.get(c.issuer) ?? [];
    group.push(c);
    groups.set(c.issuer, group);
  }
  return {
    from: from.toISOString(),
    to: now.toISOString(),
    issuers: [...groups].map(([issuer, certificates]) => ({ issuer, certificates })),
  };
}

// --- Sources ---------------------------------------------------------------

interface Source {
  name: CertificateSource;
  lookup(fetch: typeof globalThis.fetch, hostname: string, options: CertificateCheckOptions): Promise<IssuedCertificate[]>;
}

/** The fields of a Cert Spotter issuance we read (with `expand=dns_names&expand=issuer`). */
interface CertSpotterIssuance {
  id: string;
  dns_names?: string[];
  issuer?: { friendly_name?: string; name?: string };
  not_before: string;
  not_after: string;
}

/** The fields of a crt.sh JSON row we read. Dates carry no timezone; they are UTC. */
interface CrtShRow {
  id: number;
  issuer_name: string;
  name_value: string;
  not_before: string;
  not_after: string;
  serial_number: string;
}

const certSpotter: Source = {
  name: 'Cert Spotter',
  async lookup(fetch, hostname, { certSpotterTimeoutMs, certSpotterMaxPages }) {
    const signal = AbortSignal.timeout(certSpotterTimeoutMs);
    const base = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(hostname)}&expand=dns_names&expand=issuer`;
    const issuances: CertSpotterIssuance[] = [];
    // The Link header isn't readable from the browser, so page with `after=<last id>` until a page comes back empty.
    // Issuances come oldest first: the newest certificates are on the last page, so a partial listing is no answer.
    let after: string | null = null;
    for (let page = 0; ; page++) {
      if (page === certSpotterMaxPages) throw new IncompleteListingError();
      const rows = (await getJson(fetch, after ? `${base}&after=${encodeURIComponent(after)}` : base, signal)) as CertSpotterIssuance[];
      if (!Array.isArray(rows)) throw new Error('Unexpected response');
      if (rows.length === 0) break;
      issuances.push(...rows);
      after = rows[rows.length - 1].id;
    }
    return issuances.map((i) => ({
      id: String(i.id),
      issuer: i.issuer?.friendly_name || shortIssuer(i.issuer?.name ?? '') || 'Unknown issuer',
      issuerName: i.issuer?.name ?? '',
      dnsNames: i.dns_names ?? [],
      notBefore: new Date(i.not_before).toISOString(),
      notAfter: new Date(i.not_after).toISOString(),
    }));
  },
};

const crtSh: Source = {
  name: 'crt.sh',
  async lookup(fetch, hostname, { crtShTimeoutMs }) {
    const signal = AbortSignal.timeout(crtShTimeoutMs);
    const rows = (await getJson(fetch, `https://crt.sh/?q=${encodeURIComponent(hostname)}&output=json`, signal)) as CrtShRow[];
    if (!Array.isArray(rows)) throw new Error('Unexpected response');
    // crt.sh lists a precertificate and its final certificate separately: keep one per serial number.
    const bySerial = new Map<string, CrtShRow>();
    for (const row of rows) if (!bySerial.has(row.serial_number)) bySerial.set(row.serial_number, row);
    return [...bySerial.values()].map((row) => ({
      id: String(row.id),
      issuer: shortIssuer(row.issuer_name) || 'Unknown issuer',
      issuerName: row.issuer_name,
      dnsNames: row.name_value.split('\n').filter(Boolean),
      notBefore: utc(row.not_before),
      notAfter: utc(row.not_after),
    }));
  },
};

const SOURCES: readonly Source[] = [certSpotter, crtSh];

/** Any network error (including a 502 without CORS headers), non-OK status, timeout or bad JSON is no answer. */
async function getJson(fetch: typeof globalThis.fetch, url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** Cert Spotter has more pages than the cap allows; judging the oldest ones alone could raise a false Fail. */
class IncompleteListingError extends Error {
  constructor() {
    super('Too many certificates to list them all');
    this.name = 'IncompleteListingError';
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof IncompleteListingError) return error.message;
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'No answer in time';
  if (error instanceof Error && /^HTTP \d+$/.test(error.message)) return `No answer (${error.message})`;
  return 'No answer';
}

/** The organization of an issuer DN, without its legal suffix: "C=GB, O=Sectigo Limited, CN=..." -> "Sectigo". */
function shortIssuer(dn: string): string {
  const match = /(?:^|,\s*)O=("(?:[^"]|"")*"|[^,]*)/.exec(dn);
  if (!match) return '';
  const org = match[1].replace(/^"|"$/g, '').replace(/""/g, '"').trim();
  return org.replace(/,?\s+(Limited|Ltd\.?|LLC|Inc\.?|GmbH|B\.V\.|S\.A\.|S\.p\.A\.)$/i, '');
}

/** crt.sh timestamps have no timezone; they are UTC. */
function utc(timestamp: string): string {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(timestamp) ? timestamp : `${timestamp}Z`).toISOString();
}

function formatUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
