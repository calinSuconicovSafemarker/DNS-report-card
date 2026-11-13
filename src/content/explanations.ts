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

export function explanationFor(check: CheckId, status: Status): Explanation | undefined {
  return explanations[check]?.[status] ?? (status === 'couldnt-check' ? couldntCheck : undefined);
}
