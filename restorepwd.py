import sqlite3
conn = sqlite3.connect('/root/zeroscreen/zeroscreen.db')
orig = '$2b$12$tpuafMUkVMCOSHQvrHjLSePfxX0jYEsapsF0qwrcToPx1BG/rSCJG'
conn.execute("UPDATE users SET password=? WHERE id=1", (orig,))
conn.commit()
print("Restored original password hash for id=1")
conn.close()
