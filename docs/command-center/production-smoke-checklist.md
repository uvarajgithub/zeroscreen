# Production Smoke Checklist (manual — for use once integrated)

**This checklist has not been executed** — the Command Center frontend is
not mounted into any ZeroScreen route yet (see `known-limitations.md`). It
is written now so it is ready to run the moment integration happens, and so
"what does a safe smoke test look like" is answered before that day.

Non-destructive by design. **Do not place a live order solely for this
test.**

1. [ ] Open ZeroScreen.
2. [ ] Open the (future) Command Center route.
3. [ ] Verify the production tab (`10:30 LIVE`) is pinned and appears first.
4. [ ] Verify no duplicate runtime starts (check PM2/process list on the
       VPS shows exactly one `trading-bot` process, as already required by
       `docs/../vps_status_2026_06_09_verified.md`-style checks — this is
       an existing operational concern, not new).
5. [ ] Verify current engine status matches the bot's actual heartbeat.
6. [ ] Verify token state shown matches the token-server's real status
       (no raw token value visible anywhere in the UI or browser devtools).
7. [ ] Verify broker connection state matches reality.
8. [ ] Verify account balance matches the broker's actual balance.
9. [ ] Verify current-day P&L matches the existing `/api/bot/status` value.
10. [ ] Verify current position (or the empty state) matches the real bot.
11. [ ] Verify order history matches `bot_trades`/broker order book.
12. [ ] Verify execution history matches actual fills.
13. [ ] Verify daily statement history is available and correct.
14. [ ] Open a Paper session.
15. [ ] Confirm Paper data (P&L, position, orders) is empty/simulated and
        does not resemble or duplicate the production values from step 8–12.
16. [ ] Switch back to the production tab.
17. [ ] Confirm production values are unchanged from steps 8–12 (not reset,
        not merged with Paper).
18. [ ] Reload the page.
19. [ ] Confirm the production session and the Paper session both recover
        without duplication (no second `10:30 LIVE` tab, no second Paper tab).
20. [ ] Close the Paper tab.
21. [ ] Confirm production is unaffected (still running, same values).

## Sign-off

| Field | Value |
|---|---|
| Date executed | _(not yet — pending real integration)_ |
| Executed by | — |
| Environment | — |
| Result | — |
