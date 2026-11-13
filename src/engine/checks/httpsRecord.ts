import { recordsOf } from '../dns';
import type { Check, CheckResult } from '../types';
import { unique } from '../util';

/** HTTPS record (SVCB type 65) on the Hostname. Pass when present, Warning when absent, never Fail. */
export const httpsRecordCheck: Check = {
  id: 'https-record',
  readsHostnameRecords: true,
  async run({ hostname, dns }): Promise<CheckResult> {
    const records = recordsOf(await dns.query(hostname, 'HTTPS'), 'HTTPS');

    if (records.length === 0) {
      return {
        check: 'https-record',
        status: 'warning',
        verdict: 'No HTTPS record published',
        checkedName: hostname,
        details: [],
      };
    }

    const params = records.map((r) => parseSvcParams(r.data));
    const alpn = unique(params.flatMap((p) => p.get('alpn')?.split(',') ?? []));
    const hasEch = params.some((p) => p.has('ech'));

    return {
      check: 'https-record',
      status: 'pass',
      verdict: hasEch ? 'HTTPS record published, with ECH' : 'HTTPS record published',
      checkedName: hostname,
      details: [
        { label: 'ALPN', value: alpn.length > 0 ? alpn.join(', ') : 'None advertised' },
        { label: 'ECH', value: hasEch ? 'Present' : 'Not present' },
        ...records.map((r) => ({ label: 'Record', value: r.data })),
      ],
    };
  },
};

/** Parse `<priority> <target> key=value key=value...` into its SvcParams. */
function parseSvcParams(data: string): Map<string, string> {
  const [, , ...pairs] = data.trim().split(/\s+/);
  return new Map(
    pairs.map((pair): [string, string] => {
      const eq = pair.indexOf('=');
      const key = (eq === -1 ? pair : pair.slice(0, eq)).toLowerCase();
      const value = eq === -1 ? '' : pair.slice(eq + 1).replace(/^"|"$/g, '');
      return [key, value];
    }),
  );
}
