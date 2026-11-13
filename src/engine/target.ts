export type TargetRejection = 'empty' | 'ip-address' | 'localhost' | 'single-label' | 'invalid';

export type NormalizedTarget =
  | { ok: true; hostname: string }
  | { ok: false; reason: TargetRejection; message: string };

const PUBLIC_ONLY = 'Only public domain names can be checked, like example.com.';

const MESSAGES: Record<TargetRejection, string> = {
  empty: 'Type a domain name or a web address, like example.com.',
  'ip-address': `That looks like an IP address. ${PUBLIC_ONLY}`,
  localhost: `That's a name for your own computer. ${PUBLIC_ONLY}`,
  'single-label': `That name has no dot in it. ${PUBLIC_ONLY}`,
  invalid: `That doesn't look like a valid domain name. ${PUBLIC_ONLY}`,
};

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const LABEL = /^(?!-)[a-z0-9_-]{1,63}(?<!-)$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Target -> Hostname: strips scheme, credentials, path, port, query and
 * fragment; lowercases; converts IDN to punycode; drops a trailing dot.
 * Rejects IP addresses, localhost and single-label names with a friendly message.
 */
export function normalizeTarget(target: string): NormalizedTarget {
  const trimmed = target.trim();
  if (trimmed === '') return reject('empty');

  const withoutScheme = trimmed.replace(SCHEME, '');
  // A bare IPv6 address (`2001:db8::1`) isn't parseable as a URL authority.
  if (/^[0-9a-f:.]*:[0-9a-f:.]*:[0-9a-f:.]*$/i.test(withoutScheme.split('/')[0])) return reject('ip-address');

  let hostname: string;
  try {
    // The WHATWG URL parser lowercases, converts IDN to punycode and normalizes IPv4 forms.
    hostname = new URL(`http://${withoutScheme}`).hostname;
  } catch {
    return reject('invalid');
  }

  hostname = hostname.replace(/\.$/, '');
  if (hostname.startsWith('[') || IPV4.test(hostname)) return reject('ip-address');
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return reject('localhost');
  if (hostname === '') return reject('invalid');

  const labels = hostname.split('.');
  if (hostname.length > 253 || !labels.every((label) => LABEL.test(label))) return reject('invalid');
  if (labels.length < 2) return reject('single-label');

  return { ok: true, hostname };
}

function reject(reason: TargetRejection): NormalizedTarget {
  return { ok: false, reason, message: MESSAGES[reason] };
}
