import subprocess
result = subprocess.run(
    ['sqlite3', '/root/zeroscreen/zeroscreen.db',
     "SELECT date, COUNT(*), ROUND(SUM(pnl),2) FROM trades WHERE date LIKE '2026-05%' GROUP BY date ORDER BY date LIMIT 5;"],
    capture_output=True, text=True
)
print(result.stdout)
print(result.stderr)

# Also check columns
result2 = subprocess.run(
    ['sqlite3', '/root/zeroscreen/zeroscreen.db', "PRAGMA table_info(trades);"],
    capture_output=True, text=True
)
print("COLUMNS:", result2.stdout)
