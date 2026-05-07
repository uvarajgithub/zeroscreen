import sqlite3
conn = sqlite3.connect('/root/zeroscreen/zeroscreen.db')
rows = conn.execute("""
  SELECT id, stock_symbol, pick_type, status, date(published_at), entry_price, entry_at, result
  FROM picks 
  WHERE result='entry_triggered' AND result_price IS NULL
  ORDER BY published_at DESC
""").fetchall()
print(f"Orphaned entry_triggered picks ({len(rows)}):")
for r in rows:
    print(f"  id={r[0]} {r[1]} ({r[2]}) status={r[3]} pub:{r[4]} entry_price={r[5]} entered:{r[6]}")
conn.close()
