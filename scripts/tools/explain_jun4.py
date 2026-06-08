import json, sqlite3, os

# Check backtest monthly data for Jun 2024
j = json.load(open("/home/ubuntu/trading-bot/5year-backtest-result.json"))
m = j["monthly"].get("2024-06")
if m:
    print(f"Jun 2024: {m['bbTrades']} trades, {m['bbWins']} wins, total {m['bbTotal']:.1f} pts")

# Check if we have bhav/candle DB
dbs = [
    "/root/zeroscreen/zeroscreen.db",
    "/home/ubuntu/trading-bot/bhav.db",
    "/home/ubuntu/trading-bot/candles.db",
]
for db in dbs:
    if os.path.exists(db):
        print(f"\nFound DB: {db}")
        try:
            con = sqlite3.connect(db)
            cur = con.cursor()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [r[0] for r in cur.fetchall()]
            print(f"  Tables: {tables}")
            # Look for BANKNIFTY candles for Jun 4 2024
            for t in tables:
                try:
                    cur.execute(f"SELECT * FROM {t} WHERE date LIKE '2024-06-04%' LIMIT 5")
                    rows = cur.fetchall()
                    if rows:
                        print(f"  [{t}] Jun4 rows: {rows[:3]}")
                except: pass
            con.close()
        except Exception as e:
            print(f"  Error: {e}")

# Also check if there's any bhav candle json
for f in ["/home/ubuntu/trading-bot/candles-2024.json", "/home/ubuntu/trading-bot/bhav-candles.json"]:
    if os.path.exists(f): print(f"\nFound: {f}")
