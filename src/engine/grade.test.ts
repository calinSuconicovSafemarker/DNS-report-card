import { describe, expect, it } from 'vitest';
import { gradeResults } from './grade';
import type { CheckResult, Status } from './types';

// The six real weights can't produce a Score within 0.5 below a threshold, so
// this exercises the grading arithmetic directly with arbitrary weights.
const result = (status: Status): CheckResult => ({ check: 'dnssec', status, verdict: '', checkedName: 'example.com', details: [] });

describe('Grade thresholds', () => {
  it.each([
    [179, 21, 90, 'B'], // 89.5: shown as 90, but below the A threshold
    [149, 51, 75, 'C'], // 74.5
    [180, 20, 90, 'A'], // exactly 90
  ])('pass weight %i, fail weight %i: Score %i, Grade %s (thresholds apply to the unrounded Score)', (pass, fail, score, grade) => {
    expect(gradeResults([{ result: result('pass'), weight: pass }, { result: result('fail'), weight: fail }], 6)).toMatchObject({
      score,
      grade,
    });
  });
});
