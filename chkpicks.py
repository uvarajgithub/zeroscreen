import sqlite3
conn = sqlite3.connect('/root/zeroscreen/zeroscreen.db')
cols = [r[1] for r in conn.execute('PRAGMA table_info(picks)').fetchall()]
print('Columns:', cols)
rows = conn.execute("SELECT * FROM picks ORDER BY rowid DESC LIMIT 30").fetchall()
print(f"\nTotal rows in picks: {len(rows)}")
for status in ['active', 'pending', 'triggered', 'expired', 'closed']:
    cnt = conn.execute(f"SELECT COUNT(*) FROM picks WHERE status='{status}'").fetchone()[0]
    if cnt: print(f"  {status}: {cnt}")
print()
for r in rows:
    print(dict(zip(cols, r)))
conn.close()
