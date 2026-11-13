import { LoaderCircle } from 'lucide-react';
import type { ReportCheck } from '../engine/report';
import type { CheckId, CheckResult } from '../engine/types';
import { STATUS_LABEL, StatusIcon } from './status';

/** At-a-glance list of the six Checks: weight in the Grade and current Status. */
export function Scorecard({
  checks,
  results,
}: {
  checks: ReportCheck[];
  results: Partial<Record<CheckId, CheckResult>>;
}) {
  return (
    <div className="scorecard">
      <h3 className="eyebrow">Checks</h3>
      <ul>
        {checks.map((check) => {
          const result = results[check.id];
          const tone = result ? result.status : 'pending';
          return (
            <li key={check.id} className={`scorecard-row tone-${tone}`}>
              <span className="scorecard-title">{check.title}</span>
              <span className="scorecard-weight">{check.weight} pts</span>
              <span className="scorecard-status">
                {result ? (
                  <>
                    <StatusIcon status={result.status} size={14} />
                    {STATUS_LABEL[result.status]}
                  </>
                ) : (
                  <>
                    <LoaderCircle aria-hidden="true" size={14} className="spin" />
                    Checking
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
