import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type FakeService = 'cloudflare' | 'google';

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
 *   Like the real API, it returns 400 when `Accept: application/dns-json` is missing.
 * - `google/<name>.<TYPE>.json` answers `https://dns.google/resolve?name=<name>&type=<TYPE>`.
 *   Like the browser, it fails with a network error when the request carries
 *   any custom header, because Google's CORS preflight has no CORS headers.
 *
 * Later services (Cert Spotter, crt.sh, Preload list) add a branch here.
 * Any URL without a fixture rejects like a network error, so unexpected
 * requests show up as test failures (or Couldn't check), never as silent passes.
 */
export function fakeFetch(options: FakeFetchOptions = {}): typeof fetch {
  const fixtures: Record<FakeService, Map<string, string>> = {
    cloudflare: loadDir('cloudflare'),
    google: loadDir('google'),
  };

  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const service = serviceFor(url);
    if (service && options.hang?.includes(service)) return hang(init?.signal);
    if (service && options.down?.includes(service)) throw new TypeError(`fakeFetch: ${service} is down`);

    const key = `${url.searchParams.get('name')}.${url.searchParams.get('type')}.json`;
    const headers = new Headers(init?.headers);

    if (service === 'cloudflare') {
      if (headers.get('accept') !== 'application/dns-json') return new Response('Bad Request', { status: 400 });
      const body = fixtures.cloudflare.get(key);
      if (body !== undefined) return json(body);
    }

    if (service === 'google') {
      if ([...headers.keys()].length > 0) throw new TypeError('fakeFetch: CORS preflight to dns.google failed');
      const body = fixtures.google.get(key);
      if (body !== undefined) return json(body);
    }

    throw new TypeError(`fakeFetch: no fixture for ${url.href}`);
  };
}

function serviceFor(url: URL): FakeService | null {
  if (url.origin === 'https://cloudflare-dns.com' && url.pathname === '/dns-query') return 'cloudflare';
  if (url.origin === 'https://dns.google' && url.pathname === '/resolve') return 'google';
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
