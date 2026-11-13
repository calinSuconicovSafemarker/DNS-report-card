import { describe, expect, it } from 'vitest';
import { collectReport } from './report';
import { explanationFor } from '../content/explanations';
import { caaPolicyOf } from './checks/caa';
import { fakeFetch, type FakeFetchOptions } from './__fixtures__/fakeFetch';

async function caaResult(target: string, options: FakeFetchOptions = {}) {
  const r = await collectReport(target, { fetch: fakeFetch(options) });
  if (r.kind !== 'report') throw new Error(`expected a report, got ${r.kind}`);
  const result = r.results.find((x) => x.check === 'caa');
  if (!result) throw new Error('no CAA result');
  return result;
}

describe('CAA Check', () => {
  it('passes when the Hostname has its own CAA set, listing the allowed CAs', async () => {
    const caa = await caaResult('google.com');
    expect(caa).toMatchObject({ status: 'pass', checkedName: 'google.com' });
    expect(caa.details).toContainEqual({ label: 'Found at', value: 'google.com' });
    expect(caa.details).toContainEqual({ label: 'Allowed CAs', value: 'pki.goog' });
  });

  it('walks up the tree and applies the first CAA set found, naming where it was found', async () => {
    const caa = await caaResult('www.google.com');
    expect(caa).toMatchObject({ status: 'pass', checkedName: 'google.com', verdict: 'CAA set inherited from google.com' });
    expect(caa.details).toContainEqual({ label: 'Found at', value: 'google.com' });
    expect(caa.details).toContainEqual({ label: 'Allowed CAs', value: 'pki.goog' });
  });

  it('lists iodef and exposes the allowed CAs as a structured policy', async () => {
    const caa = await caaResult('mozilla.org');
    expect(caa.details).toContainEqual({ label: 'Report problems to (iodef)', value: 'mailto:foxsec+caaiodef@mozilla.com' });
    expect(caaPolicyOf(caa)).toEqual({
      foundAt: 'mozilla.org',
      issue: [
        'amazon.com',
        'amazonaws.com',
        'amazontrust.com',
        'awstrust.com',
        'certainly.com',
        'comodoca.com',
        'digicert.com',
        'letsencrypt.org',
        'pki.goog',
        'sectigo.com',
      ],
      issuewild: [],
      iodef: ['mailto:foxsec+caaiodef@mozilla.com'],
    });
  });

  it('lists wildcard CAs separately when issuewild is set', async () => {
    const caa = await caaResult('github.com');
    expect(caa.details).toContainEqual({
      label: 'Allowed CAs',
      value: 'digicert.com, globalsign.com, letsencrypt.org, sectigo.com',
    });
    expect(caa.details).toContainEqual({
      label: 'Allowed CAs for wildcards',
      value: 'digicert.com, letsencrypt.org, sectigo.com',
    });
    expect(caaPolicyOf(caa)).toMatchObject({ issuewild: ['digicert.com', 'letsencrypt.org', 'sectigo.com'] });
  });

  it('fails when there is no CAA anywhere up the tree, with a copy-paste example fix', async () => {
    const caa = await caaResult('example.com');
    expect(caa).toMatchObject({ status: 'fail', checkedName: 'example.com', verdict: 'No CAA record found' });
    expect(caa.details).toEqual([{ label: 'Searched', value: 'example.com, com' }]);
    expect(explanationFor('caa', 'fail')?.example).toMatch(/IN CAA 0 issue "/);
  });

  it("reads the alias target's CAA on an Alias Hostname, with the Alias note", async () => {
    const caa = await caaResult('www.github.com');
    expect(caa).toMatchObject({
      status: 'pass',
      checkedName: 'www.github.com',
      aliasNote: 'www.github.com is an alias of github.com; results reflect the alias target',
    });
    expect(caaPolicyOf(caa)).toMatchObject({ foundAt: 'www.github.com', issue: expect.arrayContaining(['letsencrypt.org']) });
  });

  it('adds no Alias note to a CAA set inherited from a parent', async () => {
    expect((await caaResult('www.google.com')).aliasNote).toBeUndefined();
  });

  it('parses the Google answer (trailing dots) the same as Cloudflare', async () => {
    const viaGoogle = await caaResult('google.com', { down: ['cloudflare'] });
    expect(viaGoogle).toEqual(await caaResult('google.com'));
    expect(caaPolicyOf(viaGoogle)).toEqual({ foundAt: 'google.com', issue: ['pki.goog'], issuewild: [], iodef: [] });
  });

  it("is Couldn't check, with no policy, when the DNS service doesn't answer", async () => {
    // bbc.co.uk resolves, but no CAA answer was recorded, so the lookup fails like a network error.
    const caa = await caaResult('bbc.co.uk');
    expect(caa).toMatchObject({ status: 'couldnt-check', checkedName: 'bbc.co.uk' });
    expect(caaPolicyOf(caa)).toBeUndefined();
  });
});
