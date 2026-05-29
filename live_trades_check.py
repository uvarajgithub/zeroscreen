import sqlite3, json
from collections import defaultdict

con = sqlite3.connect('/root/zeroscreen/zeroscreen.db')
cur = con.cursor()

# Check bot_trades structure
cur.execute("PRAGMA table_info(bot_trades)")
cols_info = cur.fetchall()
print("Columns:", [c[1] for c in cols_info])
cur.execute("SELECT * FROM bot_trades ORDER BY rowid DESC LIMIT 3")
cols = [d[0] for d in cur.description]
rows = cur.fetchall()
for r in rows:
    print(dict(zip(cols, r)))

print()

# Count total live trades
cur.execute("SELECT COUNT(*), MIN(date), MAX(date) FROM bot_trades")
cnt, mn, mx = cur.fetchone()
print(f"Total bot_trades: {cnt}  |  From: {mn}  |  To: {mx}")

print()

# Group by date and sum pnl
cur.execute("SELECT date, pnl, direction FROM bot_trades ORDER BY date")
rows = cur.fetchall()

daily = defaultdict(lambda: {'pnl':0,'trades':0,'wins':0})
for date, pnl, direction in rows:
    if not date: continue
    dk = str(date)[:10]
    daily[dk]['pnl'] += pnl or 0
    daily[dk]['trades'] += 1
    if (pnl or 0) > 0: daily[dk]['wins'] += 1

print(f"{'Date':<12} {'Live P&L':>10}  {'T':>3}  {'W':>3}  {'Rs':>10}")
print("-"*45)
for dk in sorted(daily.keys()):
    d = daily[dk]
    rs = round(d['pnl'] * 15)
    print(f"{dk}  {d['pnl']:>+8.1f} pts  {d['trades']:>3}  {d['wins']:>3}  Rs{rs:>+,}")

print(f"\nTotal days: {len(daily)}")
print(f"Total live P&L: {sum(d['pnl'] for d in daily.values()):+.1f} pts")
