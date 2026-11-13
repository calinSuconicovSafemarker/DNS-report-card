import type { Check, CheckResult } from '../types';

/**
 * Chromium's Preload list, via jsDelivr (ADR 0002: never the hstspreload.org API,
 * which only allows localhost as a CORS origin). About 10 MB raw; the browser's
 * HTTP cache serves repeat visits.
 */
export const PRELOAD_LIST_URL =
  'https://cdn.jsdelivr.net/gh/chromium/chromium@main/net/http/transport_security_state_static.json';

const PRELOAD_LIST_TIMEOUT_MS = 10_000;

interface PreloadEntry {
  name: string;
  mode?: string;
  include_subdomains?: boolean;
}

/** HSTS preload: Pass when the Hostname, or a parent with include-subdomains, is on the Preload list. Never Fail. */
export const hstsPreloadCheck: Check = {
  id: 'hsts-preload',
  async run({ hostname, fetch }): Promise<CheckResult> {
    const entries = await fetchPreloadList(fetch);
    const match = findMatch(entries, hostname);

    if (!match) {
      return {
        check: 'hsts-preload',
        status: 'warning',
        verdict: 'Not on the Preload list',
        checkedName: hostname,
        details: [],
      };
    }

    const viaParent = match.name !== hostname;
    return {
      check: 'hsts-preload',
      status: 'pass',
      verdict: viaParent ? `Preloaded via ${match.name} (includes subdomains)` : 'On the Preload list',
      checkedName: hostname,
      details: [
        { label: 'Matched', value: match.name },
        { label: 'Include subdomains', value: match.include_subdomains ? 'Yes' : 'No' },
      ],
    };
  },
};

/** Download and parse the list. Throws on network failure, timeout, bad status or bad JSON (→ Couldn't check). */
async function fetchPreloadList(fetchImpl: typeof fetch): Promise<Map<string, PreloadEntry>> {
  const response = await fetchImpl(PRELOAD_LIST_URL, { signal: AbortSignal.timeout(PRELOAD_LIST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Preload list download failed: HTTP ${response.status}`);
  const text = await response.text();
  // The file is JSON with `//` comment lines; drop them before parsing.
  const json = JSON.parse(text.replace(/^\s*\/\/.*$/gm, '')) as { entries?: unknown };
  if (!Array.isArray(json.entries)) throw new Error('Preload list has no entries');
  const entries = new Map<string, PreloadEntry>();
  for (const entry of json.entries as PreloadEntry[]) {
    // Pinning-only entries don't force HTTPS.
    if (entry && typeof entry.name === 'string' && entry.mode === 'force-https') entries.set(entry.name.toLowerCase(), entry);
  }
  return entries;
}

/** The Hostname's own entry, or the nearest parent entry that includes subdomains. */
function findMatch(entries: Map<string, PreloadEntry>, hostname: string): PreloadEntry | undefined {
  const own = entries.get(hostname);
  if (own) return own;
  const labels = hostname.split('.');
  for (let i = 1; i < labels.length; i++) {
    const parent = entries.get(labels.slice(i).join('.'));
    if (parent?.include_subdomains) return parent;
  }
  return undefined;
}
