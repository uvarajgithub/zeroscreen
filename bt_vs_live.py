import sqlite3, json, os

con = sqlite3.connect('/root/zeroscreen/zeroscreen.db')
cur = con.cursor()
cur.execute('SELECT COUNT(*) FROM bot_trades')
print('Total bot_trades rows:', cur.fetchone()[0])
cur.execute('SELECT MIN(trade_date), MAX(trade_date) FROM bot_trades')
print('Date range:', cur.fetchone())
cur.execute('SELECT trade_date, direction, entry_price, exit_price, pnl, exit_reason FROM bot_trades ORDER BY trade_date')
rows = cur.fetchall()
print("\nAll stored bot_trades:")
for r in rows:
    print(f"  {r[0][:10]}  {r[1]}  entry={r[2]:.0f}  exit={r[3]:.0f}  pnl=Rs{r[4]:+,.0f}  reason={r[5]}")

print()
f = '/home/ubuntu/trading-bot/daily-pnl-log.json'
if os.path.exists(f):
    logs = json.load(open(f))
    print("=== daily-pnl-log.json (BT vs Live) ===")
    for l in logs:
        btpnl = l.get('btPnl', 0)
        livepnl = l.get('actualPnl', 0)
        trades = l.get('actualTrades', 0)
        note = l.get('note', '')
        match = 'MATCH' if abs(btpnl - livepnl) < 30 else ('BOT OFFLINE/ISSUE' if trades == 0 else 'DIFF')
        print(f"  {l['date']}  BT={btpnl:+.0f} pts  Live={livepnl:+.0f} pts  Trades={trades}  [{match}]  {note}")
