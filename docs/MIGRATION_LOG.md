# Migration Log (Compatibility-First)

This log tracks actual file moves performed during structure cleanup.
All moves keep root wrappers so old commands continue to work.

## Batch 1 (checks)
Moved to `scripts/checks/`:
- `check_cache.js`
- `check_config.js`
- `check_candles.js`
- `check_futures.js`
- `check_bt_data.js`
- `check_premium_impact.js`

Notes:
- Root wrappers were added for each file.
- `check_config.js` and `check_bt_data.js` still depend on compiled outputs that are currently missing in local `dist/src/*`.
  This was already a runtime dependency issue; move did not introduce it.

## Batch 2 (checks)
Moved to `scripts/checks/`:
- `check_days.js`
- `check_json.js`
- `check_final.js`
- `check_cache_keys.js`

Notes:
- Root wrappers were added for each file.
- `check_cache_keys.js` updated to resolve cache path from `process.cwd()` after relocation.

## Batch 3 (checks)
Moved to `scripts/checks/`:
- `check_may26.js`
- `check_may_live.js`
- `check_may_live2.js`
- `check_may_live3.js`
- `check_may_live4.js`
- `check_may_live5.js`
- `check_may_live6.js`
- `check_may_live7.js`

Notes:
- Root wrappers were added for each file.
- Wrapper execution smoke check passed at module resolution level.
- Runtime execution on this Windows host can fail if external tools are unavailable (example: `sqlite3` CLI), which is expected and not a wrapper issue.

## Batch 4 (analysis)
Moved to `scripts/analysis/`:
- `analyze_c0.js`
- `analyze_entry_timing.js`
- `analyze_late_start.js`

Notes:
- Root wrappers were added for each file.
- `.env` lookup in moved scripts was updated to `process.cwd()` to avoid `__dirname` relocation issues.

## Batch 5A (backtest, low-risk)
Moved to `scripts/backtest/`:
- `backtest_25l.js`
- `backtest_bhav_activate_audit.js`
- `backtest_bhav_all_conditions.js`
- `backtest_bhav_combo.js`
- `backtest_bhav_exit_combo.js`
- `backtest_bhav_fix3.js`
- `backtest_bhav_fixed.js`
- `backtest_bhav_gap_analysis.js`
- `backtest_bhav_honest.js`
- `backtest_bhav_pieces.js`
- `backtest_bhav_sl_audit.js`
- `backtest_bhav_sl_compare3.js`

## Batch 5B (backtest, low-risk)
Moved to `scripts/backtest/`:
- `backtest_bhav_sl_thresh.js`
- `backtest_bhav_sl_type.js`
- `backtest_bhav_v4.js`
- `backtest_bhav_walkforward.js`
- `backtest_fixed_target.js`
- `backtest_honest_v15.js`
- `backtest_max40.js`
- `backtest_maxprofit.js`
- `bt_futures_pnl.js`
- `bt_reality_check.js`

Notes:
- Root wrappers were added for all moved backtest files.
- Remaining backtest files are currently in the risk bucket (mostly `__dirname` and/or module-relative `require('./...')`) and should be migrated with targeted path patches.

## Batch R1 (backtest, risky path patch)
Moved to `scripts/backtest/`:
- `backtest_4rules.js`
- `backtest_ablation.js`
- `backtest_bb5yr.js`
- `backtest_bhav.js`
- `backtest_bhav5yr.js`
- `backtest_bhav_5yr_sweep.js`

Path patching applied after move:
- Replaced `path.join(__dirname, 'cache', ...)` with `path.join(process.cwd(), 'cache', ...)`.
- Replaced dotenv path `path.join(__dirname, '.env')` with `path.join(process.cwd(), '.env')`.
- Replaced output path `path.join(__dirname, '5year-backtest-result.json')` with `path.join(process.cwd(), '5year-backtest-result.json')`.

Notes:
- Root wrappers were added for all moved files.
- These rewrites preserve repository-root behavior after relocation.

