import type { CheckId, Status } from '../engine/types';

/**
 * Explanation copy for each Check x Status, kept apart from the Check logic.
 * Fixes are generic and never assume a particular DNS provider.
 */
export interface Explanation {
  /** "What this means", in plain English. */
  whatThisMeans: string;
  /** "How to fix". Omitted when there is nothing to do. */
  howToFix?: string;
  /** Optional copy-paste example for the fix. */
  example?: string;
  /** Optional link shown after the fix, e.g. a submission site. */
  link?: { label: string; href: string };
}

/** Statuses a Check can produce. Couldn't check uses the shared copy below unless a Check overrides it. */
type CheckCopy = Partial<Record<Status, Explanation>>;

const couldntCheck: Explanation = {
  whatThisMeans:
    'The service this check relies on did not answer, so we could not look. This says nothing about your domain, and it does not count toward the Grade.',
  howToFix: 'Nothing to fix on your side. Try running the report again in a minute.',
};

/** What each Check looks at, in one line. Shown under the card heading, including on "not built yet" cards. */
export const checkSummary: Record<CheckId, string> = {
  dnssec: 'Whether your DNS answers are signed, so they can’t be forged.',
  caa: 'Which certificate authorities may issue certificates for this name.',
  nameservers: 'Whether your DNS is spread across providers and networks.',
  'https-record': 'Whether browsers learn up front how to connect fast and privately.',
  certificate: 'The latest certificate issued for this name, from public logs.',
  'hsts-preload': 'Whether browsers are built to always use HTTPS for this name.',
};

/** Add an entry here when you build a Check. */
const explanations: Partial<Record<CheckId, CheckCopy>> = {
  dnssec: {
    pass: {
      whatThisMeans:
        'Your Zone apex is signed with DNSSEC: the parent zone publishes a DS record for it, your zone publishes its DNSKEY, and resolvers report your answers as validated. Nobody can forge DNS answers for your domain to send visitors elsewhere.',
    },
    warning: {
      whatThisMeans:
        'Your Zone apex publishes DNSSEC keys (DNSKEY), but the parent zone has no DS record for them. DNSSEC is only half set up: resolvers can’t link your keys to the chain of trust, so they treat your domain as unsigned and your answers can still be forged.',
      howToFix:
        'Copy the DS record (or the key details) from your DNS provider’s DNSSEC settings and add it at your registrar, where you bought the domain. If your DNS provider is also your registrar, this is often a single “enable DNSSEC” switch.',
      example: 'example.com. 3600 IN DS 2371 13 2 32996839a6d808afe3eb4a795a0e6a7a39a76fc52ff228b22b76f6d63826f2b9',
    },
    fail: {
      whatThisMeans:
        'Your Zone apex does not use DNSSEC. DNS answers for your domain are not signed, so an attacker who can tamper with DNS traffic or poison a resolver’s cache could send your visitors to a different server without anyone noticing.',
      howToFix:
        'First, turn on DNSSEC at your DNS provider (where your DNS records are managed); it will sign your zone and show you a DS record. Then add that DS record at your registrar (where you bought the domain). Many providers do both for you when they are also your registrar. Check again after an hour or so.',
    },
  },
  caa: {
    pass: {
      whatThisMeans:
        'Your domain publishes a CAA record listing the certificate authorities allowed to issue certificates for this name. Any other authority must refuse, which makes a mistaken or fraudulent certificate much harder to get. If the record was found on a parent name, it applies here too.',
      howToFix:
        'Nothing to fix. If you switch certificate provider, add the new authority to your CAA record first, or its certificates will be refused.',
    },
    fail: {
      whatThisMeans:
        'No CAA record was found for this name or any name above it, so any certificate authority in the world may issue a certificate for it. A CAA record lets you say which ones may.',
      howToFix:
        'Find out which certificate authority issues your certificates (your hosting provider or CDN can tell you), then add a CAA record at your domain in your DNS settings naming it. Add one "issue" line per authority you use. An optional "iodef" line gives an address where authorities can report refused requests.',
      example:
        'example.com. 3600 IN CAA 0 issue "letsencrypt.org"\nexample.com. 3600 IN CAA 0 iodef "mailto:security@example.com"',
    },
  },
  'https-record': {
    pass: {
      whatThisMeans:
        'Your domain publishes an HTTPS record. It tells browsers up front how to connect: which protocols your server speaks (for example HTTP/3) and, if ECH is present, how to hide which site is being visited from anyone watching the network. Browsers can connect faster and more privately.',
    },
    warning: {
      whatThisMeans:
        'Your domain does not publish an HTTPS record. Your site still works over HTTPS, but browsers have to discover your server’s capabilities the slow way, and cannot use Encrypted Client Hello (ECH).',
      howToFix:
        'Many CDNs and DNS providers add an HTTPS record automatically, often as a setting such as "HTTP/3" or "HTTPS records". If yours does not, add an HTTPS record at this name in your DNS settings that lists the protocols your server supports.',
      example: 'example.com. 3600 IN HTTPS 1 . alpn=h3,h2',
    },
  },
  'hsts-preload': {
    pass: {
      whatThisMeans:
        'This name is on the HSTS Preload list built into Chrome, Firefox, Safari and Edge, either directly or through a parent domain that covers its subdomains. Browsers will only ever connect to it over HTTPS, even on the very first visit, so nobody on the network can downgrade a visitor to plain HTTP.',
    },
    warning: {
      whatThisMeans:
        'This name is not on the HSTS Preload list. A browser that has never visited it before may make its first connection over plain HTTP before your site redirects to HTTPS, and someone on the network can intercept that first request.',
      howToFix:
        'Serve every page over HTTPS and redirect HTTP to HTTPS. Then send the Strict-Transport-Security header from your domain (and every subdomain) with a max-age of at least one year, includeSubDomains and preload. Once it is in place, submit your domain to the Preload list. Only do this when every subdomain supports HTTPS: getting removed from the list takes months.',
      example: 'Strict-Transport-Security: max-age=63072000; includeSubDomains; preload',
      link: { label: 'Submit your domain at hstspreload.org', href: 'https://hstspreload.org/' },
    },
  },
  certificate: {
    pass: {
      whatThisMeans:
        'The latest certificate issued for this name, as recorded in public Certificate Transparency logs, has more than three weeks left before it expires. This is the latest certificate issued, which is not necessarily the one your site is serving right now.',
    },
    warning: {
      whatThisMeans:
        'The latest certificate issued for this name expires within three weeks. Certificates that renew automatically are usually replaced about a month before they expire, so renewal may be stuck. This is the latest certificate issued according to public logs, not necessarily the one your site is serving.',
      howToFix:
        'Check that automatic renewal is working (for example in your hosting or CDN dashboard, or your ACME client’s logs) and renew the certificate now if it is not. Then make sure your server is actually using the new certificate.',
    },
    fail: {
      whatThisMeans:
        'Public Certificate Transparency logs show either no certificate at all for this name, or only certificates that have already expired. Browsers show a full-page security warning for an expired or missing certificate, so visitors may be unable to reach your site over HTTPS.',
      howToFix:
        'Issue a new certificate for this name, ideally from a certificate authority that renews automatically (most hosts and CDNs offer free certificates via ACME). If this name is not meant to serve a website, you can ignore this result.',
    },
    info: {
      whatThisMeans:
        'Every certificate issued for this name in the last 12 months, grouped by the certificate authority that issued it. Regular renewals from the same authority are normal. An authority you do not recognise may mean a forgotten service, or a certificate issued without your knowledge, and is worth looking into.',
    },
  },
  nameservers: {
    pass: {
      whatThisMeans:
        'Your domain has at least two nameservers, run by more than one provider and sitting in more than one network. If one provider has an outage or one network becomes unreachable, the others keep answering, so your domain stays reachable.',
    },
    warning: {
      whatThisMeans:
        'Your domain has more than one nameserver, but they all belong to one provider or all sit in the same /24 network. That is a single point of failure: one provider outage, one misconfiguration or one network problem can take every nameserver down at once, and your domain then disappears from the internet.',
      howToFix:
        'Add nameservers from a second, independent DNS provider (or on a different network) and keep both providers serving the same records. Many DNS providers support this as "secondary DNS", copying your zone automatically. Then list the nameservers from both providers at your registrar.',
      example: 'example.com. 86400 IN NS ns1.provider-one.example.\nexample.com. 86400 IN NS ns1.provider-two.example.',
    },
    fail: {
      whatThisMeans:
        'Your domain has fewer than two nameservers. If that one server goes down or becomes unreachable, nobody can look up your domain: your website, email and everything else on it stop working.',
      howToFix:
        'Add at least one more nameserver, ideally from a different provider and on a different network, and serve the same records from it. Then list all your nameservers at your registrar, so the delegation matches.',
      example: 'example.com. 86400 IN NS ns1.provider-one.example.\nexample.com. 86400 IN NS ns1.provider-two.example.',
    },
  },
};

