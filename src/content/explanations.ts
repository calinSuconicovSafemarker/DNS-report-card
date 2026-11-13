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
}

/** Statuses a Check can produce. Couldn't check uses the shared copy below unless a Check overrides it. */
type CheckCopy = Partial<Record<Status, Explanation>>;

const couldntCheck: Explanation = {
  whatThisMeans:
    'The service this check relies on did not answer, so we could not look. This says nothing about your domain, and it does not count toward the Grade.',
  howToFix: 'Nothing to fix on your side. Try running the report again in a minute.',
};

/** Every CheckId must have an entry; add one here when you add a Check. */
const explanations: Record<CheckId, CheckCopy> = {
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
};

export function explanationFor(check: CheckId, status: Status): Explanation | undefined {
  return explanations[check][status] ?? (status === 'couldnt-check' ? couldntCheck : undefined);
}
