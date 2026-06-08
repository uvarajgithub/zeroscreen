import subprocess

def q(sql):
    r = subprocess.run(['sqlite3', '/root/zeroscreen/zeroscreen.db', sql],
                       capture_output=True, text=True)
    return r.stdout.strip()

# Try trade_date for May
print("May 2026 by trade_date:", q("SELECT trade_date, COUNT(*), ROUND(SUM(pnl),2) FROM bot_trades WHERE trade_date LIKE '2026-05%' GROUP BY trade_date ORDER BY trade_date;"))

# What dates exist at all?
print("\nAll distinct months:", q("SELECT SUBSTR(trade_date,1,7), COUNT(*) FROM bot_trades GROUP BY 1 ORDER BY 1;"))
