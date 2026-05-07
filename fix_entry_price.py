import sqlite3
c = sqlite3.connect('/root/zeroscreen/zeroscreen.db')
c.execute("UPDATE picks SET entry_price=result_price, entry_at=result_at WHERE result='entry_triggered' AND entry_price IS NULL")
c.commit()
print('rows updated:', c.total_changes)
rows = c.execute("SELECT id,stock_symbol,result,entry_price,result_price FROM picks WHERE result IS NOT NULL ORDER BY published_at DESC").fetchall()
for r in rows:
    print(r)
c.close()
