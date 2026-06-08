import json, os
from datetime import datetime, timedelta

bot_dir = "/home/ubuntu/trading-bot"

# Load trades
trades = json.load(open(f"{bot_dir}/trades.json"))
# Load daily pnl log if exists
dpnl = []
try:
    dpnl = json.load(open(f"{bot_dir}/daily-pnl-log.json"))
except:
    pass

# Get last 5 trading days from trades
by_day = {}
for t in trades:
    if not t.get("date"): continue
    d = t["date"][:10]
    if d not in by_day: by_day[d] = []
    by_day[d].append(t)

print("=== RECENT TRADES (last 5 days) ===\n")
for d in sorted(by_day.keys())[-5:]:
    day_trades = by_day[d]
    day_pnl = sum(t.get("pnl", 0) for t in day_trades if t.get("exitPrice", 0) > 0)
    print(f"--- {d}  |  net: {day_pnl:+.1f} pts  |  {len([t for t in day_trades if t.get('exitPrice',0)>0])} closed trades ---")
    for t in day_trades:
        if not t.get("exitPrice", 0): continue
        entry = t.get("entryPrice", 0)
        ext   = t.get("exitPrice", 0)
        pts   = t.get("pnl", 0)
        dir_  = t.get("direction","?")
        rsn   = t.get("reasonExit","?")
        tm    = t["date"][11:16] if len(t["date"])>10 else ""
        print(f"  {tm}  {dir_:2}  entry={entry:.0f}  exit={ext:.0f}  {pts:+.1f}pts  [{rsn}]")
    print()
