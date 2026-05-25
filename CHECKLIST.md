# ZeroScreen + Trading Bot — Update Checklist

> Last updated: May 25, 2026  
> Edit this file to track what's done / pending.

---

## 1. Strategy Updates (Trading Bot)

| # | Task | Status |
|---|------|--------|
| S1 | BHAV strategy deployed (SL=150, LOCK20 trail, PDH/PDL context) | ✅ Done |
| S2 | Entry window: first 8 candles (~9:15–11:15 AM) | ✅ Done |
| S3 | Context rules: ABOVE_PDH / BELOW_PDL / INSIDE | ✅ Done |
| S4 | Candle-close SL (no intrabar wick stops) | ✅ Done |
| S5 | Max trades: 5/day | ✅ Done |
| S6 | Re-entry opposite direction after exit | ✅ Done |
| S7 | BHAV backtest: ₹31,06,951 (5yr), WR 74.6% | ✅ Verified |
| S8 | Paper mode only (no real orders) | ✅ Done |
| S9 | Review 2026 monthly performance in live vs backtest | ⬜ Pending |
| S10 | Add BHAV Variant B comparison chart to dashboard | ⬜ Pending |

---

## 2. Dashboard Elements (ZeroScreen `/dashboard`)

> ⚠️ Use `dist/server.js` directly (from `.bak`). Never run `npx tsc` for dashboard changes.

| # | Task | Status |
|---|------|--------|
| D1 | BHAV LIVE tab — stab-wrap card style | ✅ Done |
| D2 | Show daily P&L (bot + paper) | ✅ Done |
| D3 | Trade list with entry/exit/P&L | ✅ Done |
| D4 | Bot status badge (online/offline) | ✅ Done |
| D5 | BHAV context label (ABOVE_PDH / BELOW_PDL / INSIDE) | ⬜ Pending |
| D6 | Trail vs LOCK50 comparison tab | ⬜ Pending |
| D7 | Confidence badge on pick cards (green/yellow/red) | ✅ Done |
| D8 | Pick result badges (✅ Target Hit / 🛑 SL Hit) | ✅ Done |
| D9 | Equity curve chart (cumulative P&L over time) | ⬜ Pending |
| D10 | Win rate display on dashboard | ⬜ Pending |
| D11 | Monthly P&L summary table (2026) | ⬜ Pending |

---

## 3. Telegram Notifications

| # | Task | Status |
|---|------|--------|
| T1 | 15-min candle message (9:30–15:30, single consolidated msg) | ✅ Done |
| T2 | Token VALID/EXPIRED in every candle message | ✅ Done |
| T3 | 8:30 AM morning message — yesterday P&L + today picks | ✅ Done |
| T4 | 3:31 PM EOD message — bot P&L + paper P&L + tomorrow picks | ✅ Done |
| T5 | Trade ENTRY message on signal | ✅ Done |
| T6 | Trade EXIT message (trail/SL/EOD) | ✅ Done |
| T7 | LOCK50 In-Trade format (Entry · SL · pts gathered · day P&L) | ✅ Done |
| T8 | Remove OHLC line from candle message | ✅ Done |
| T9 | Hide "+0 pts" when no trades yet | ✅ Done |
| T10 | BHAV context label in candle message (`🏷️ *BHAV* · ABOVE_PDH`) | ✅ Done |
| T11 | Silence daily-reminder.js (was sending 9 msgs/day) | ✅ Done |
| T12 | Telegram Price Alert for ZeroScreen users (`checkPriceAlerts()`) | ⬜ Pending |
| T13 | Weekly paper trade digest via Telegram | ⬜ Pending |

---

## 4. ZeroScreen App — Feature Queue

| # | Task | Status |
|---|------|--------|
| Z1 | ZeroCoins system (coins col, coins_log table, /my-coins page) | ⬜ Pending |
| Z2 | Admin nav cleanup (group: Users/Content/Bot/System) | ⬜ Pending |
| Z3 | Near 52W High Breakout preset on /my-alerts | ⬜ Pending |
| Z4 | "Check Alerts Now" button → run alerts instantly | ⬜ Pending |
| Z5 | Weekly Paper Digest Email (cron Sun 8:30 AM IST) | ⬜ Pending |

---

## Notes

- **Bot files to patch**: `/home/ubuntu/trading-bot/dist/src/index.js` and `strategy.js`  
- **Dashboard file**: `/root/zeroscreen/dist/server.js` (restore from `.bak` before editing)  
- **Never recompile** trading-bot or dashboard (patches will be lost)  
- **Rollback BHAV**: see `trading-bot-patches.md` → Rollback Command section
