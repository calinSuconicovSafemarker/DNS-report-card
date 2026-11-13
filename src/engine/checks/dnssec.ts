import { recordsOf, type DnsRecord } from '../dns';
import type { Check, CheckReasons, CheckResult, Detail, Status } from '../types';

/** Which case of its Status a DNSSEC result is; selects the explanation copy. */
export type DnssecReason = CheckReasons['dnssec'];

const NOERROR = 0;
const SERVFAIL = 2;

/** DNSSEC on the Zone apex: DS at the parent, DNSKEY in the zone, and a validated (AD) answer. */
export const dnssecCheck: Check = {
  id: 'dnssec',
  async run({ dns, zoneApex }): Promise<CheckResult> {
    const apex = await zoneApex();
    const [validated, ds] = await Promise.all([dns.query(apex, 'DNSKEY'), dns.query(apex, 'DS')]);
    // SERVFAIL from a validating resolver: ask again without validation to tell broken DNSSEC from a dead zone.
    const broken = validated.rcode === SERVFAIL;
    const dnskey = broken ? await dns.query(apex, 'DNSKEY', { checkingDisabled: true }) : validated;
    // Any other error answer (including SERVFAIL with checking disabled) leaves the records unknown: Couldn't check.
    const dsRecords = recordsOf(ds, 'DS');
    const dnskeyRecords = recordsOf(dnskey, 'DNSKEY');

    const result = (status: Status, reason: DnssecReason, verdict: string): CheckResult => ({
      check: 'dnssec',
      status,
      reason,
      verdict,
      checkedName: apex,
      details: [...recordDetails('DS', dsRecords), ...recordDetails('DNSKEY', dnskeyRecords)],
    });

    if (broken && dnskey.rcode === NOERROR) return result('fail', 'broken', 'DNSSEC is broken: answers fail validation');
    // Unsigned is Info (no points either way): most large sites skip DNSSEC and rely on HTTPS instead.
    if (dnskeyRecords.length === 0) return result('info', 'none', 'DNSSEC is not enabled (optional)');
    if (dsRecords.length === 0) return result('warning', 'no-ds', 'Signed, but no DS record at the registrar');
    if (!validated.authenticated) return result('warning', 'not-validated', 'Signed, but resolvers could not validate it');
    return result('pass', 'validated', 'Signed and validated');
  },
};

function recordDetails(label: string, records: DnsRecord[]): Detail[] {
  return records.length === 0 ? [{ label, value: 'None found' }] : records.map((r) => ({ label, value: r.data }));
}
