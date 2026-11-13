import { CalendarClock, TriangleAlert } from 'lucide-react';
import { explanationFor } from '../content/explanations';
import type { CertificateData, IssuanceHistory } from '../engine/checks/certificate';
import { StatusBadge } from './status';

const MONTH = new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** Always visible on the Certificate card: what the data is, where it came from, and the expiry countdown. */
export function CertificateSummary({ data }: { data: CertificateData }) {
  const { daysLeft } = data;
  return (
    <p className="cert-summary">
      <CalendarClock aria-hidden="true" size={16} />
      <span>
        Latest issued certificate for this name, from <strong>{data.source}</strong>’s public logs.
        {daysLeft !== null && <span className="cert-countdown">{countdown(daysLeft)}</span>}
      </span>
    </p>
  );
}

function countdown(daysLeft: number): string {
  if (daysLeft < 0) return `Expired ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago`;
  if (daysLeft === 0) return 'Expires today';
  return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
}

/** The Issuance history: a 12-month timeline, one row per issuer, one dot per certificate issued. */
export function IssuanceHistoryView({ history }: { history: IssuanceHistory }) {
  const from = Date.parse(history.from);
  const to = Date.parse(history.to);
  const at = (iso: string) => `${(((Date.parse(iso) - from) / (to - from)) * 100).toFixed(2)}%`;
  const copy = explanationFor('certificate', 'info');
  const total = history.issuers.reduce((n, g) => n + g.certificates.length, 0);

  return (
    <section className="issuance">
      <div className="issuance-head">
        <h4>Issuance history</h4>
        <StatusBadge status="info" />
      </div>
      {copy && <p>{copy.whatThisMeans}</p>}
      {total === 0 ? (
        <p className="issuance-empty">No certificates were issued for this name in the last 12 months.</p>
      ) : (
        <div className="issuance-chart">
          {history.issuers.map((group) => (
            <div className={`issuance-row${group.caaMismatch ? ' issuance-row-flagged' : ''}`} key={group.issuer}>
              <p className="issuance-issuer">
                <span>
                  {group.issuer}
                  {group.caaMismatch && (
                    <span className="issuance-flag">
                      <TriangleAlert aria-hidden="true" size={12} />
                      Not in CAA
                    </span>
                  )}
                </span>
                <span className="issuance-count">{group.certificates.length}</span>
              </p>
              {group.caaMismatch && (
                <p className="issuance-flag-note">
                  The CAA set at {group.caaMismatch.foundAt} allows {group.caaMismatch.allowed.join(', ')}, not{' '}
                  {group.caaMismatch.caDomains[0]}. Either CAA changed since these certificates were issued, or the
                  issuance was unexpected and worth a look.
                </p>
              )}
              <ul className="issuance-track" aria-label={`Certificates issued by ${group.issuer}`}>
                {group.certificates.map((c) => {
                  const label = `Issued ${c.notBefore.slice(0, 10)}, expires ${c.notAfter.slice(0, 10)}`;
                  return (
                    <li key={c.id} className="issuance-dot" style={{ left: at(c.notBefore) }} title={label}>
                      <span className="visually-hidden">{label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="issuance-axis" aria-hidden="true">
            {quarterTicks(from, to).map((t) => (
              <span key={t} style={{ left: at(new Date(t).toISOString()) }}>
                {MONTH.format(t)}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Month starts inside the window, every third month, kept clear of the edges so labels aren't clipped. */
function quarterTicks(from: number, to: number): number[] {
  const end = new Date(to);
  const span = to - from;
  const ticks: number[] = [];
  for (let i = 0; i < 12; i++) {
    const t = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1);
    const pos = (t - from) / span;
    if (pos > 0.08 && pos < 0.92) ticks.unshift(t);
  }
  return ticks.filter((_, i) => (ticks.length - 1 - i) % 3 === 0);
}
