# Command Center — Process Management

## Existing PM2 processes (discovered, not created by this phase)

| Process | Role | Notes |
|---|---|---|
| `trading-bot` | The production 10:30 BANKNIFTY Futures engine | **Never renamed, restarted, or duplicated by any CC phase.** `src/server.ts`'s admin bot-control endpoint (`pm2 restart/stop/start trading-bot`) already existed before CC-001 and is untouched. |
| `token-server` | Auto-token-refresh service | Untouched by CC-001–CC-010. Per project memory, it restarts `trading-bot`/`zeroscreen` with `--update-env` on a successful refresh — this behavior is unchanged. |
| `zeroscreen` | This web app (`src/server.ts`) | The one process CC-002/CC-010's `src/db.ts` changes actually run inside, next time it's deployed. |

Per project memory, a duplicate bot-like process (`amina-100-variant-b`)
was previously found and removed as an operational cleanup — unrelated to
Command Center work, mentioned here only so it isn't mistaken for a CC-010
artifact.

## Processes CC-010 does NOT create

`session-runtime-service`, `paper-runtime-worker`, `shadow-runtime-worker`,
`backtest-worker`, and `realtime-gateway` are named in the CC-010 brief as
*possible* future processes. None of them exist today — CC-006/007/008's
Paper/Shadow/Backtest "runtimes" are in-memory objects inside the
standalone frontend's browser process, not separate services. Creating
real standalone workers for these is a backend-architecture decision for a
future phase, not something to invent here without a working API for them
to serve.

## Startup order (for when a real integration exists)

The preferred order from the CC-010 brief, mapped to what's real today:

1. Database (`zeroscreen.db`) — already the first dependency `zeroscreen`
   process needs (`initDb()` runs before `app.listen`).
2. Core backend API — the existing `zeroscreen` Express process.
3. Authentication — built into the same process (`express-session`).
4. Existing token-refresh service — `token-server`, independent process,
   already starts independently of ZeroScreen web app on the VPS.
5. Existing production trading engine — `trading-bot`, independent,
   already running continuously; **CC-010 must never be the reason it
   restarts**.
6. Session service — does not exist as a separate process yet (see above).
7. Real-time gateway — does not exist; CC-008's `SessionRealtimeManager`
   runs client-side only, polling a (currently stubbed) endpoint.
8. Paper/Shadow workers — do not exist as separate processes.
9. Backtest worker — does not exist as a separate process.
10. Frontend — for the *existing* app, the frontend is server-rendered by
    the same `zeroscreen` process (step 2), so there's no separate frontend
    startup step today. The standalone Command Center workspace has never
    been deployed, so it has no place in this sequence yet.

## Rules honored

- No existing process was renamed.
- No duplicate `trading-bot` process was created or started.
- No automatic restart of `trading-bot` was added or triggered by this
  phase (the existing admin-triggered restart endpoint is untouched and
  was not exercised this session).
- Log rotation, restart limits, and persisted PM2 process configuration
  are existing VPS-level operational concerns outside this repo's tracked
  files — not modified, and not fabricated here as if newly configured.
