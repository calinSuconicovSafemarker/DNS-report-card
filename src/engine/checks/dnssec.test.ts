import { describe, expect, it } from 'vitest';
import { collectReport } from '../report';
import { fakeFetch } from '../__fixtures__/fakeFetch';

async function dnssecResult(target: string) {
  const r = await collectReport(target, { fetch: fakeFetch() });
  if (r.kind !== 'report') throw new Error(`expected a report, got ${r.kind}`);
  const result = r.results.find((x) => x.check === 'dnssec');
  if (!result) throw new Error('no DNSSEC result');
  return result;
}

describe('DNSSEC Check', () => {
  it('passes for a signed, validated Zone apex, showing its DS and DNSKEY records', async () => {
    const dnssec = await dnssecResult('cloudflare.com');
    expect(dnssec).toMatchObject({ status: 'pass', checkedName: 'cloudflare.com' });
    expect(dnssec.details).toContainEqual({
      label: 'DS',
      value: '2371 13 2 32996839a6d808afe3eb4a795a0e6a7a39a76fc52ff228b22b76f6d63826f2b9',
    });
    expect(dnssec.details).toContainEqual({
      label: 'DNSKEY',
      value: '257 3 13 mdsswUyr3DPW132mOi8V9xESWE8jTo0dxCjjnopKl+GqJxpVXckHAeF+KkxLbxILfDLUT0rAK9iUzy1L53eKGQ==',
    });
  });

  it('does not pass when DS and DNSKEY exist but the resolver does not report the answer as validated', async () => {
    const recorded = fakeFetch();
    const withoutAd: typeof fetch = async (input, init) => {
      const res = await recorded(input, init);
      if (!String(input).includes('type=DNSKEY')) return res;
      return Response.json({ ...(await res.json()), AD: false });
    };
    const r = await collectReport('cloudflare.com', { fetch: withoutAd });
    if (r.kind !== 'report') throw new Error(r.kind);
    expect(r.results.find((x) => x.check === 'dnssec')).toMatchObject({
      status: 'warning',
      reason: 'not-validated',
      verdict: 'Signed, but resolvers could not validate it',
    });
  });

  it('fails when the Zone apex has no DNSSEC, and is evaluated on the Zone apex', async () => {
    const dnssec = await dnssecResult('www.github.com');
    expect(dnssec).toMatchObject({ status: 'fail', reason: 'none', verdict: 'DNSSEC is not enabled', checkedName: 'github.com' });
    expect(dnssec.details).toEqual([
      { label: 'DS', value: 'None found' },
      { label: 'DNSKEY', value: 'None found' },
    ]);
  });

  it('warns when DNSKEY is published but the parent has no DS', async () => {
    const dnssec = await dnssecResult('no-ds.extended-dns-errors.com');
    expect(dnssec).toMatchObject({
      status: 'warning',
      reason: 'no-ds',
      verdict: 'Signed, but no DS record at the registrar',
      checkedName: 'no-ds.extended-dns-errors.com',
    });
    expect(dnssec.details).toContainEqual({ label: 'DS', value: 'None found' });
    expect(dnssec.details.filter((d) => d.label === 'DNSKEY').length).toBeGreaterThan(0);
  });

  it('fails as broken when the Zone apex fails validation but resolves with checking disabled', async () => {
    const dnssec = await dnssecResult('dnssec-failed.org');
    expect(dnssec).toMatchObject({
      status: 'fail',
      reason: 'broken',
      verdict: 'DNSSEC is broken: answers fail validation',
      checkedName: 'dnssec-failed.org',
    });
    expect(dnssec.details).toContainEqual({
      label: 'DS',
      value: '42069 13 2 62726f6b656e20636861696e206f662074727573742073656e642068656c7021',
    });
    expect(dnssec.details).toContainEqual({
      label: 'DNSKEY',
      value: '257 3 13 1CcdGV2EigL5bsrPpkSvYHzyfYR1udWKZtWHU9EQXMrbtKglmUDYKKkwwajHQQ7TAMIit/vQbCrh4SPkxLbhgg==',
    });
  });
});
