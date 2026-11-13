import { describe, expect, it, vi } from 'vitest';
import { collectReport, runReport, type ReportEvent } from './report';
import { fakeFetch } from './__fixtures__/fakeFetch';
import type { Check, CheckId, Status } from './types';

/** A stand-in Check with a fixed outcome, for grading tests (the real Checks arrive in later tickets). */
function fixed(id: CheckId, status: Status): Check {
  return {
    id,
    run: async ({ hostname }) => ({ check: id, status, verdict: status, checkedName: hostname, details: [] }),
  };
}

/** A stand-in Check whose service errors out. */
function broken(id: CheckId): Check {
  return {
    id,
    run: async () => {
      throw new TypeError('Failed to fetch');
    },
  };
}

const graded = async (...checks: Check[]) => {
  const r = await collectReport('cloudflare.com', { fetch: fakeFetch(), checks });
  if (r.kind !== 'report') throw new Error(`expected a report, got ${r.kind}`);
  return r.grading;
};

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
    const https = await httpsResult('bbc.co.uk');
    expect(https).toMatchObject({
      status: 'couldnt-check',
      verdict: 'Couldn’t check — no response from the service',
      checkedName: 'bbc.co.uk',
    });
  });

  it("is Couldn't check, not graded, when the service never answers in time", async () => {
    const recorded = fakeFetch();
    // The Hostname resolves, but the HTTPS record lookup never answers.
    const hangOnHttps: typeof fetch = (input, init) =>
      String(input).includes('type=HTTPS') ? new Promise<Response>(() => {}) : recorded(input, init);
    const r = await collectReport('cloudflare.com', { fetch: hangOnHttps, checkTimeoutMs: 20 });
    if (r.kind !== 'report') throw new Error(`expected a report, got ${r.kind}`);
    expect(r.results).toEqual([
      expect.objectContaining({
        check: 'https-record',
        status: 'couldnt-check',
        verdict: 'Couldn’t check — no response from the service',
      }),
    ]);
    expect(r.grading).toBeNull();
  });
});

