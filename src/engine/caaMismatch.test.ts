import { describe, expect, it } from 'vitest';
import { caaCheck } from './checks/caa';
import { createCertificateCheck, isCertificateResult } from './checks/certificate';
import { collectReport, runReport, type ReportOptions } from './report';
import type { Check } from './types';
import { fakeFetch, type FakeFetchOptions } from './__fixtures__/fakeFetch';

const TODAY = new Date('2026-11-13T12:00:00Z');
const certificate = createCertificateCheck({ now: () => TODAY });

/** The recorded responses, except that CAA queries for `name` answer with `records` (presentation form). */
function withCaa(name: string, records: string[], fake: FakeFetchOptions = {}): typeof fetch {
  const recorded = fakeFetch(fake);
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'https://cloudflare-dns.com' && url.searchParams.get('type') === 'CAA' && url.searchParams.get('name') === name) {
      const Answer = records.map((data) => ({ name, type: 257, TTL: 300, data }));
      return new Response(JSON.stringify({ Status: 0, Question: [{ name, type: 257 }], Answer }), {
        headers: { 'content-type': 'application/dns-json' },
      });
    }
    return recorded(input, init);
  };
}

async function report(target: string, options: ReportOptions) {
  const r = await collectReport(target, options);
  if (r.kind !== 'report') throw new Error(`expected a report, got ${r.kind}`);
  const cert = r.results.find((x) => x.check === 'certificate');
  if (!cert || !isCertificateResult(cert)) throw new Error('no Certificate result');
  return { ...r, cert, flags: cert.certificate.history.issuers.map((g) => [g.issuer, g.caaMismatch ?? null]) };
}

describe('CAA mismatch in the Issuance history', () => {
  it('flags an issuer the current CAA set does not allow, naming its CA domain and the allowed CAs', async () => {
    const { flags } = await report('github.com', {
      fetch: withCaa('github.com', ['0 issue "sectigo.com"', '0 iodef "mailto:x@github.com"']),
      checks: [caaCheck, certificate],
    });

    expect(flags).toEqual([
      ['Sectigo', null],
      ["Let's Encrypt", { caDomains: ['letsencrypt.org'], allowed: ['sectigo.com'], foundAt: 'github.com' }],
    ]);
  });

  it('flags nothing when every issuer is allowed (Sectigo matches comodoca.com, Google Trust Services pki.goog)', async () => {
    const { flags } = await report('crypto.cloudflare.com', {
      fetch: fakeFetch({ down: ['certspotter'] }),
      checks: [caaCheck, certificate],
    });

    expect(flags).toEqual([
      ["Let's Encrypt", null],
      ['Google Trust Services', null],
      ['Sectigo', null],
    ]);
  });

  it('flags nothing when no CAA set applies', async () => {
    const { flags } = await report('github.com', {
      fetch: withCaa('github.com', [], {}),
      checks: [caaCheck, certificate],
    });
    expect(flags.every(([, flag]) => flag === null)).toBe(true);
  });

  it('flags nothing when the CAA Check is excluded', async () => {
    const { flags } = await report('github.com', {
      fetch: withCaa('github.com', ['0 issue "digicert.com"']),
      checks: [certificate],
    });
    expect(flags.every(([, flag]) => flag === null)).toBe(true);
  });

  it('flags nothing for an issuer with no known CAA domain', async () => {
    const unknownIssuer = fakeFetch();
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.origin === 'https://api.certspotter.com') {
        const rows = await (await unknownIssuer(input, init)).json();
        const renamed = rows.map((r: { issuer?: object }) => ({ ...r, issuer: { friendly_name: 'Obscure CA', name: 'O=Obscure CA' } }));
        return new Response(JSON.stringify(renamed), { headers: { 'content-type': 'application/json' } });
      }
      return withCaa('github.com', ['0 issue "sectigo.com"'])(input, init);
    };
    const { flags } = await report('github.com', { fetch, checks: [caaCheck, certificate] });
    expect(flags).toEqual([['Obscure CA', null]]);
  });

  it('uses issuewild for wildcard certificates when the CAA set has issuewild tags', async () => {
    // crypto.cloudflare.com's Let's Encrypt certificates are wildcards; letsencrypt.org is allowed by issue only.
    const { flags } = await report('crypto.cloudflare.com', {
      fetch: withCaa('crypto.cloudflare.com', ['0 issue "letsencrypt.org"', '0 issue "pki.goog"', '0 issue "sectigo.com"', '0 issuewild "pki.goog"'], {
        down: ['certspotter'],
      }),
      checks: [caaCheck, certificate],
    });
    expect(flags[0]).toEqual(["Let's Encrypt", { caDomains: ['letsencrypt.org'], allowed: ['pki.goog'], foundAt: 'crypto.cloudflare.com' }]);
  });

  it('re-sends the Certificate result with its flags when the CAA Check settles after it', async () => {
    const caaLate = withCaa('github.com', ['0 issue "sectigo.com"']);
    const fetch: typeof globalThis.fetch = async (input, init) => {
      if (new URL(String(input)).searchParams.get('type') === 'CAA') await new Promise((r) => setTimeout(r, 50));
      return caaLate(input, init);
    };
    const order: string[] = [];
    for await (const event of runReport('github.com', { fetch, checks: [caaCheck, certificate] })) {
      if (event.type !== 'check') continue;
      const flagged = isCertificateResult(event.result) && event.result.certificate.history.issuers.some((g) => g.caaMismatch);
      order.push(`${event.result.check}${flagged ? ' (flagged)' : ''}`);
    }
    expect(order).toEqual(['certificate', 'caa', 'certificate (flagged)']);

    const { flags, results } = await report('github.com', { fetch, checks: [caaCheck, certificate] });
    expect(results).toHaveLength(2);
    expect(flags[1][1]).toMatchObject({ caDomains: ['letsencrypt.org'] });
  });

  it('changes no Status and no Grade', async () => {
    const options = (fetch: typeof globalThis.fetch) => ({ fetch, checks: [caaCheck, certificate] as Check[] });
    const flagged = await report('github.com', options(withCaa('github.com', ['0 issue "sectigo.com"'])));
    const clean = await report('github.com', options(withCaa('github.com', ['0 issue "sectigo.com"', '0 issue "letsencrypt.org"'])));

    expect(flagged.results.map((r) => [r.check, r.status])).toEqual(clean.results.map((r) => [r.check, r.status]));
    expect(flagged.grading).toEqual(clean.grading);
  });
});