## Batch R2 (backtest, risky __dirname patch)
Moved to `scripts/backtest/`:
- `backtest_bhav_may2026.js`
- `backtest_bhav_sweep.js`
- `backtest_bhav_sweep2.js`
- `backtest_ema_pdh.js`
- `backtest_grid.js`
- `backtest_honest_close.js`
- `backtest_slm_check.js`
- `backtest_stress.js`
- `backtest_verify.js`
- `bt_breakout_may2026.js`
- `bt_c1_nosl.js`
- `bt_compare_days.js`

Path patching applied after move:
- Replaced `__dirname` with `process.cwd()` in all moved files.

Notes:
- Root wrappers were added for all moved files.
- This batch targeted scripts where risk came primarily from `__dirname` path anchoring.

## Batch R3 (backtest, mixed risk patch)
Moved to `scripts/backtest/`:
- `bt_5yr_wait.js`
- `bt_compare2.js`
- `bt_compare_ltp.js`
- `bt_compare_reentry.js`
- `bt_drishti_5yr.js`
- `bt_futures_real.js`
- `bt_improve.js`
- `bt_improve_premium.js`
- `bt_inside_compare.js`
- `bt_integrity.js`
- `bt_lastweek.js`
- `bt_may29_30.js`
- `bt_may29_sim.js`
- `bt_monthly_summary.js`
- `bt_old_logic.js`
- `bt_options.js`
- `bt_premium.js`
- `bt_real_premium_drishti.js`
- `bt_reentry_currentonly.js`
- `bt_struct_break.js`
- `bt_struct_reentry.js`

Path patching applied after move (`scripts/patch-backtest-r3.js`):
- Replaced `__dirname` with `process.cwd()`.
- Rewrote `require('./dist/src/...')` to `require(path.join(process.cwd(), 'dist/src/...'))`.
- Rewrote `require('./cache/...')` to `require(path.join(process.cwd(), 'cache/...'))`.
- Auto-inserted `const path = require('path');` where required by rewritten path joins.

Completion check:
- Root backtest scanner reports `WRAPPER: 61`, `RISK: 0`.

## Batch T1 (tmp JS)
Moved to `scripts/tmp/`:
- `tmp_inspect.js`
- `tmp_trace4.js`
- `tmp_trail_analysis.js`
- `tmp_trail2.js`

Path patching applied after move:
- `tmp_trace4.js`: rewired `./dist/src/*` imports to `path.join(process.cwd(), 'dist/src/*')`.
- `tmp_trail_analysis.js`: rewired root file reads (`cache`, `5year-backtest-result.json`, `backtest_bhav.js`) to `process.cwd()` anchored paths.
- `tmp_trail2.js`: rewired `backtest_bhav.js` read to `process.cwd()` anchored path.

Notes:
- Root wrappers were added for all moved tmp JS files.

## Batch P1 (check Python, low-risk)
Moved to `scripts/checks/`:
- `check_db.py`
- `check_db2.py`
- `check_db3.py`
- `check_full_monthly.py`
- `check_futdly.py`
- `check_futdly2.py`
- `check_json.py`
- `check_monthly.py`
- `check_monthly_end.py`
- `check_monthly_section.py`
- `check_monthly2.py`
- `check_monthly3.py`
- `check_monthly4.py`
- `check_page.py`
- `check_page2.py`
- `check_page3.py`
- `check_page4.py`
- `check_prefix.py`
- `check_route.py`
- `check_route2.py`
- `check_sig_monthly.py`
- `check_sig_monthly2.py`
- `check_sig_monthly3.py`
- `check_sig_monthly4.py`
- `check_suffix.py`
- `check_trades.py`

Compatibility wrappers:
- Root wrapper `.py` files now call `runpy.run_path(...)` to execute moved scripts.

Notes:
- This batch excluded Python files containing absolute VPS paths (`/home/ubuntu/...`) to avoid changing semantics without explicit path strategy.

