import { describe, expect, it } from 'vitest';
import { collectReport } from '../report';
import { fakeFetch, type FakeFetchOptions } from '../__fixtures__/fakeFetch';

async function nameservers(target: string, options: FakeFetchOptions = {}) {
  const r = await collectReport(target, { fetch: fakeFetch(options) });
  if (r.kind !== 'report') throw new Error(`expected a report, got ${r.kind}`);
  const result = r.results.find((x) => x.check === 'nameservers');
  if (!result) throw new Error('no Nameservers result');
  return result;
}

describe('Nameservers Check', () => {
  it('passes with nameservers spread across providers and /24 networks, listing each one', async () => {
    const ns = await nameservers('github.com');
    expect(ns).toMatchObject({ status: 'pass', checkedName: 'github.com' });
    expect(ns.details).toContainEqual({
      label: 'dns1.p08.nsone.net',
      value: 'nsone.net · 198.51.44.8 (198.51.44.0/24)',
    });
    expect(ns.details).toContainEqual({
      label: 'ns-1707.awsdns-21.co.uk',
      value: 'awsdns-21.co.uk · 205.251.198.171 (205.251.198.0/24)',
    });
    expect(ns.details).toContainEqual({
      label: 'Provider domains',
      value: 'awsdns-01.net, awsdns-21.co.uk, awsdns-32.org, awsdns-52.com, nsone.net',
    });
  });

  it('warns when every nameserver is run by one provider, even across many /24 networks', async () => {
    const ns = await nameservers('cloudflare.com');
    expect(ns).toMatchObject({
      status: 'warning',
      checkedName: 'cloudflare.com',
      verdict: '5 nameservers, all run by cloudflare.com',
    });
    expect(ns.details).toContainEqual({
      label: 'ns3.cloudflare.com',
      value: 'cloudflare.com · 162.159.0.33 (162.159.0.0/24) · 162.159.7.226 (162.159.7.0/24)',
    });
  });

  it('warns when every nameserver sits in one /24 network', async () => {
    const ns = await nameservers('linuxfromscratch.org');
    expect(ns).toMatchObject({
      status: 'warning',
      verdict: '2 nameservers, all run by linuxfromscratch.org, all in 208.118.68.0/24',
    });
    expect(ns.details).toContainEqual({ label: '/24 networks', value: '208.118.68.0/24' });
  });

  it('fails with a single nameserver, evaluated on the Zone apex', async () => {
    const ns = await nameservers('cr.yp.to');
    expect(ns).toMatchObject({ status: 'fail', checkedName: 'yp.to', verdict: 'Only one nameserver' });
  });

  it("is Couldn't check, not 'no nameservers', when the resolver answers SERVFAIL", async () => {
    const ns = await nameservers('dnssec-failed.org');
    expect(ns).toMatchObject({ status: 'couldnt-check', checkedName: 'dnssec-failed.org' });
    expect(ns.details).toEqual([{ label: 'Reason', value: 'The NS lookup was answered with SERVFAIL' }]);
  });

  it('gives the same result from Google answers (trailing dots, other record order)', async () => {
    expect(await nameservers('cloudflare.com', { down: ['cloudflare'] })).toEqual(await nameservers('cloudflare.com'));
  });
});
