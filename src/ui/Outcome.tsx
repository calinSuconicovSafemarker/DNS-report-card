import { Globe, SearchX, WifiOff, type LucideIcon } from 'lucide-react';
import type { ReportOutcome } from './useReport';

/** Heading and icon per Report-level outcome. Add an entry for each new `ReportOutcome` kind. */
const OUTCOME_COPY: Record<ReportOutcome['kind'], { icon: LucideIcon; title: string }> = {
  'invalid-target': { icon: Globe, title: 'We can’t check that name' },
  'not-found': { icon: SearchX, title: 'Domain not found' },
  'dns-unreachable': { icon: WifiOff, title: 'DNS lookups aren’t answering' },
};

/** A whole-Report outcome: one message in place of the Grade and cards. */
export function Outcome({ outcome, onRetry }: { outcome: ReportOutcome; onRetry?: () => void }) {
  const { icon: Icon, title } = OUTCOME_COPY[outcome.kind];
  return (
    <section className="outcome" role="alert" aria-labelledby="outcome-title">
      <span className="outcome-icon">
        <Icon aria-hidden="true" size={28} />
      </span>
      <div>
        <h2 id="outcome-title">{title}</h2>
        <p>{outcome.message}</p>
        {onRetry && (
          <button type="button" className="button-secondary" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </section>
  );
}
