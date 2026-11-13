import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PRELOAD_LIST_URL } from '../checks/hstsPreload';

export type FakeService = 'cloudflare' | 'google' | 'preload';

export interface FakeFetchOptions {
  /** Services that fail like a network error (connection refused, CORS block). */
  down?: FakeService[];
  /** Services that never answer (until the request is aborted). */
  hang?: FakeService[];
}

/**
 * A fake `fetch` that serves recorded real-world responses.
 *
 * Fixture layout: `__fixtures__/<service>/<file>`.
 * - `cloudflare/<name>.<TYPE>.json` answers
 *   `https://cloudflare-dns.com/dns-query?name=<name>&type=<TYPE>`.
 *   A query with `cd=1` prefers `<name>.<TYPE>.cd.json` when recorded.
 *   Like the real API, it returns 400 when `Accept: application/dns-json` is missing.
 * - `google/<name>.<TYPE>.json` answers `https://dns.google/resolve?name=<name>&type=<TYPE>`.
 *   Like the browser, it fails with a network error when the request carries
 *   any custom header, because Google's CORS preflight has no CORS headers.
 *
 * - `preload/transport_security_state_static.json` answers the Preload list URL on jsDelivr
 *   (a trimmed copy that keeps the real file's `//` comment lines).
 *
 * Later services (Cert Spotter, crt.sh) add a branch here.
 * Any URL without a fixture rejects like a network error, so unexpected
 * requests show up as test failures (or Couldn't check), never as silent passes.
 */
export function fakeFetch(options: FakeFetchOptions = {}): typeof fetch {
  const fixtures: Record<FakeService, Map<string, string>> = {
    cloudflare: loadDir('cloudflare'),
    google: loadDir('google'),
    preload: loadDir('preload'),
  };

  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const service = serviceFor(url);
    if (service && options.hang?.includes(service)) return hang(init?.signal);
    if (service && options.down?.includes(service)) throw new TypeError(`fakeFetch: ${service} is down`);

    const base = `${url.searchParams.get('name')}.${url.searchParams.get('type')}`;
    // A checking-disabled query prefers `<name>.<TYPE>.cd.json`, then falls back to the plain recording.
    const keys = url.searchParams.get('cd') === '1' ? [`${base}.cd.json`, `${base}.json`] : [`${base}.json`];
    const lookup = (dir: Map<string, string>) => keys.map((k) => dir.get(k)).find((b) => b !== undefined);
    const headers = new Headers(init?.headers);

    if (service === 'cloudflare') {
      if (headers.get('accept') !== 'application/dns-json') return new Response('Bad Request', { status: 400 });
      const body = lookup(fixtures.cloudflare);
      if (body !== undefined) return json(body);
    }

    if (service === 'google') {
      if ([...headers.keys()].length > 0) throw new TypeError('fakeFetch: CORS preflight to dns.google failed');
      const body = lookup(fixtures.google);
      if (body !== undefined) return json(body);
    }

    if (service === 'preload') return new Response(fixtures.preload.get('transport_security_state_static.json'));

    throw new TypeError(`fakeFetch: no fixture for ${url.href}`);
  };
}

function serviceFor(url: URL): FakeService | null {
  if (url.origin === 'https://cloudflare-dns.com' && url.pathname === '/dns-query') return 'cloudflare';
  if (url.origin === 'https://dns.google' && url.pathname === '/resolve') return 'google';
  if (url.href === PRELOAD_LIST_URL) return 'preload';
  return null;
}

function hang(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason));
  });
}

function loadDir(service: string): Map<string, string> {
  const dir = join(import.meta.dirname, service);
  return new Map(readdirSync(dir).map((file) => [file, readFileSync(join(dir, file), 'utf8')]));
}

function json(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/dns-json' } });
}
