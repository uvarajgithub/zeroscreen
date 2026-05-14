import sqlite3
db = sqlite3.connect('/root/zeroscreen/zeroscreen.db')
rows = db.execute("SELECT key, value FROM app_settings WHERE key LIKE 'kite%'").fetchall()
for k, v in rows:
    print(k, ':', v)
