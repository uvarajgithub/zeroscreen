import sqlite3
c = sqlite3.connect('/root/zeroscreen/zeroscreen.db')
cols = [r[1] for r in c.execute('PRAGMA table_info(picks)')]
print('Columns:', cols)
# Show sample row
row = c.execute('SELECT * FROM picks LIMIT 1').fetchone()
print('Sample:', row)
c.close()