## Batch P2 (check Python, absolute-path group)
Moved to `scripts/checks/`:
- `check_5yr_json.py`
- `check_bt_json.py`
- `check_cache.py`
- `check_cache2.py`
- `check_cache3.py`
- `check_cache4.py`
- `check_daily.py`
- `check_daily_data.py`
- `check_days.py`
- `check_json_structure.py`
- `check_jun26.py`
- `check_jun_candles.py`
- `check_may.py`
- `check_recent.py`
- `check_trades_today.py`

Compatibility wrappers:
- Root wrapper `.py` files call `runpy.run_path(...)` to execute moved scripts.

Completion check:
- Root `check_*.py` files are now wrapperized for compatibility while real scripts live under `scripts/checks/`.

## Batch F1 (fix/patch Python, low-risk)
Moved to `scripts/patch/`:
- `fix_double_patch.py`
- `fix_header_stats.py`
- `fix_prefix.py`
- `fix_qty_mult.py`
- `fix_section_b.py`
- `fix_stat_dynamic.py`
- `fix_stat_line.py`
- `fix_thyr_bug.py`
- `fix_thyr_global.py`
- `patch_candle_and_serverlog.py`
- `patch_drill_empty.py`
- `patch_drill_nodata.py`
- `patch_drishti_signals.py`
- `patch_futures_binary.py`
- `patch_futures_strategy.py`
- `patch_signals_tabs.py`
- `patch_th_drill.py`
- `patch_th_year_btns.py`

## Batch F2 (fix/patch Python, abs-path group)
Moved to `scripts/patch/`:
- `fix_entry_price.py`
- `fix_monthly_5yr.py`
- `fix_monthly_rows.py`
- `fix_sig_monthly.py`
- `fix_thdrill_data.py`
- `patch_entry_price.py`
- `patch_fair_price.py`
- `patch_futures_price.py`
- `patch_monthly_drill.py`
- `patch_opt_expiry_fix.py`
- `patch_opt_history.py`
- `patch_opt_monthly.py`
- `patch_opt_premium.py`
- `patch_opt_ts_fix.py`
- `patch_options_bot.py`
- `patch_real_ltp.py`
- `patch_real_pnl.py`
- `patch_tg_pnl.py`
- `patch_user_settings.py`

Compatibility wrappers:
- Root `fix_*.py` / `patch_*.py` wrappers now call `runpy.run_path(...)` targeting `scripts/patch/`.

## Batch A1/T2 (analysis+tmp Python)
Moved to `scripts/analysis/`:
- `verify_drill.py`
- `verify_monthly.py`
- `stats_check.py`

Moved to `scripts/tmp/`:
- `tmp_fix_drishti_block.py`
- `tmp_fix_drishti_block2.py`
- `tmp_fix_drishti_block3.py`
- `tmp_fix_drishti_block4.py`

Compatibility wrappers:
- Root wrappers now call `runpy.run_path(...)` targeting `scripts/analysis/` and `scripts/tmp/` respectively.

## Batch U1 (utility JS, low-risk)
Moved to `scripts/analysis/`:
- `fetch_candles.js`

Moved to `scripts/sim/`:
- `simulate_june1.js`
- `simulate_options_june4.js`

Compatibility wrappers:
- Root wrappers added for all moved files.

Notes:
- Utility JS scanner indicates 26 remaining files are in risk bucket (mostly absolute VPS paths, `__dirname`, and relative dist/cache imports), so they should be migrated with targeted path rewrites in later batches.

## Batch U2 (utility JS, risky underscore tools)
Moved to `scripts/patch/`:
- `_fix_tsconfig.js`
- `_fix_tsconfig2.js`
- `_mdd.js`
- `_verify.js`

Path patching applied after move:
- Ran `repo:patch-utility-js-paths` on moved files to rewrite path anchors toward `process.cwd()` patterns where applicable.

Compatibility wrappers:
- Root wrappers added for all moved files.

