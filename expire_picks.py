import sqlite3
from datetime import datetime, date

conn = sqlite3.connect('/root/zeroscreen/zeroscreen.db')

today = date.today().isoformat()  # '2026-05-07'

# 1. Expire stale intraday active picks (published before today)
r1 = conn.execute("""
  UPDATE picks SET status='expired'
  WHERE status='active' AND created_by IS NULL
    AND pick_type='intraday'
    AND date(published_at) < ?
""", (today,))
print(f"Expired stale intraday picks: {r1.rowcount}")

# 2. Expire stale swing active picks (older than 7 days)
r2 = conn.execute("""
  UPDATE picks SET status='expired'
  WHERE status='active' AND created_by IS NULL
    AND pick_type='swing'
    AND published_at < datetime('now', 'localtime', '-7 days')
""")
print(f"Expired stale swing picks: {r2.rowcount}")

# 3. Show remaining active
rows = conn.execute("""
  SELECT id, stock_symbol, pick_type, status, date(published_at), entry_price
  FROM picks WHERE status='active'
  ORDER BY published_at DESC
""").fetchall()
print(f"\nRemaining active picks ({len(rows)}):")
for r in rows:
    print(f"  id={r[0]} {r[1]} ({r[2]}) pub:{r[4]} entry:{r[5]}")

# 4. Count orphaned entry_triggered with no exit
orphans = conn.execute("""
  SELECT COUNT(*) FROM picks 
  WHERE result='entry_triggered' AND result_price IS NULL AND status='expired'
""").fetchone()[0]
print(f"\nOrphaned 'entry_triggered' with no exit: {orphans}")

conn.commit()
conn.close()
print("\nDone.")
