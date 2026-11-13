import { describe, expect, it } from 'vitest';
import { collectReport } from '../report';
import { fakeFetch, type FakeFetchOptions } from '../__fixtures__/fakeFetch';

async function preloadResult(target: string, options: FakeFetchOptions = {}, fetchImpl?: typeof fetch) {
  const r = await collectReport(target, { fetch: fetchImpl ?? fakeFetch(options) });
  if (r.kind !== 'report') throw new Error(`expected a report, got ${r.kind}`);
  const result = r.results.find((x) => x.check === 'hsts-preload');
  if (!result) throw new Error('no HSTS preload result');
  return result;
}

describe('HSTS preload Check', () => {
  it('passes when the Hostname itself is on the Preload list, showing the matched name', async () => {
    const result = await preloadResult('github.com');
    expect(result).toMatchObject({ status: 'pass', checkedName: 'github.com' });
    expect(result.details).toContainEqual({ label: 'Matched', value: 'github.com' });
  });

  it('passes via a parent on the list with include_subdomains, showing the parent as the match', async () => {
    const result = await preloadResult('www.github.com');
    expect(result).toMatchObject({ status: 'pass', checkedName: 'www.github.com' });
    expect(result.details).toContainEqual({ label: 'Matched', value: 'github.com' });
  });

  it('warns when only a parent without include_subdomains is listed', async () => {
    const result = await preloadResult('crypto.cloudflare.com');
    expect(result).toMatchObject({ status: 'warning', checkedName: 'crypto.cloudflare.com' });
  });

  it('warns (never fails) when the Hostname is not on the list', async () => {
    const result = await preloadResult('bbc.co.uk');
    expect(result).toMatchObject({ status: 'warning', checkedName: 'bbc.co.uk', verdict: 'Not on the Preload list' });
  });

  it("is Couldn't check when the Preload list can't be downloaded", async () => {
    const result = await preloadResult('github.com', { down: ['preload'] });
    expect(result).toMatchObject({ status: 'couldnt-check', checkedName: 'github.com' });
  });

  it("is Couldn't check when the Preload list can't be parsed", async () => {
    const recorded = fakeFetch();
    const garbled: typeof fetch = (input, init) =>
      String(input).includes('transport_security_state_static') ? Promise.resolve(new Response('{ not json')) : recorded(input, init);
    const result = await preloadResult('github.com', {}, garbled);
    expect(result).toMatchObject({ status: 'couldnt-check', checkedName: 'github.com' });
  });
});