Follow-up fix:
- Corrected malformed rewrites in `scripts/patch/_fix_tsconfig.js`, `scripts/patch/_fix_tsconfig2.js`, `scripts/patch/_mdd.js`, and `scripts/patch/_verify.js`.
- Added syntax validation run (`node --check`) for all four files after correction.

## Batch U3 (utility JS, risky absolute-path group)
Moved to `scripts/data/`:
- `fetch_premium_data.js`
- `gen_futures_daily.js`
- `gen_futures_monthly.js`

Moved to `scripts/analysis/`:
- `probe_json.js`

Pre-move rewrites applied:
- Replaced hardcoded VPS absolute paths (`/home/ubuntu/trading-bot/...`) with `process.cwd()` anchored paths.
- Added cache directory creation guard in `fetch_premium_data.js`.

Compatibility wrappers:
- Root wrappers added for all moved files.

Validation:
- Syntax check passed for all moved files (`node --check`).
- Utility risk scan after U3: `Candidates: 18 | LOW: 0 | RISK: 18 | WRAPPER_IGNORED: 98`.

## Batch U4 (utility JS, cache and __dirname group)
Moved to `scripts/analysis/`:
- `audit_cache.js`
- `crash_audit.js`
- `get_5cap_stats.js`
- `generate_backtest_json.js`

Moved to `scripts/data/`:
- `update_cache.js`

Pre-move rewrites applied:
- Replaced `__dirname`/relative cache paths with `process.cwd()` anchored paths in migrated files.
- Updated dotenv path handling in `update_cache.js` to use `TRADING_BOT_ENV_PATH` fallback.

Compatibility wrappers:
- Root wrappers added for all moved files.

Validation:
- Syntax check passed for all moved files (`node --check`).
- Utility risk scan after U4: `Candidates: 13 | LOW: 0 | RISK: 13 | WRAPPER_IGNORED: 103`.

## Batch U5 (utility JS, dotenv __dirname group)
Moved to `scripts/analysis/`:
- `entry_stats.js`
- `replay_jun4.js`
- `trade_count_stats.js`
- `why_missed.js`

Pre-move rewrites applied:
- Replaced `__dirname` dotenv references with `TRADING_BOT_ENV_PATH` or `process.cwd()` fallbacks.

Compatibility wrappers:
- Root wrappers added for all moved files.

Validation:
- Syntax check passed for all moved files (`node --check`).
- Utility risk scan after U5: `Candidates: 9 | LOW: 0 | RISK: 9 | WRAPPER_IGNORED: 107`.

## Batch U6 (utility JS, dist/cache/remaining risk group)
Moved to `scripts/analysis/`:
- `gen_futures_daily_v2.js`
- `investigate_today.js`
- `probe_data.js`
- `replay_jun1.js`
- `replay_today.js`
- `simulate_june4.js`
- `simulate_today.js`
- `trail_sweep.js`
- `validate_may2026.js`

Pre-move rewrites applied:
- Replaced relative `./dist/...` imports with `process.cwd()` anchored dist paths.
- Replaced relative `./cache/...` reads with `process.cwd()` anchored cache paths.
- Removed hardcoded VPS directory dependency in `simulate_today.js` via `TRADING_BOT_DIR` fallback.

Compatibility wrappers:
- Root wrappers added for all moved files.

Validation:
- Syntax check passed for all moved files (`node --check`).
- Utility risk scan after U6: `Candidates: 0 | LOW: 0 | RISK: 0 | WRAPPER_IGNORED: 116`.

## Python Tooling Update
Added migration helper:
- `scripts/migrate-py-with-wrapper.js`

Added npm command:
- `repo:migrate-py-with-wrapper`

## Batch PY-U1 (Python utility find/inspect group)
Moved to `scripts/tools/`:
- `explain_jun4.py`
- `find_anchor.py`
- `find_hb.py`
- `find_hb2.py`
- `find_route.py`
- `find_sigdrill.py`
- `find_template_end.py`
- `see_sigdrill.py`
- `see_sigdrill2.py`
- `show_line.py`

Compatibility wrappers:
- Root wrappers added for all moved files using `runpy.run_path(...)`.