describe('DNS providers', () => {
  it('falls back to Google when Cloudflare is unreachable, with the same results', async () => {
    const viaGoogle = await collectReport('cloudflare.com', { fetch: fakeFetch({ down: ['cloudflare'] }) });
    const viaCloudflare = await collectReport('cloudflare.com', { fetch: fakeFetch() });
    expect(viaGoogle).toEqual(viaCloudflare);
    expect(viaGoogle).toMatchObject({ kind: 'report', grading: { grade: 'A' } });
  });

  it('gives up on a provider after 4 s and moves on to the next', async () => {
    vi.useFakeTimers();
    try {
      const pending = collectReport('cloudflare.com', { fetch: fakeFetch({ hang: ['cloudflare'] }) });
      let settled = false;
      void pending.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(3900);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await pending).toMatchObject({ kind: 'report', grading: { grade: 'A' } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a Report-level error with no cards and no Grade when both providers fail', async () => {
    const events: ReportEvent[] = [];
    for await (const e of runReport('cloudflare.com', { fetch: fakeFetch({ down: ['cloudflare', 'google'] }) })) {
      events.push(e);
    }
    expect(events).toEqual([
      {
        type: 'dns-unreachable',
        hostname: 'cloudflare.com',
        message: 'Couldn’t reach the DNS lookup service. Try again in a moment.',
      },
    ]);
  });
});

describe('Alias', () => {
  const NOTE = 'www.github.com is an alias of github.com; results reflect the alias target';

  it('adds a note to record-level cards without changing their Status', async () => {
    const https = await httpsResult('www.github.com');
    expect(https).toMatchObject({ status: 'warning', checkedName: 'www.github.com', aliasNote: NOTE });
  });

  it('is detected from Google answers too (trailing dots)', async () => {
    const r = await collectReport('www.github.com', { fetch: fakeFetch({ down: ['cloudflare'] }) });
    if (r.kind !== 'report') throw new Error(r.kind);
    expect(r.results[0].aliasNote).toBe(NOTE);
  });

  it('adds no note when the Hostname is not an Alias', async () => {
    const https = await httpsResult('github.com');
    expect(https.aliasNote).toBeUndefined();
  });
});

describe('Provider differences are normalized', () => {
  const dnsProbe = (name: string, type: 'DS' | 'SOA'): Check => ({
    id: 'https-record',
    async run({ dns }) {
      const a = await dns.query(name, type);
      return {
        check: 'https-record',
        status: 'info',
        verdict: `rcode ${a.rcode}`,
        checkedName: name,
        details: [
          ...a.answer.map((r) => ({ label: r.name, value: r.data })),
          ...a.comments.map((c) => ({ label: 'Comment', value: c })),
        ],
      };
    },
  });
  const viaEach = async (target: string, check: Check) => {
    const [cloudflare, google] = await Promise.all(
      [fakeFetch(), fakeFetch({ down: ['cloudflare'] })].map(async (fetch) => {
        const r = await collectReport(target, { fetch, checks: [check] });
        if (r.kind !== 'report') throw new Error(r.kind);
        return r.results[0];
      }),
    );
    return { cloudflare, google };
  };

  it('gives the same DS record from both (lowercase digest, no trailing dot)', async () => {
    const { cloudflare, google } = await viaEach('cloudflare.com', dnsProbe('cloudflare.com', 'DS'));
    expect(google).toEqual(cloudflare);
    expect(google.details).toEqual([
      { label: 'cloudflare.com', value: '2371 13 2 32996839a6d808afe3eb4a795a0e6a7a39a76fc52ff228b22b76f6d63826f2b9' },
    ]);
  });

  it('gives resolver comments as a list from both', async () => {
    const { cloudflare, google } = await viaEach('dnssec-failed.org', dnsProbe('dnssec-failed.org', 'SOA'));
    for (const r of [cloudflare, google]) {
      expect(r.verdict).toBe('rcode 2');
      expect(r.details).toEqual([{ label: 'Comment', value: expect.stringMatching(/DNSKEY|DNSSEC/) }]);
    }
  });
});

describe('Name resolution available to Checks', () => {
  /** A stand-in Check that reports what the engine resolved, so the seam can show it. */
  const probe: Check = {
    id: 'https-record',
    async run(ctx) {
      return {
        check: 'https-record',
        status: 'info',
        verdict: 'probe',
        checkedName: await ctx.zoneApex(),
        details: ctx.alias ? [{ label: 'Alias target', value: ctx.alias.target }] : [],
      };
    },
  };
  const probeReport = async (target: string) => {
    const r = await collectReport(target, { fetch: fakeFetch(), checks: [probe] });
    if (r.kind !== 'report') throw new Error(r.kind);
    return r.results[0];
  };

  it.each([
    ['cloudflare.com', 'cloudflare.com'],
    ['www.github.com', 'github.com'],
    ['www.bbc.co.uk', 'bbc.co.uk'],
  ])('finds the Zone apex of %s at %s', async (target, apex) => {
    expect((await probeReport(target)).checkedName).toBe(apex);
  });

  it('follows a multi-step Alias to its final target', async () => {
    expect((await probeReport('www.bbc.co.uk')).details).toEqual([{ label: 'Alias target', value: 'bbc.map.fastly.net' }]);
  });
});

describe('Domain that does not exist', () => {
  it('shows a Report-level "check the spelling" page with no cards and no Grade', async () => {
    const r = await run('thisdoesnotexist-dnsreportcard-zz.com');
    expect(r).toEqual({
      kind: 'not-found',
      hostname: 'thisdoesnotexist-dnsreportcard-zz.com',
      message: 'We couldn’t find this domain in DNS — check the spelling.',
    });
  });

  it('is detected through the Google fallback too', async () => {
    const r = await collectReport('thisdoesnotexist-dnsreportcard-zz.com', { fetch: fakeFetch({ down: ['cloudflare'] }) });
    expect(r.kind).toBe('not-found');
  });
});

describe('Grade', () => {
  it('is A (100) when the only Check passes', async () => {
    const r = await report('cloudflare.com');
    expect(r.grading).toEqual({ score: 100, grade: 'A', gradedCount: 1, totalCount: 6 });
  });

  it('is D (50) when the only Check is a Warning', async () => {
    const r = await report('github.com');
    expect(r.grading).toEqual({ score: 50, grade: 'D', gradedCount: 1, totalCount: 6 });
  });

  it('weights the six Checks: DNSSEC 25, Nameservers 20, Certificate 20, CAA 15, HTTPS record 10, HSTS preload 10', async () => {
    // Warning on DNSSEC alone: 25 * 0.5 = 12.5 of 100 lost.
    expect(
      await graded(
        fixed('dnssec', 'warning'),
        fixed('caa', 'pass'),
        fixed('nameservers', 'pass'),
        fixed('https-record', 'pass'),
        fixed('certificate', 'pass'),
        fixed('hsts-preload', 'pass'),
      ),
    ).toEqual({ score: 88, grade: 'B', gradedCount: 6, totalCount: 6 });
    // Fail on Nameservers and Certificate: 60 of 100.
    expect(
      await graded(
        fixed('dnssec', 'pass'),
        fixed('caa', 'pass'),
        fixed('nameservers', 'fail'),
        fixed('https-record', 'pass'),
        fixed('certificate', 'fail'),
        fixed('hsts-preload', 'pass'),
      ),
    ).toEqual({ score: 60, grade: 'C', gradedCount: 6, totalCount: 6 });
  });

  it.each([
    [100, 'A'],
    [90, 'A'],
    [80, 'B'],
    [75, 'B'],
    [65, 'C'],
    [45, 'D'],
    [35, 'F'],
  ])('maps a Score of %i to %s', async (score, grade) => {
    // DNSSEC 25, Nameservers 20, Certificate 20, CAA 15, HTTPS 10, HSTS 10: pick Fails summing to 100 - score.
    const failing: Record<number, CheckId[]> = {
      100: [],
      90: ['https-record'],
      80: ['nameservers'],
      75: ['caa', 'hsts-preload'],
      65: ['dnssec', 'https-record'],
      45: ['dnssec', 'nameservers', 'https-record'],
      35: ['dnssec', 'nameservers', 'certificate'],
    };
    const ids: CheckId[] = ['dnssec', 'caa', 'nameservers', 'https-record', 'certificate', 'hsts-preload'];
    const g = await graded(...ids.map((id) => fixed(id, failing[score].includes(id) ? 'fail' : 'pass')));
    expect(g).toMatchObject({ score, grade });
  });

  it("leaves Couldn't check and Info out and rescales the remaining weights", async () => {
    // Graded: DNSSEC pass 25, Nameservers fail 20, CAA warning 7.5 of 15 -> 32.5 / 60 = 54.
    expect(
      await graded(
        fixed('dnssec', 'pass'),
        fixed('caa', 'warning'),
        fixed('nameservers', 'fail'),
        fixed('https-record', 'info'),
        broken('certificate'),
        fixed('hsts-preload', 'couldnt-check'),
      ),
    ).toEqual({ score: 54, grade: 'D', gradedCount: 3, totalCount: 6 });
  });

  it('leaves Checks that are not built yet out of the Grade', async () => {
    expect(await graded(fixed('dnssec', 'pass'), fixed('nameservers', 'fail'))).toEqual({
      score: 56,
      grade: 'D',
      gradedCount: 2,
      totalCount: 6,
    });
  });

  it("is absent when no Check could be graded", async () => {
    const r = await report('bbc.co.uk');
    expect(r.grading).toBeNull();
  });
});

describe('Report events', () => {
  it('announces the Hostname and Checks, then each Check result, then the Grade', async () => {
    const events: ReportEvent['type'][] = [];
    for await (const e of runReport('cloudflare.com', { fetch: fakeFetch() })) events.push(e.type);
    expect(events).toEqual(['started', 'check', 'graded']);
  });

  it('lists all six Checks in card order with their weights, marking the ones not built yet', async () => {
    const events = runReport('cloudflare.com', { fetch: fakeFetch() });
    const first = (await events.next()).value;
    expect(first).toEqual({
      type: 'started',
      hostname: 'cloudflare.com',
      checks: [
        { id: 'dnssec', title: 'DNSSEC', weight: 25, built: false },
        { id: 'caa', title: 'CAA', weight: 15, built: false },
        { id: 'nameservers', title: 'Nameservers', weight: 20, built: false },
        { id: 'https-record', title: 'HTTPS record', weight: 10, built: true },
        { id: 'certificate', title: 'Certificate', weight: 20, built: false },
        { id: 'hsts-preload', title: 'HSTS preload', weight: 10, built: false },
      ],
    });
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
    const r = await run('https://Bücher.example/');
    expect(r).toMatchObject({ hostname: 'xn--bcher-kva.example' });
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
