import { RotateCw, Search, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Status } from '../engine/types';
import { CheckCard } from './CheckCard';
import { Scorecard } from './Scorecard';
import { GradeRing } from './GradeRing';
import { Outcome } from './Outcome';
import { STATUS_LABEL, StatusIcon } from './status';
import { useReport, type ReportOutcome, type ReportState } from './useReport';

const QUERY_PARAM = 'd';

function readTargetFromUrl(): string {
  return new URLSearchParams(window.location.search).get(QUERY_PARAM) ?? '';
}

/**
 * Put `?d=<hostname>` in the address bar so the Report can be shared.
 * A submitted search adds a history entry; a run started from the URL only
 * rewrites it to the normalized Hostname, so Back never loops.
 */
function writeHostnameToUrl(hostname: string, mode: 'push' | 'replace') {
  const url = new URL(window.location.href);
  if (url.searchParams.get(QUERY_PARAM) === hostname) return;
  url.searchParams.set(QUERY_PARAM, hostname);
  if (mode === 'push') window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

export function App() {
  const [input, setInput] = useState(readTargetFromUrl);
  const urlMode = useRef<'push' | 'replace'>('replace');
  const onHostname = useCallback((hostname: string) => {
    setInput(hostname);
    writeHostnameToUrl(hostname, urlMode.current);
  }, []);
  const { state, start } = useReport(onHostname);

  // Opening a shared link (or going back/forward) runs the Report automatically.
  useEffect(() => {
    const runFromUrl = () => {
      const target = readTargetFromUrl();
      setInput(target);
      urlMode.current = 'replace';
      if (target) void start(target);
    };
    runFromUrl();
    window.addEventListener('popstate', runFromUrl);
    return () => window.removeEventListener('popstate', runFromUrl);
  }, [start]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    urlMode.current = 'push';
    void start(input);
  };

  const runAgain = (hostname: string) => {
    urlMode.current = 'replace';
    void start(hostname);
  };

  return (
    <div className="page">
      <header className="masthead">
        <p className="brand">
          <span className="brand-mark">
            <ShieldCheck aria-hidden="true" size={18} />
          </span>
          DNS Report Card
        </p>
        <h1>How secure is your domain’s setup?</h1>
        <p className="tagline">
          A plain-English check of DNSSEC, certificates and more, using only public lookups made from your browser.
        </p>

        <form className="search" onSubmit={onSubmit} role="search">
          <label htmlFor="target" className="visually-hidden">
            Domain or web address
          </label>
          <Search aria-hidden="true" size={20} className="search-icon" />
          <input
            id="target"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="example.com"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="button-primary">
            Check
          </button>
        </form>
      </header>

      <main>
        {state.phase === 'outcome' && (
          <Outcome
            outcome={state.outcome}
            onRetry={retryFor(state.outcome, runAgain)}
          />
        )}
        {(state.phase === 'running' || state.phase === 'done') && <Report state={state} onRunAgain={runAgain} />}
      </main>

      <footer className="footer">
        <p>Passive, public lookups only. Nothing is stored and nothing is tracked.</p>
      </footer>
    </div>
  );
}

/** Only a DNS outage is worth retrying as-is; the other outcomes need a different Target. */
function retryFor(outcome: ReportOutcome, runAgain: (hostname: string) => void): (() => void) | undefined {
  return outcome.kind === 'dns-unreachable' ? () => runAgain(outcome.hostname) : undefined;
}

const TALLY_ORDER: Status[] = ['pass', 'warning', 'fail', 'couldnt-check', 'info'];

function Report({
  state,
  onRunAgain,
}: {
  state: Extract<ReportState, { phase: 'running' | 'done' }>;
  onRunAgain: (hostname: string) => void;
}) {
  const settled = state.phase === 'done';
  const { grading } = state;
  const results = Object.values(state.results);
  const tally = TALLY_ORDER.map((status) => ({
    status,
    count: results.filter((r) => r.status === status).length,
  })).filter((t) => t.count > 0);

  return (
    <section className="report" aria-labelledby="report-title" aria-busy={!settled}>
      <div className="summary">
        <GradeRing grading={grading} settled={settled} />
        <div className="summary-text">
          <p className="eyebrow">Report for</p>
          <h2 id="report-title" className="hostname">
            {state.hostname}
          </h2>
          <p className="summary-line" aria-live="polite">
            {!settled
              ? 'Running checks…'
              : grading
                ? gradeSentence(grading.grade)
                : 'None of the checks could be graded this time.'}
          </p>
          {tally.length > 0 && (
            <ul className="tally" aria-label="Results so far">
              {tally.map(({ status, count }) => (
                <li key={status} className={`tally-item tone-${status}`}>
                  <StatusIcon status={status} size={14} />
                  <span>
                    {count} {STATUS_LABEL[status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {settled && grading && grading.gradedCount < grading.totalCount && (
            <p className="based-on">
              Based on {grading.gradedCount} of {grading.totalCount} checks
            </p>
          )}
          <button
            type="button"
            className="button-secondary"
            onClick={() => onRunAgain(state.hostname)}
            disabled={!settled}
          >
            <RotateCw aria-hidden="true" size={16} />
            Run again
          </button>
        </div>
        <Scorecard checks={state.checks} results={state.results} />
      </div>

      <div className="cards">
        {state.checks.map((check) => (
          <CheckCard key={check.id} check={check} result={state.results[check.id]} />
        ))}
      </div>
    </section>
  );
}

function gradeSentence(grade: string): string {
  switch (grade) {
    case 'A':
      return 'Excellent. This domain follows good practice.';
    case 'B':
      return 'Good, with a few things worth improving.';
    case 'C':
      return 'Fair. Several things are worth fixing.';
    case 'D':
      return 'Needs work. Start with the cards marked Fail or Warning.';
    default:
      return 'Poor. Several important protections are missing.';
  }
}
