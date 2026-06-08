# ZeroScreen Repository Structure Guide

This repository currently contains production code and a large set of research/backtest utilities in the root directory. To avoid breaking existing workflows, this guide defines a phased migration with compatibility-first rules.

## Goals
- Keep current runtime behavior unchanged.
- Make production code easy to find and maintain.
- Introduce guardrails so new files do not increase root clutter.
- Migrate scripts incrementally with wrappers/aliases when needed.

## Canonical Layout (Target)
- `src/` : production TypeScript application code.
- `dist/` : compiled output (generated).
- `public/` : static assets.
- `views/` : server-rendered templates/views.
- `scripts/` : operational and utility scripts.
- `scripts/backtest/` : historical strategy backtests.
- `scripts/checks/` : verification and diagnostic scripts.
- `scripts/analysis/` : one-off analysis scripts.
- `scripts/sim/` : simulation and replay scripts.
- `scripts/patch/` : patch/apply scripts.
- `scripts/tmp/` : temporary local scripts.
- `data/` : generated data artifacts (json/csv/log snapshots that belong in git).
- `docs/` : architecture and process documentation.

## Phase Plan
1. Phase 1 (safe): add structure docs + inventory + guardrail checks. No file moves.
2. Phase 2 (safe moves): move low-risk utility scripts into `scripts/*` with root wrappers if needed.
3. Phase 3 (runtime hardening): isolate production entrypoints and remove duplicate server variants.
4. Phase 4 (cleanup): archive or delete obsolete files after verification.

## Non-Breaking Rules
- Never move production entry files without a compatibility wrapper.
- Keep deployment-critical files where current deploy scripts expect them until deploy scripts are updated.
- Any move must include a dry-run mapping and rollback plan.

## File Placement Rules (from now)
- New production code: `src/`.
- New backtests: `scripts/backtest/`.
- New debug checks: `scripts/checks/`.
- New ad-hoc experiments: `scripts/tmp/`.
- New result json files: `data/` (if intended to keep).

## Current Reality Notes
- Local and VPS deployment currently depend on specific filenames and paths.
- Root contains many historical scripts; immediate bulk moves are high risk.
- Use the inventory script before planning any move batch.
