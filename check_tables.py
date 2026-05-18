import subprocess

def q(sql):
    r = subprocess.run(['sqlite3', '/root/zeroscreen/zeroscreen.db', sql], capture_output=True, text=True)
    return r.stdout.strip()

q("UPDATE app_settings SET value='1000000' WHERE key='paper_start_balance_user'")
print('paper_start_balance_user:', q("SELECT value FROM app_settings WHERE key='paper_start_balance_user'"))
print('paper_start_balance_admin:', q("SELECT value FROM app_settings WHERE key='paper_start_balance_admin'"))
