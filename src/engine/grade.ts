import type { CheckResult, Status } from './types';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface Grading {
  /** 0-100, rounded. */
  score: number;
  grade: Grade;
  /** Number of Check results that counted toward the Score. */
  gradedCount: number;
  /** Number of Checks in the Report (always six); "Based on gradedCount of totalCount checks". */
  totalCount: number;
}

const POINTS: Partial<Record<Status, number>> = { pass: 1, warning: 0.5, fail: 0 };

/**
 * Pass 1, Warning 0.5, Fail 0, weighted by each Check's `weight`. Couldn't
 * check and Info are excluded and the remaining weights rescaled.
 * Returns null when nothing could be graded.
 */
export function gradeResults(
  results: { result: CheckResult; weight: number }[],
  totalCount: number,
): Grading | null {
  let earned = 0;
  let possible = 0;
  let gradedCount = 0;
  for (const { result, weight } of results) {
    const points = POINTS[result.status];
    if (points === undefined) continue;
    earned += points * weight;
    possible += weight;
    gradedCount++;
  }
  if (possible === 0) return null;
  const score = Math.round((earned / possible) * 100);
  return { score, grade: toGrade(score), gradedCount, totalCount };
}

function toGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
