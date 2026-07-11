# CC-010 — Deployment Plan

Read `docs/command-center/known-limitations.md` (CC-009) first. Nothing in
this document changes that phase's central fact: **the Command Center
frontend has never been mounted into ZeroScreen's real application**, and
this session has no SSH/VPS access to change that. This phase therefore
does the deployment *groundwork* that is safe to do from here — discovery,
flag scaffolding, and documentation — and explicitly does not perform an
actual production deployment, process restart, or infrastructure change.

## Deployment discovery (from reading the repo — not from live VPS access)

| Item | Finding |
|---|---|
| Frontend hosting | Server-rendered by the same Express app as the backend (`src/server.ts` sends full HTML strings per route) — not a separately hosted SPA. The standalone Command Center workspace (`drishti-pro-scalp-dashboard/frontend`, Vite/React) is **not** this app; it has its own build and is not wired in. |
| Backend hosting | Node/Express (`src/server.ts`), run via `ts-node-dev` in dev (`npm run dev`) or compiled (`npm run build` → `tsc`). Listens on `process.env.PORT \|\| 4000`. |
| Database | SQLite, single file `zeroscreen.db`, accessed via a hand-written `sqlite3` wrapper in `src/db.ts` — no separate DB server, no ORM/migration tool. |
| Process manager | PM2 — confirmed by `src/server.ts`'s admin bot-control endpoint, which shells out to `pm2 restart|stop|start trading-bot` (`execSync`, lines ~6186-6192). Per project memory, the known PM2 process set on the VPS is `trading-bot`, `token-server`, and `zeroscreen` (this web app). |
| Existing droplet | A single VPS (per project memory: `139.59.18.52`), not a multi-server or containerized setup. No Docker/Kubernetes evidence found anywhere in the repo. |
| Reverse proxy / SSL | Not discoverable from this repo checkout (likely nginx + certbot on the VPS, per typical ZeroScreen memory notes, but not confirmed — flagged as unverified rather than assumed). |
| Environment files | `.env` (via `dotenv.config()` at the top of `src/server.ts`) holds secrets; the production trading bot has its own separate `.env` on the VPS (`/home/ubuntu/trading-bot/.env`), read directly by `/api/bot/status` to validate the Kite token — confirmed in code. |
| Deployment scripts | No CI/CD pipeline found in this repo (no `.github/workflows`, no `Dockerfile`, no `Procfile`). Deployment appears to be manual (build + PM2 restart on the VPS), consistent with a single-operator personal project. |
| Feature-flag mechanism | Already exists: `app_settings` table (`key`,`value` strings) + `getSetting()` + `featureGate(settingKey, featureName)` middleware (`src/server.ts` ~line 258), used today for `feature_signals`, `feature_paper_trade_bot`, etc. **CC-010 reuses this exact mechanism** — no new flag system was built. |
| Production bot process | `trading-bot` (PM2), the existing 10:30 BANKNIFTY Futures engine — file-based state (`user-settings.json`, `trade-state.json`, `bot-heartbeat.json`, `trades.json`), pushes to this app's `bot_state`/`bot_trades` tables via webhook. |
| Token-refresh process | `token-server` (PM2) — separate process, writes `.env`/`access_token.txt`, restarts `trading-bot`/`zeroscreen` with `--update-env` on successful refresh (per CC-002/CC-006 discovery notes and project memory). |

**Assumptions explicitly avoided per the phase brief**: no Docker, no
Kubernetes, no multi-server topology, no CI/CD, and frontend+backend are
the *same* process for the existing app (not the standalone Command Center
workspace) — all confirmed rather than assumed, by reading the actual code.

## What this phase actually changed

Exactly one additive change: nine feature-flag rows seeded into the
existing `app_settings` table via the existing `INSERT OR IGNORE` seeding
pattern in `src/db.ts` (see `feature-flags.md` for the full list and
defaults). This:

- does not touch any existing table, row, process, or route,
- does not start, stop, or restart `trading-bot`, `token-server`, or
  `zeroscreen`,
- does not create a Command Center route (none exists to gate yet),
- was verified against a scratch copy of `zeroscreen.db` (idempotent
  re-seeding, existing `bot_trades` row count unchanged) — see
  `production-rollout-checklist.md` for how this was tested.

## What this phase deliberately did NOT do

- Did not deploy anything to the VPS (no SSH access in this environment).
- Did not restart, reconfigure, or touch PM2.
- Did not create real monitoring/alerting infrastructure (no monitoring
  stack exists in this repo to extend — see `monitoring-and-alerting.md`
  for what's specified vs. what's implemented).
- Did not mount the Command Center frontend into any route.
- Did not run a database backup (there is no production database reachable
  from this session — see `production-rollout-checklist.md`).

## Recommendation

See the final verification output in this session's reply for the
PROCEED / PROCEED WITH RESTRICTIONS / ROLLBACK decision and its reasoning.
