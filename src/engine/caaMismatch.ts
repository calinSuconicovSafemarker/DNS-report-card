import { caaPolicyOf, type CaaPolicy } from './checks/caa';
import type { CertificateResult, IssuedCertificate, IssuerGroup } from './checks/certificate';
import { isCertificateResult } from './checks/certificate';
import type { CheckResult, Refiner } from './types';

/**
 * The CAA domains each certificate authority answers to, keyed by a canonical
 * CA name. An issuer missing here is never flagged: an unknown CA is not
 * evidence of a problem.
 */
const CA_DOMAINS = {
  "let's encrypt": ['letsencrypt.org'],
  'google trust services': ['pki.goog'],
  sectigo: ['sectigo.com', 'comodoca.com', 'comodo.com', 'usertrust.com', 'trust-provider.com'],
  zerossl: ['sectigo.com', 'zerossl.com'],
  digicert: ['digicert.com', 'www.digicert.com', 'digicert.ne.jp', 'symantec.com', 'thawte.com', 'geotrust.com', 'rapidssl.com'],
  globalsign: ['globalsign.com'],
  amazon: ['amazon.com', 'amazontrust.com', 'awstrust.com', 'amazonaws.com'],
  'ssl.com': ['ssl.com'],
  entrust: ['entrust.net'],
  godaddy: ['godaddy.com', 'starfieldtech.com'],
  certainly: ['certainly.com'],
  buypass: ['buypass.com', 'buypass.no'],
} as const satisfies Record<string, readonly string[]>;

type CaName = keyof typeof CA_DOMAINS;

/**
 * Other short issuer names the Issuance history can group on (Cert Spotter's
 * friendly name, or the issuer DN's organization without its legal suffix),
 * mapped to the canonical CA name. Lowercase keys.
 */
const ISSUER_ALIASES: Record<string, CaName> = {
  comodo: 'sectigo',
  'comodo ca': 'sectigo',
  'globalsign nv-sa': 'globalsign',
  'entrust, inc.': 'entrust',
  'godaddy.com': 'godaddy',
  'starfield technologies': 'godaddy',
};

/** The CAA domains of an issuer by its short name, or undefined for an unknown CA. */
function caaDomainsOf(issuer: string): readonly string[] | undefined {
  const key = issuer.trim().toLowerCase();
  const name = Object.hasOwn(CA_DOMAINS, key) ? (key as CaName) : Object.hasOwn(ISSUER_ALIASES, key) ? ISSUER_ALIASES[key] : undefined;
  return name && CA_DOMAINS[name];
}

/**
 * Refiner: once both the Certificate and CAA Checks have settled, flags the
 * Issuance history issuers the CAA set does not allow. Leaves the result as is
 * when there is nothing to flag.
 */
export const caaMismatchRefiner: Refiner = (result, settled) => {
  const caa = settled.get('caa');
  if (!caa || !isCertificateResult(result)) return result;
  const flagged = flagCaaMismatches(result, caa);
  return flagged.certificate.history.issuers.some((g) => g.caaMismatch) ? flagged : result;
};

/** Set on an IssuerGroup whose certificates the current CAA set would not allow. Informational only. */
export interface CaaMismatch {
  /** The issuer's CAA domains (none of them is allowed). */
  caDomains: string[];
  /** The CA domains the CAA set allows for the offending certificates (issuewild for wildcards when set, else issue). */
  allowed: string[];
  /** Where the CAA set was found. */
  foundAt: string;
}

/**
 * Flags the issuers in the Issuance history that the CAA policy in `caa` does
 * not allow. No flags when no CAA set applies, the CAA Check couldn't check, or
 * the CAA set restricts nothing. Status, verdict and details are unchanged.
 */
export function flagCaaMismatches(certificate: CertificateResult, caa: CheckResult): CertificateResult {
  const policy = caaPolicyOf(caa);
  // A CAA set without issue/issuewild tags (the CAA Fail case) lets any CA issue.
  if (!policy || caa.status !== 'pass') return certificate;
  const issuers = certificate.certificate.history.issuers.map((group) => withMismatch(group, policy));
  return { ...certificate, certificate: { ...certificate.certificate, history: { ...certificate.certificate.history, issuers } } };
}

function withMismatch(group: IssuerGroup, policy: CaaPolicy): IssuerGroup {
  const { caaMismatch: _, ...plain } = group;
  const caDomains = caaDomainsOf(group.issuer);
  if (!caDomains) return plain;
  for (const cert of group.certificates) {
    const allowed = allowedFor(cert, policy);
    if (allowed && !caDomains.some((d) => allowed.includes(d))) {
      return { ...plain, caaMismatch: { caDomains: [...caDomains], allowed, foundAt: policy.foundAt } };
    }
  }
  return plain;
}

/**
 * The CA domains allowed to issue `cert`, or null when the policy doesn't restrict it.
 * `issuewild` governs wildcard certificates when present. The policy can't tell
 * `issue ";"` from no `issue` tag, so an empty list is read as unrestricted:
 * that can miss a flag, but never raises a false one.
 */
function allowedFor(cert: IssuedCertificate, policy: CaaPolicy): string[] | null {
  const wildcard = cert.dnsNames.some((n) => n.startsWith('*.'));
  const allowed = wildcard && policy.issuewild.length > 0 ? policy.issuewild : policy.issue;
  return allowed.length > 0 ? allowed : null;
}