Validation:
- Syntax check passed for all moved files (`python -m py_compile`).
- Root non-wrapper Python count after batch: `12`.

## Batch PY-U2 (Python utility remaining group)
Moved to `scripts/patch/`:
- `add_5yr_tab.py`
- `undo_5yr_tab.py`
- `rename_bhav.py`
- `rename_strategy.py`

Moved to `scripts/data/`:
- `gen_futures_daily.py`

Moved to `scripts/analysis/`:
- `bt_struct.py`
- `bt_vs_live.py`
- `bt_winrate.py`
- `live_trades_check.py`
- `may_full.py`
- `simulate_today.py`
- `stats5yr.py`

Compatibility wrappers:
- Root wrappers added for all moved files using `runpy.run_path(...)`.

Validation:
- Syntax check passed for all moved files (`python -m py_compile`).
- Cleared transient `__pycache__` folders after validation.
- Root non-wrapper Python count after batch: `0`.

## Guardrail Alignment (Structure Checker)
Updated `scripts/verify-structure.js` allowlist to include known intentional root files used by current compatibility/deploy flows:
- `db.ts`
- `drishti_strategy.ts`
- `mailer.ts`
- `nse.ts`
- `scheduler.ts`
- `scraper.ts`
- `auto_token_check.sh`
- `server.ts.bak`
- `sessions.db`
- `zeroscreen.db`

Validation:
- `repo:verify-structure` now passes without unexpected entries.
- `repo:verify-structure:strict` now passes.

## TypeScript Root Risk Tooling + First Move
Added tooling:
- `scripts/scan-root-ts-risk.js`
- npm command: `repo:scan-ts-risk`

Initial scan result:
- `Total: 12 | LOW: 1 | RISK: 5 | CORE_IGNORED: 6`
- Low-risk candidate identified: `drishti_strategy.ts`

TS migration step (non-breaking):
- Copied canonical implementation to `src/drishti_strategy.ts`.
- Converted root `drishti_strategy.ts` into compatibility re-export wrapper (`export * from './src/drishti_strategy'`).

Validation:
- Re-ran TS risk scan and build after migration.

Follow-up refinement:
- Updated `scripts/scan-root-ts-risk.js` to classify compatibility re-export wrappers as `WRAPPER_IGNORED` so scanner output remains actionable.
- Current TS scan now excludes wrapper false-positives.

Build note:
- `npm run build` currently fails due to pre-existing missing imports in `src/amina-live.ts` (`./market`, `./order`, `./notifier`, `./config`).
- This failure is unrelated to the `drishti_strategy.ts` wrapper migration.

## Batch TS-U1 (root TS duplicate service wrappers)
Converted root duplicate TypeScript service files to compatibility re-export wrappers while keeping canonical implementations in `src/`:
- `db.ts` -> `export * from './src/db'`
- `mailer.ts` -> `export * from './src/mailer'`
- `nse.ts` -> `export * from './src/nse'`
- `scheduler.ts` -> `export * from './src/scheduler'`
- `scraper.ts` -> `export * from './src/scraper'`

Notes:
- This is compatibility-first: root import paths remain valid.
- Scanner noise is reduced and root duplication is minimized without changing runtime entry paths.

## Tooling: Consolidated Repo Health Check
Added:
- `scripts/repo-health-check.js`
- npm command: `repo:health`

Purpose:
- Runs strict structure guard + all active root risk scanners in one command.

Validation:
- `npm run repo:health` returns `Repo health check: PASS` on current state.

## Validation Performed
- Wrapper presence validated.
- Selected wrappers executed.
- Scripts that failed were due to missing local data/artifacts (for example cache files or dist outputs), not missing wrapper wiring.

## Rollback
For any moved file `<name>.js`:
1. Move `scripts/checks/<name>.js` back to root.
2. Remove root wrapper `<name>.js` and restore original content.

Because wrappers are in place, rollback is optional unless direct module-relative assumptions must be preserved.
