import {
  BadgeCheck,
  ChevronDown,
  Construction,
  CornerDownRight,
  FileLock,
  Link2,
  LockKeyhole,
  Server,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { checkSummary, explanationFor } from '../content/explanations';
import type { ReportCheck } from '../engine/report';
import type { CheckId, CheckResult } from '../engine/types';
import { CopyableCode } from './CopyableCode';
import { StatusBadge } from './status';

const CHECK_ICON: Record<CheckId, LucideIcon> = {
  dnssec: ShieldCheck,
  caa: BadgeCheck,
  nameservers: Server,
  'https-record': Zap,
  certificate: FileLock,
  'hsts-preload': LockKeyhole,
};

/**
 * One card of the 3×2 grid. Renders, by state:
 * - a "not built yet" placeholder for a Check without an implementation,
 * - a skeleton while the Check runs,
 * - the Check result once it settles.
 */
export function CheckCard({ check, result }: { check: ReportCheck; result: CheckResult | undefined }) {
  if (!check.built) return <PlaceholderCard check={check} />;
  if (!result) return <SkeletonCard check={check} />;
  return <ResultCard check={check} result={result} />;
}

function CardHead({ check, children }: { check: ReportCheck; children?: ReactNode }) {
  const Icon = CHECK_ICON[check.id];
  return (
    <header className="card-head">
      <span className="card-icon">
        <Icon aria-hidden="true" size={20} />
      </span>
      <div className="card-titles">
        <h3>{check.title}</h3>
        <p className="card-summary">{checkSummary[check.id]}</p>
      </div>
      {children}
    </header>
  );
}

function PlaceholderCard({ check }: { check: ReportCheck }) {
  return (
    <article className="card card-placeholder" aria-label={`${check.title}: not built yet`}>
      <CardHead check={check}>
        <span className="badge tone-muted">
          <Construction aria-hidden="true" size={16} />
          Not built yet
        </span>
      </CardHead>
      <p className="card-note">This check is coming soon. It isn’t part of the Grade yet.</p>
    </article>
  );
}

function SkeletonCard({ check }: { check: ReportCheck }) {
  return (
    <article className="card card-loading" aria-busy="true" aria-label={`${check.title}: checking`}>
      <CardHead check={check}>
        <span className="skeleton skeleton-badge" />
      </CardHead>
      <span className="skeleton skeleton-line" />
      <span className="skeleton skeleton-line short" />
      <span className="visually-hidden">Checking…</span>
    </article>
  );
}

function ResultCard({ check, result }: { check: ReportCheck; result: CheckResult }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const copy = explanationFor(result.check, result.status);

  return (
    <article className={`card card-result tone-${result.status}`} data-open={open}>
      <CardHead check={check}>
        <StatusBadge status={result.status} />
      </CardHead>

      <p className="verdict">{result.verdict}</p>
      <p className="checked-name">
        <CornerDownRight aria-hidden="true" size={14} />
        Checked on <span className="mono">{result.checkedName}</span>
      </p>
      {result.aliasNote && (
        <p className="alias-note">
          <Link2 aria-hidden="true" size={16} />
          <span>{result.aliasNote}</span>
        </p>
      )}

      <button
        type="button"
        className="card-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide details' : copy?.howToFix ? 'What this means & how to fix' : 'What this means'}
        <ChevronDown aria-hidden="true" size={16} className="chevron" />
      </button>

      <div id={bodyId} className="card-body" hidden={!open}>
        {copy && (
          <>
            <section>
              <h4>What this means</h4>
              <p>{copy.whatThisMeans}</p>
            </section>
            {copy.howToFix && (
              <section>
                <h4>How to fix</h4>
                <p>{copy.howToFix}</p>
                {copy.example && <CopyableCode code={copy.example} />}
              </section>
            )}
          </>
        )}
        {result.details.length > 0 && (
          <section>
            <h4>Details</h4>
            <dl className="details">
              {result.details.map((d, i) => (
                <div key={i}>
                  <dt>{d.label}</dt>
                  <dd className="mono">{d.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </article>
  );
}
