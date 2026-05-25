import sqlite3

conn = sqlite3.connect('/root/zeroscreen/zeroscreen.db')
cur = conn.cursor()

print("=== PICK RESULTS BY TYPE ===")
cur.execute("""
    SELECT pick_type,
           COUNT(*) as total,
           SUM(CASE WHEN result='TARGET_HIT' THEN 1 ELSE 0 END) as targets,
           SUM(CASE WHEN result='SL_HIT' THEN 1 ELSE 0 END) as sl_hits,
           SUM(CASE WHEN result IS NULL OR result='' THEN 1 ELSE 0 END) as open_pos
    FROM picks
    GROUP BY pick_type
""")
for row in cur.fetchall():
    ptype, total, tgt, sl, opn = row
    closed = tgt + sl
    wr = round(tgt/closed*100, 1) if closed > 0 else 0
    print(f"  {str(ptype).upper():12} | Total:{total:4} | Target:{tgt:3} | SL:{sl:3} | Open:{opn:3} | WinRate:{wr}%")

print("\n=== CLOSED PICKS — RECENT 30 ===")
cur.execute("""
    SELECT pick_type, stock_symbol, direction, result, created_at
    FROM picks
    WHERE result IN ('TARGET_HIT','SL_HIT')
    ORDER BY created_at DESC
    LIMIT 30
""")
for row in cur.fetchall():
    print(f"  {row[3]:12} | {row[0]:8} | {row[2]:5} | {row[1]:12} | {str(row[4])[:10]}")

print("\n=== SL DISTANCE CHECK (current open picks) ===")
cur.execute("""
    SELECT stock_symbol, direction, pick_type,
           entry_high, stop_loss, target,
           ROUND((entry_high - stop_loss) / entry_high * 100, 2) as sl_pct,
           ROUND((target - entry_high) / entry_high * 100, 2) as tgt_pct
    FROM picks
    WHERE (result IS NULL OR result='') AND status='active'
    ORDER BY created_at DESC
    LIMIT 15
""")
rows = cur.fetchall()
if rows:
    print(f"  {'Symbol':12} {'Dir':5} {'Type':8} {'SL%':>6} {'Tgt%':>6} {'R:R':>6}")
    for r in rows:
        sym, dr, pt, eh, sl, tgt, sl_pct, tgt_pct = r
        if sl_pct and tgt_pct:
            rr = round(abs(tgt_pct)/abs(sl_pct), 1)
        else:
            rr = 0
        print(f"  {sym:12} {dr:5} {pt:8} {str(sl_pct):>6} {str(tgt_pct):>6} {str(rr):>6}")

conn.close()
