import sqlite3
conn = sqlite3.connect('/root/zeroscreen/zeroscreen.db')

# Mark orphaned entry_triggered picks as 'closed_expired'
# These entered but never got an exit - mark them so they stop cluttering In Position tab
r = conn.execute("""
  UPDATE picks 
  SET result='closed_no_exit', status='expired'
  WHERE result='entry_triggered' AND result_price IS NULL AND status='expired'
""")
print(f"Marked {r.rowcount} orphaned entry_triggered picks as closed_no_exit")

# Verify remaining state
print("\nAll active picks remaining:")
rows = conn.execute("SELECT id, stock_symbol, pick_type, status, result, date(published_at) FROM picks WHERE status='active'").fetchall()
for r in rows: print(f"  {r}")

print("\nAll entry_triggered remaining:")
rows2 = conn.execute("SELECT id, stock_symbol, pick_type, status, result FROM picks WHERE result='entry_triggered'").fetchall()
for r in rows2: print(f"  {r}")
if not rows2: print("  None - all cleared!")

conn.commit()
conn.close()
print("\nDone.")
