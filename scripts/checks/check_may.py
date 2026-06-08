import json

j = json.load(open("/home/ubuntu/trading-bot/5year-backtest-result.json"))
daily = j["daily"]
no_trade = j.get("noTradeDays", [])
no_trade_dates = {d["date"] for d in no_trade}

# May 2026 from backtest
may_days = [d for d in daily if d["date"].startswith("2026-05")]
print("=== MAY 2026 — BACKTEST DAYS ===")
print(f"{'Date':<14} {'BT P&L':>10}  Status")
print("-" * 40)
for d in may_days:
    status = "LOSS" if d["bbPnL"] < 0 else ("FLAT" if d["bbPnL"] == 0 else "WIN")
    marker = " <<<" if d["bbPnL"] < 0 else ""
    print(f"{d['date']:<14} {d['bbPnL']:>+8.1f} pts  {status}{marker}")

# no-trade days in May
may_nt = [d for d in no_trade if d["date"].startswith("2026-05")]
if may_nt:
    print(f"\nNo-trade days in May (BT): {[d['date'] for d in may_nt]}")

# summary
losses = [d for d in may_days if d["bbPnL"] < 0]
wins   = [d for d in may_days if d["bbPnL"] > 0]
print(f"\nBT Total May: {sum(d['bbPnL'] for d in may_days):+.1f} pts")
print(f"Win days: {len(wins)} | Loss days: {len(losses)} | No-trade: {len(may_nt)}")
