import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { explanationFor } from '../content/explanations';
import type { CheckResult, Status } from '../engine/types';
import { useReport } from './useReport';

const QUERY_PARAM = 'd';

const STATUS_LABEL: Record<Status, string> = {
  pass: 'Pass',
  warning: 'Warning',
  fail: 'Fail',
  'couldnt-check': 'Couldn’t check',
  info: 'Info',
};

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

  return (
    <main className="page">
      <header className="masthead">
        <h1>DNS Report Card</h1>
        <p className="tagline">A plain-English security check of your domain, using only public lookups from your browser.</p>
      </header>

      <form className="search" onSubmit={onSubmit} role="search">
        <label htmlFor="target" className="visually-hidden">
          Domain or web address
        </label>
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
        <button type="submit">Check</button>
      </form>

      {state.phase === 'invalid-target' && (
        <p className="notice" role="alert">
          {state.message}
        </p>
      )}

      {(state.phase === 'running' || state.phase === 'done') && (
        <section className="report" aria-live="polite" aria-busy={state.phase === 'running'}>
          <div className="grade">
            {state.phase === 'running' ? (
              <span className="grade-letter pending">Calculating&hellip;</span>
            ) : state.grading ? (
              <>
                <span className="grade-letter">{state.grading.grade}</span>
                <span className="grade-score">{state.grading.score} / 100</span>
              </>
            ) : (
              <span className="grade-letter pending">No grade</span>
            )}
            <span className="grade-host">{state.hostname}</span>
          </div>

          <div className="cards">
            {state.checks.map((check) => {
              const result = state.results[check.id];
              return result ? (
                <CheckCard key={check.id} title={check.title} result={result} />
              ) : (
                <article key={check.id} className="card loading">
                  <h2>{check.title}</h2>
                  <p>Checking&hellip;</p>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

function CheckCard({ title, result }: { title: string; result: CheckResult }) {
  const copy = explanationFor(result.check, result.status);
  return (
    <article className={`card status-${result.status}`}>
      <h2>{title}</h2>
      <p className="status">{STATUS_LABEL[result.status]}</p>
      <p className="verdict">{result.verdict}</p>
      <p className="checked-name">Checked on {result.checkedName}</p>
      {result.aliasNote && <p className="alias-note">{result.aliasNote}</p>}
      {copy && (
        <>
          <h3>What this means</h3>
          <p>{copy.whatThisMeans}</p>
          {copy.howToFix && (
            <>
              <h3>How to fix</h3>
              <p>{copy.howToFix}</p>
              {copy.example && (
                <pre>
                  <code>{copy.example}</code>
                </pre>
              )}
            </>
          )}
        </>
      )}
      {result.details.length > 0 && (
        <dl className="details">
          {result.details.map((d, i) => (
            <div key={i}>
              <dt>{d.label}</dt>
              <dd>{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
