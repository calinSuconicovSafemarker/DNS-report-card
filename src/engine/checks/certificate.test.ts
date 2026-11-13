import { describe, expect, it } from 'vitest';
import { createCertificateCheck, isCertificateResult, type CertificateCheckOptions } from './certificate';
import { collectReport } from '../report';
import { fakeFetch, type FakeFetchOptions } from '../__fixtures__/fakeFetch';

const TODAY = new Date('2026-11-13T12:00:00Z');

async function certificateResult(
  target: string,
  { today = TODAY, fake = {}, check = {}, fetch }: {
    today?: Date;
    fake?: FakeFetchOptions;
    check?: Partial<CertificateCheckOptions>;
    fetch?: typeof globalThis.fetch;
  } = {},
) {
  const r = await collectReport(target, {
    fetch: fetch ?? fakeFetch(fake),
    checks: [createCertificateCheck({ now: () => today, ...check })],
  });
  if (r.kind !== 'report') throw new Error(`expected a report, got ${r.kind}`);
  const result = r.results.find((x) => x.check === 'certificate');
  if (!result) throw new Error('no Certificate result');
  return result;
}

describe('Certificate Check', () => {
  it('passes from Cert Spotter, reading every page, when the Latest issued certificate has more than 21 days left', async () => {
    const requested: string[] = [];
    const recorded = fakeFetch();
    const spy: typeof fetch = (input, init) => {
      requested.push(String(input));
      return recorded(input, init);
    };

    const result = await certificateResult('github.com', { fetch: spy });

    expect(result).toMatchObject({ status: 'pass', checkedName: 'github.com' });
    expect(result.verdict).toBe('Latest issued certificate expires in 75 days');
    expect(result.details).toContainEqual({ label: 'Source', value: 'Cert Spotter' });
    expect(result.details).toContainEqual({ label: 'Issuer', value: 'Sectigo' });
    expect(result.details).toContainEqual({ label: 'Valid until', value: '2027-01-27 23:59 UTC' });
    // Three pages: two with issuances, then an empty one that ends the listing.
    expect(requested.filter((u) => u.startsWith('https://api.certspotter.com/'))).toHaveLength(3);
    expect(requested.some((u) => u.startsWith('https://crt.sh/'))).toBe(false);

    if (!isCertificateResult(result)) throw new Error('expected certificate data');
    expect(result.certificate.source).toBe('Cert Spotter');
    expect(result.certificate.latest).toMatchObject({
      id: '18061278238',
      issuer: 'Sectigo',
      notBefore: '2026-10-30T00:00:00.000Z',
      notAfter: '2027-01-27T23:59:59.000Z',
    });
    expect(result.certificate.daysLeft).toBe(75);
  });

  it('never judges on an incomplete Cert Spotter listing: past the page cap it asks crt.sh instead', async () => {
    // Cert Spotter lists issuances oldest first, so stopping early would miss the newest certificates.
    const requested: string[] = [];
    const recorded = fakeFetch({ down: ['crtsh'] });
    const spy: typeof fetch = (input, init) => {
      requested.push(String(input));
      return recorded(input, init);
    };

    const result = await certificateResult('github.com', { fetch: spy, check: { certSpotterMaxPages: 1 } });

    expect(result.status).toBe('couldnt-check');
    expect(result.details).toEqual([
      { label: 'Cert Spotter', value: 'Too many certificates to list them all' },
      { label: 'crt.sh', value: 'No answer' },
    ]);
    expect(requested.filter((u) => u.startsWith('https://api.certspotter.com/'))).toHaveLength(1);
    expect(requested.some((u) => u.startsWith('https://crt.sh/'))).toBe(true);
  });

  it('falls back to crt.sh when Cert Spotter does not answer, and names crt.sh as the source', async () => {
    const result = await certificateResult('crypto.cloudflare.com', { fake: { down: ['certspotter'] } });

    expect(result).toMatchObject({ status: 'pass', verdict: 'Latest issued certificate expires in 54 days' });
    expect(result.details).toContainEqual({ label: 'Source', value: 'crt.sh' });
    expect(result.details).toContainEqual({ label: 'Issuer', value: "Let's Encrypt" });
    if (!isCertificateResult(result)) throw new Error('expected certificate data');
    expect(result.certificate.latest).toMatchObject({
      notBefore: '2026-10-08T16:46:41.000Z',
      notAfter: '2027-01-06T16:46:40.000Z',
      issuerName: "C=US, O=Let's Encrypt, CN=YE1",
      dnsNames: ['*.crypto.cloudflare.com', 'crypto.cloudflare.com'],
    });
  });

  it('groups the last 12 months of issuances by issuer, one entry per certificate', async () => {
    const result = await certificateResult('crypto.cloudflare.com', { fake: { down: ['certspotter'] } });
    if (!isCertificateResult(result)) throw new Error('expected certificate data');
    const { history } = result.certificate;

    expect(history.from).toBe('2025-11-13T12:00:00.000Z');
    expect(history.to).toBe('2026-11-13T12:00:00.000Z');
    // Newest issuer first; crt.sh's precertificate + certificate pairs count once;
    // the Google Trust Services pair from 2025-11-12 is outside the window.
    expect(history.issuers.map((g) => [g.issuer, g.certificates.length])).toEqual([
      ["Let's Encrypt", 4],
      ['Google Trust Services', 10],
      ['Sectigo', 6],
    ]);
    expect(history.issuers[2].certificates.map((c) => c.notBefore.slice(0, 10))).toEqual([
      '2026-04-29', '2026-04-29', '2026-02-22', '2026-02-22', '2025-12-24', '2025-12-24',
    ]);
  });

  it("is Couldn't check when neither Cert Spotter nor crt.sh answers (crt.sh 502s arrive as network errors)", async () => {
    const result = await certificateResult('crypto.cloudflare.com', { fake: { down: ['certspotter', 'crtsh'] } });

    expect(result).toMatchObject({ status: 'couldnt-check', checkedName: 'crypto.cloudflare.com' });
    expect(result.details).toEqual([
      { label: 'Cert Spotter', value: 'No answer' },
      { label: 'crt.sh', value: 'No answer' },
    ]);
  });

  it("gives each service its own timeout, then is Couldn't check", async () => {
    const result = await certificateResult('crypto.cloudflare.com', {
      fake: { hang: ['certspotter', 'crtsh'] },
      check: { certSpotterTimeoutMs: 10, crtShTimeoutMs: 10 },
    });

    expect(result.status).toBe('couldnt-check');
    expect(result.details).toEqual([
      { label: 'Cert Spotter', value: 'No answer in time' },
      { label: 'crt.sh', value: 'No answer in time' },
    ]);
  });

  it('falls back to crt.sh when Cert Spotter times out', async () => {
    const result = await certificateResult('crypto.cloudflare.com', {
      fake: { hang: ['certspotter'] },
      check: { certSpotterTimeoutMs: 10 },
    });
    expect(result).toMatchObject({ status: 'pass' });
    expect(result.details).toContainEqual({ label: 'Source', value: 'crt.sh' });
  });

  it('warns when the Latest issued certificate has 21 days or fewer left', async () => {
    const result = await certificateResult('github.com', { today: new Date('2027-01-06T23:59:59Z') });
    expect(result).toMatchObject({ status: 'warning', verdict: 'Latest issued certificate expires in 21 days' });
  });

  it('passes with 22 days left', async () => {
    const result = await certificateResult('github.com', { today: new Date('2027-01-05T23:59:59Z') });
    expect(result).toMatchObject({ status: 'pass', verdict: 'Latest issued certificate expires in 22 days' });
  });

  it('fails when the Latest issued certificate has expired', async () => {
    const result = await certificateResult('github.com', { today: new Date('2027-02-01T00:00:00Z') });
    expect(result).toMatchObject({ status: 'fail', verdict: 'Latest issued certificate expired 4 days ago' });
    if (!isCertificateResult(result)) throw new Error('expected certificate data');
    expect(result.certificate.latest?.notAfter).toBe('2027-01-27T23:59:59.000Z');
  });

  it('fails when no certificates were found for the Hostname', async () => {
    const result = await certificateResult('ns1.google.com');
    expect(result).toMatchObject({
      status: 'fail',
      verdict: 'No certificates found for this name',
      checkedName: 'ns1.google.com',
    });
    expect(result.details).toContainEqual({ label: 'Source', value: 'Cert Spotter' });
    if (!isCertificateResult(result)) throw new Error('expected certificate data');
    expect(result.certificate.latest).toBeNull();
    expect(result.certificate.history.issuers).toEqual([]);
  });

  it('is part of the default Report, without the Alias note (CT logs are not DNS records)', async () => {
    const r = await collectReport('www.github.com', { fetch: fakeFetch({ down: ['certspotter', 'crtsh'] }) });
    if (r.kind !== 'report') throw new Error(`expected a report, got ${r.kind}`);
    const result = r.results.find((x) => x.check === 'certificate');
    expect(result).toMatchObject({ status: 'couldnt-check', checkedName: 'www.github.com' });
    expect(result?.aliasNote).toBeUndefined();
  });
});