/**
 * Copy for a Check result's `reason`, for a Status that covers several cases
 * (e.g. DNSSEC Fail: broken vs not enabled). Takes precedence over the Status copy.
 */
const reasonExplanations: Partial<Record<CheckId, Record<string, Explanation>>> = {
  caa: {
    'no-ca-named': {
      whatThisMeans:
        'A CAA record exists but doesn’t name any certificate authority: it has no "issue" or "issuewild" line (for example, only an "iodef" reporting address). Without one, any certificate authority in the world may still issue a certificate for this name.',
      howToFix:
        'Find out which certificate authority issues your certificates (your hosting provider or CDN can tell you), then add an "issue" line naming it next to your existing CAA record, at the name listed under "Found at". Add one "issue" line per authority you use.',
      example: 'example.com. 3600 IN CAA 0 issue "letsencrypt.org"',
    },
  },
  dnssec: {
    'not-validated': {
      whatThisMeans:
        'Your Zone apex is signed and the parent zone has a DS record for it, but resolvers did not report your answers as validated. This usually means the signing algorithm or DS digest type is one resolvers don’t support, so they treat your domain as unsigned and your answers get no protection.',
      howToFix:
        'In your DNS provider’s DNSSEC settings, re-sign the zone with a widely supported algorithm such as ECDSA P-256 (algorithm 13). Then replace the DS record at your registrar with the new one your DNS provider shows, using digest type 2 (SHA-256).',
    },
    broken: {
      whatThisMeans:
        'DNSSEC on your Zone apex is broken: your answers fail validation. Resolvers that check DNSSEC, including Google Public DNS, Cloudflare 1.1.1.1 and many ISPs, refuse to answer for your domain, so for a large share of visitors your website and email may be unreachable. This is urgent.',
      howToFix:
        'Usually the DS record at your registrar no longer matches the keys your DNS provider signs with, often after a provider change or a key rollover. Compare the DS record listed in the details with the one your DNS provider shows and replace it at your registrar. If you can’t fix it quickly, remove the DS record at your registrar to turn DNSSEC off until you can; changes take effect as the old DS record expires from caches.',
    },
  },
};

export function explanationFor(check: CheckId, status: Status, reason?: string): Explanation | undefined {
  const forReason = reason === undefined ? undefined : reasonExplanations[check]?.[reason];
  return forReason ?? explanations[check]?.[status] ?? (status === 'couldnt-check' ? couldntCheck : undefined);
}
