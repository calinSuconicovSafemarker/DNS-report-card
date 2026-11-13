import { describe, expect, it } from 'vitest';
import { collectReport, runReport, type ReportEvent } from './report';
import { fakeFetch } from './__fixtures__/fakeFetch';

const run = (target: string) => collectReport(target, { fetch: fakeFetch() });

async function report(target: string) {
  const r = await run(target);
  if (r.kind !== 'report') throw new Error(`expected a report, got ${r.kind}`);
  return r;
}

async function httpsResult(target: string) {
  const r = await report(target);
  const result = r.results.find((x) => x.check === 'https-record');
  if (!result) throw new Error('no HTTPS record result');
  return result;
}

describe('HTTPS record Check', () => {
  it('passes when the Hostname publishes an HTTPS record, showing its ALPN', async () => {
    const https = await httpsResult('cloudflare.com');
    expect(https).toMatchObject({ status: 'pass', checkedName: 'cloudflare.com' });
    expect(https.details).toContainEqual({ label: 'ALPN', value: 'h3, h2' });
    expect(https.details).toContainEqual({ label: 'ECH', value: 'Not present' });
  });

  it('reports ECH when the HTTPS record carries an ech parameter', async () => {
    const https = await httpsResult('crypto.cloudflare.com');
    expect(https).toMatchObject({ status: 'pass', checkedName: 'crypto.cloudflare.com' });
    expect(https.details).toContainEqual({ label: 'ALPN', value: 'h2' });
    expect(https.details).toContainEqual({ label: 'ECH', value: 'Present' });
  });

  it('warns (never fails) when the Hostname has no HTTPS record', async () => {
    const https = await httpsResult('github.com');
    expect(https).toMatchObject({ status: 'warning', checkedName: 'github.com' });
  });

  it("is Couldn't check when the DNS service doesn't answer", async () => {
    const https = await httpsResult('unrecorded.example.org');
    expect(https.status).toBe('couldnt-check');
  });
});

describe('Grade', () => {
  it('is A (100) when the only Check passes', async () => {
    const r = await report('cloudflare.com');
    expect(r.grading).toEqual({ score: 100, grade: 'A', gradedCount: 1, totalCount: 1 });
  });

  it('is D (50) when the only Check is a Warning', async () => {
    const r = await report('github.com');
    expect(r.grading).toEqual({ score: 50, grade: 'D', gradedCount: 1, totalCount: 1 });
  });

  it("is absent when no Check could be graded", async () => {
    const r = await report('unrecorded.example.org');
    expect(r.grading).toBeNull();
  });
});

describe('Report events', () => {
  it('announces the Hostname and Checks, then each Check result, then the Grade', async () => {
    const events: ReportEvent['type'][] = [];
    for await (const e of runReport('cloudflare.com', { fetch: fakeFetch() })) events.push(e.type);
    expect(events).toEqual(['started', 'check', 'graded']);
  });
});

describe('Target normalization', () => {
  it.each([
    ['HTTPS://CloudFlare.com/cart?x=1#top', 'cloudflare.com'],
    ['cloudflare.com:8443/path', 'cloudflare.com'],
    ['  Cloudflare.COM.  ', 'cloudflare.com'],
    ['http://user:pw@cloudflare.com', 'cloudflare.com'],
  ])('checks %j as %s', async (target, hostname) => {
    const r = await report(target);
    expect(r.hostname).toBe(hostname);
    expect(r.results[0]).toMatchObject({ status: 'pass', checkedName: hostname });
  });

  it('converts an internationalized domain to punycode', async () => {
    const r = await report('https://Bücher.example/');
    expect(r.hostname).toBe('xn--bcher-kva.example');
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['192.0.2.1', 'ip-address'],
    ['http://192.0.2.1:8080/', 'ip-address'],
    ['[2001:db8::1]', 'ip-address'],
    ['2001:db8::1', 'ip-address'],
    ['localhost', 'localhost'],
    ['http://LOCALHOST:3000', 'localhost'],
    ['app.localhost', 'localhost'],
    ['intranet', 'single-label'],
    ['exa mple.com', 'invalid'],
    ['-bad-.com', 'invalid'],
  ])('rejects %j as %s with a friendly message and runs no Checks', async (target, reason) => {
    const requests: string[] = [];
    const spy: typeof fetch = async (input) => {
      requests.push(String(input));
      throw new TypeError('no network in this test');
    };
    const r = await collectReport(target, { fetch: spy });
    expect(r).toMatchObject({ kind: 'invalid-target', reason });
    if (r.kind === 'invalid-target') expect(r.message).toMatch(/\w/);
    expect(requests).toEqual([]);
  });
});
