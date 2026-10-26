# SRS Regression Audit — 2026-10-26

Baseline: 56 PASS / 0 FAIL / 6 PARTIAL (P1) / 19 BROWSER (human-run verify 2026-05-02)

## Failing Check

**Check 7 — Deployment configs:** `vercel.json` is missing.

- Introduced by commit `50c4288` (2026-05-18): _"fix: remove vercel.json, use dashboard overrides"_
- `Procfile`, `railway.json`, `docker-compose.yml`, and `apps/web/next.config.js` (`output: 'standalone'`) are all present.

## Soft Flag (not a hard regression)

**Check 2 — Frontend algorithm imports (DP-01):** `grep -rciE 'kalman|ewma|processLayer'` reports 4 matches in `apps/web/app/dashboard/predictions/page.tsx`.
All 4 are UI label strings (e.g., `'Baseline (EWMA + trend)'`) — no algorithm logic or imports. Not a true DP-01 violation but the count exceeds the expected 0.

## All Other Checks: PASS

| # | Check | Result |
|---|-------|--------|
| 1 | Type-check server + web | ✓ Exit 0 (requires `packages/shared` tsc build first in fresh clones) |
| 2 | Frontend algorithm imports | Soft flag (see above) |
| 3 | Algorithm pipeline L1–L8 | ✓ All 8 layers present (L2 as `calcCELI`, L7 as `processLayer7`) |
| 4 | Route inventory ≥33 | ✓ 52 routes |
| 5 | Required schema fields | ✓ dataSource, simulated, alertThresholds, AlgorithmState, Simulation all present |
| 6 | Spec endpoints (12) | ✓ All present |
| 7 | Deployment configs | ✗ `vercel.json` missing |
