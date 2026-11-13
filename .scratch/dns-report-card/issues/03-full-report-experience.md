# 03: Full Report experience

**What to build:** The complete visual Report: a large Grade ring, a 3×2 grid of six Check cards that load independently, expandable cards, final grading, and polish (themes, mobile, accessibility). Cards for Checks not yet built can render placeholders; each later Check ticket plugs into this grid. See the spec, "Report and Grade", "Check cards (common)" and "Look and feel".

**Blocked by:** 01

**Status:** resolved

- [x] Grade ring shows the letter and Score; it shows "Calculating…" until every graded Check has settled
- [x] 3×2 grid with skeleton placeholders; each card fills in as soon as its own result arrives
- [x] Cards show the Status as an icon plus a word, a one-line verdict, and the name checked. They expand (keyboard accessible) to show What this means, How to fix (copy-paste examples render as copyable code), and raw details.
- [x] Couldn't check state shows "Couldn't check — no response from the service". Info state is supported. Neither counts toward the Grade.
- [x] Grading: Pass 1, Warning 0.5, Fail 0. Weights: DNSSEC 25, Nameservers 20, Certificate 20, CAA 15, HTTPS record 10, HSTS preload 10. Excluded Checks are dropped and the remaining weights rescaled. A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, else F.
- [x] "Based on N of 6 checks" appears when any Check was excluded
- [x] "Run again" button
- [x] Light and dark themes via CSS design tokens; responsive down to phone width; respects `prefers-reduced-motion`; WCAG AA contrast; icons from `lucide-react`; no component library
- [x] Engine tests cover grading with exclusions and the Couldn't check outcome (e.g. a check whose service times out)
