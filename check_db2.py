import subprocess, json

def q(sql):
    r = subprocess.run(['sqlite3', '/root/zeroscreen/zeroscreen.db', sql],
                       capture_output=True, text=True)
    return r.stdout.strip()

# Schema
print("COLUMNS:", q("PRAGMA table_info(bot_trades);"))

# Sample May 2026
print("\nSAMPLE:", q("SELECT * FROM bot_trades WHERE entry_time LIKE '2026-05%' LIMIT 3;"))

# Try date column variations
print("\nCOLUMNS ONLY:", q("SELECT name FROM pragma_table_info('bot_trades');"))
