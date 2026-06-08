import json, os

bt = json.load(open("/home/ubuntu/trading-bot/5year-backtest-result.json"))
daily = {d["date"]: d["bbPnL"] for d in bt["daily"] if d["date"].startswith("2026-05")}
no_trade = {d["date"] for d in bt.get("noTradeDays", []) if d["date"].startswith("2026-05")}

# Load live pnl log
live_log = []
path = "/home/ubuntu/trading-bot/daily-pnl-log.json"
if os.path.exists(path):
    live_log = json.load(open(path))
live_map = {d["date"]: d for d in live_log if d["date"].startswith("2026-05")}

# Load trades.json for actual live pnl per day
trades_path = "/home/ubuntu/trading-bot/trades.json"
trades_by_date = {}
if os.path.exists(trades_path):
    trades = json.load(open(trades_path))
    for t in trades:
        if isinstance(t, dict):
            date = t.get("date", t.get("exitTime", ""))[:10]
            if date.startswith("2026-05"):
                trades_by_date.setdefault(date, []).append(t)

# All May dates
from datetime import date, timedelta
all_dates = []
d = date(2026, 5, 1)
while d <= date(2026, 5, 29):
    if d.weekday() < 5:  # Mon-Fri only
        all_dates.append(d.isoformat())
    d += timedelta(days=1)

print(f"{'Date':<13} {'BT P&L':>10}  {'BT':>6}  {'Live P&L':>10}  Note")
print("-" * 65)
for dd in all_dates:
    bt_pnl = daily.get(dd)
    if bt_pnl is None and dd not in no_trade:
        # future or holiday
        bt_str = "—"
        bt_res = "—"
    elif dd in no_trade:
        bt_str = "0 (NT)"
        bt_res = "NT"
        bt_pnl = 0
    else:
        bt_str = f"{bt_pnl:+.1f} pts"
        bt_res = "LOSS" if bt_pnl < 0 else "WIN"

    # Live P&L
    live_pnl = None
    note = ""
    if dd in live_map:
        ld = live_map[dd]
        live_pnl = ld.get("actualPnl")
        note = ld.get("note", "")
    elif dd in trades_by_date:
        ts = trades_by_date[dd]
        live_pnl = sum(t.get("pnl", t.get("points", 0)) for t in ts)
        note = f"{len(ts)} trade(s)"

    if live_pnl is None:
        live_str = "—"
    else:
        live_str = f"{live_pnl:+.1f} pts"

    print(f"{dd:<13} {bt_str:>10}  {bt_res:>6}  {live_str:>10}  {note}")

print()
print(f"BT May total: {sum(v for v in daily.values()):+.1f} pts")
