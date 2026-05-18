import subprocess

def q(sql):
    r = subprocess.run(['sqlite3', '/root/zeroscreen/zeroscreen.db', sql], capture_output=True, text=True)
    return r.stdout.strip()

q('DELETE FROM paper_trades;')
q('DELETE FROM paper_positions;')
q('DELETE FROM paper_portfolio;')
q('DELETE FROM paper_reports;')

print('paper_trades:', q('SELECT COUNT(*) FROM paper_trades;'))
print('paper_positions:', q('SELECT COUNT(*) FROM paper_positions;'))
print('paper_portfolio:', q('SELECT COUNT(*) FROM paper_portfolio;'))
print('paper_reports:', q('SELECT COUNT(*) FROM paper_reports;'))
print('All cleared.')
