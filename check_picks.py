import sqlite3
c = sqlite3.connect('/root/zeroscreen/zeroscreen.db')
rows = c.execute('SELECT stock_symbol, entry_low, entry_high, result FROM picks ORDER BY created_at DESC LIMIT 10').fetchall()
for r in rows:
    mid = (r[1] + r[2]) / 2
    qty = max(1, int(5000 / mid)) if mid > 0 else 1
    print(f'{r[0]:15} entry={r[1]}-{r[2]} mid={mid:.0f} qty@5000={qty} result={r[3]}')
