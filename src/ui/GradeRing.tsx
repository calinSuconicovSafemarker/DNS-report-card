import type { Grading } from '../engine/grade';

const RADIUS = 68;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The big Grade ring: the arc fills to the Score and takes the Grade's color.
 * Until every graded Check has settled it shows "Calculating…" instead, so the
 * Grade never changes under the reader.
 */
export function GradeRing({ grading, settled }: { grading: Grading | null; settled: boolean }) {
  const tone = !settled ? 'pending' : grading ? `grade-${grading.grade.toLowerCase()}` : 'none';
  const offset = settled && grading ? CIRCUMFERENCE * (1 - grading.score / 100) : CIRCUMFERENCE;
  const label = !settled
    ? 'Grade: calculating'
    : grading
      ? `Grade ${grading.grade}, Score ${grading.score} out of 100`
      : 'No Grade: no check could be graded';

  return (
    <div className={`ring ${tone}`} role="img" aria-label={label}>
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle className="ring-track" cx="80" cy="80" r={RADIUS} />
        {settled ? (
          <circle
            className="ring-arc"
            cx="80"
            cy="80"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        ) : (
          <circle
            className="ring-spinner"
            cx="80"
            cy="80"
            r={RADIUS}
            strokeDasharray={`${CIRCUMFERENCE * 0.22} ${CIRCUMFERENCE}`}
          />
        )}
      </svg>
      <div className="ring-center" aria-hidden="true">
        {!settled ? (
          <span className="ring-pending">Calculating…</span>
        ) : grading ? (
          <>
            <span className="ring-letter">{grading.grade}</span>
            <span className="ring-score">
              {grading.score}
              <span className="ring-score-max"> / 100</span>
            </span>
          </>
        ) : (
          <span className="ring-pending">No grade</span>
        )}
      </div>
    </div>
  );
}
