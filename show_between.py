import subprocess

r = subprocess.run(['git', 'show', 'HEAD:src/server.ts'], capture_output=True, cwd='/root/zeroscreen')
d = r.stdout

# Check if hm-grid appears in the bot dashboard area (after sig3-bot-status)
idx_status = d.find(b'sig3-bot-status')
idx_tab = d.find(b'Strategy Tab Switcher', idx_status)
print(f"sig3-bot-status at: {idx_status}")
print(f"Strategy Tab Switcher at: {idx_tab}")
print(f"\nContent BETWEEN status bar and tab switcher in git HEAD:")
print(d[idx_status+2800:idx_tab+50].decode('utf-8','replace'))
