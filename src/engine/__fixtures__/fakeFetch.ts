import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A fake `fetch` that serves recorded real-world responses.
 *
 * Fixture layout: `__fixtures__/<service>/<file>`.
 * - `cloudflare/<name>.<TYPE>.json` answers
 *   `https://cloudflare-dns.com/dns-query?name=<name>&type=<TYPE>`.
 *   Like the real API, it returns 400 when `Accept: application/dns-json` is missing.
 *
 * Later services (Google DoH, Cert Spotter, crt.sh, Preload list) add a branch here.
 * Any URL without a fixture rejects like a network error, so unexpected
 * requests show up as test failures (or Couldn't check), never as silent passes.
 */
export function fakeFetch(): typeof fetch {
  const cloudflare = loadDir('cloudflare');

  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

    if (url.origin === 'https://cloudflare-dns.com' && url.pathname === '/dns-query') {
      const accept = new Headers(init?.headers).get('accept');
      if (accept !== 'application/dns-json') return new Response('Bad Request', { status: 400 });
      const key = `${url.searchParams.get('name')}.${url.searchParams.get('type')}.json`;
      const body = cloudflare.get(key);
      if (body !== undefined) return json(body);
    }

    throw new TypeError(`fakeFetch: no fixture for ${url.href}`);
  };
}

function loadDir(service: string): Map<string, string> {
  const dir = join(import.meta.dirname, service);
  return new Map(readdirSync(dir).map((file) => [file, readFileSync(join(dir, file), 'utf8')]));
}

function json(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/dns-json' } });
}
