import sqlite3
conn = sqlite3.connect('/root/zeroscreen/zeroscreen.db')
# Save original hash
orig = conn.execute("SELECT password FROM users WHERE id=1").fetchone()[0]
print("Original hash saved:", orig[:20]+"...")
# Set temp password hash for Test1234
new_hash = '$2b$12$ZhNKya7FyHK78SBYyKJ9V.ZFurugFBMbkLzvXlTCHvsh/yNZsV0R.'
conn.execute("UPDATE users SET password=? WHERE id=1", (new_hash,))
conn.commit()
conn.close()
print("Password updated to Test1234")
