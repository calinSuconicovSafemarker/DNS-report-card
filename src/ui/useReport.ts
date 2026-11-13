import { useCallback, useRef, useState } from 'react';
import { runReport } from '../engine/report';
import type { Grading } from '../engine/grade';
import type { CheckId, CheckResult } from '../engine/types';

export type ReportState =
  | { phase: 'idle' }
  | { phase: 'invalid-target'; message: string }
  | {
      phase: 'running' | 'done';
      hostname: string;
      checks: { id: CheckId; title: string }[];
      results: Partial<Record<CheckId, CheckResult>>;
      grading: Grading | null;
    };

/**
 * Drives the Report engine and folds its events into UI state.
 * A newer run supersedes an older one; stale events are dropped.
 */
export function useReport(onHostname: (hostname: string) => void) {
  const [state, setState] = useState<ReportState>({ phase: 'idle' });
  const runId = useRef(0);

  const start = useCallback(
    async (target: string) => {
      const id = ++runId.current;
      for await (const event of runReport(target, { fetch: (...args) => fetch(...args) })) {
        if (id !== runId.current) return;
        switch (event.type) {
          case 'invalid-target':
            setState({ phase: 'invalid-target', message: event.message });
            break;
          case 'started':
            onHostname(event.hostname);
            setState({ phase: 'running', hostname: event.hostname, checks: event.checks, results: {}, grading: null });
            break;
          case 'check':
            setState((s) =>
              s.phase === 'running' ? { ...s, results: { ...s.results, [event.result.check]: event.result } } : s,
            );
            break;
          case 'graded':
            setState((s) => (s.phase === 'running' ? { ...s, phase: 'done', grading: event.grading } : s));
            break;
        }
      }
    },
    [onHostname],
  );

  return { state, start };
}
