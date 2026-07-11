# Command Center — Feature Flags

Mechanism: the existing `app_settings` table (`key TEXT`, `value TEXT`),
read via `getSetting(key)` and gated with the existing `featureGate(settingKey,
featureName)` Express middleware (`src/server.ts`). No new flag system was
introduced — this reuses exactly what `feature_signals`,
`feature_paper_trade_bot`, etc. already use.

**Note on `featureGate` polarity**: the existing helper treats a *missing*
row as enabled (`!== "false"`). That is safe for optional convenience
features but would be unsafe for CC-010's higher-risk flags if their rows
were ever missing. This phase seeds all nine rows explicitly at `initDb()`
time (via `INSERT OR IGNORE`, so existing values are never overwritten on
redeploy) — so the "missing row" case cannot occur in practice. Whoever
wires the real gating logic for these flags should still use an explicit
`getSetting(key) === "true"` check (default-closed) for the higher-risk
flags, not the default-open `featureGate` as-is, out of caution.

## Flags and default production values

| Flag | Default | Meaning |
|---|---|---|
| `commandCenterEnabled` | `true` | Master switch — the Command Center page itself is reachable. |
| `commandCenterReadOnly` | `true` | Stage 1: dashboard observes production, no controls act on anything. |
| `commandCenterControlsEnabled` | `false` | Stage 2: Start/Pause/Resume/Stop become live against the real engine. |
| `simulationSessionsEnabled` | `false` | Master switch for Paper/Shadow session creation (in addition to the per-mode flags below). |
| `paperSessionsEnabled` | `false` | Stage 3: Paper session creation. |
| `shadowSessionsEnabled` | `false` | Stage 4: Shadow session creation. |
| `backtestSessionsEnabled` | `false` | Stage 5: Backtest session creation. |
| `additionalLiveSessionsEnabled` | `false` | Stage 7 — a second LIVE session. CC-006's `SessionFactory` already hard-rejects this in code regardless of this flag; the flag exists for the operational layer (e.g. hiding the option in a future UI), not as the only safeguard. |
| `emergencyControlsEnabled` | `false` | Stage 6: Emergency Stop. Gated separately from normal Start/Stop because of its destructive nature. |

## Where they are seeded

`src/db.ts`, inside `initDb()`, immediately after the CC-002 schema block:

```
INSERT OR IGNORE INTO app_settings (key,value) VALUES ('commandCenterEnabled','true');
INSERT OR IGNORE INTO app_settings (key,value) VALUES ('commandCenterReadOnly','true');
INSERT OR IGNORE INTO app_settings (key,value) VALUES ('commandCenterControlsEnabled','false');
INSERT OR IGNORE INTO app_settings (key,value) VALUES ('simulationSessionsEnabled','false');
INSERT OR IGNORE INTO app_settings (key,value) VALUES ('paperSessionsEnabled','false');
INSERT OR IGNORE INTO app_settings (key,value) VALUES ('shadowSessionsEnabled','false');
INSERT OR IGNORE INTO app_settings (key,value) VALUES ('backtestSessionsEnabled','false');
INSERT OR IGNORE INTO app_settings (key,value) VALUES ('additionalLiveSessionsEnabled','false');
INSERT OR IGNORE INTO app_settings (key,value) VALUES ('emergencyControlsEnabled','false');
```

`INSERT OR IGNORE` means: on a fresh database these rows are created with
the safe defaults above; on an existing database (including production,
once this migration is ever actually deployed there) any already-set value
is left untouched — this seeding can never silently reset an operator's
prior flag choice back to default.

## How to change a flag (once a real admin UI exists)

Today, the only existing admin surface for `app_settings` values is
whatever ZeroScreen's admin pages already use for other `feature_*` flags
(e.g. `/admin/settings` — not modified by this phase). No Command-Center-
specific admin UI was built; that is a UI feature, out of scope for a
"deployment and operations phase only."

## Verification performed this phase

Seeded against a scratch copy of the real `zeroscreen.db` (never the live
file): all nine flags present with the correct default value, idempotent
across repeated `initDb()` calls (no duplicate rows), and `bot_trades` row
count confirmed unchanged before/after. See `production-rollout-checklist.md`.
