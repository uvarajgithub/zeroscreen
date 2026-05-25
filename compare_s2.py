import subprocess

# Current file
with open('/root/zeroscreen/src/server.ts','rb') as f:
    cur = f.read()

# Git original
r = subprocess.run(['git', 'show', 'HEAD:src/server.ts'], capture_output=True, cwd='/root/zeroscreen')
orig = r.stdout

print("=== CURRENT: area after sig3-bot-status ===")
idx_cur = cur.find(b'</div>\n\n    <!-- Strategy Tab Switcher -->')
if idx_cur == -1:
    idx_cur = cur.find(b'sig3-bot-status')
    # find closing div
    print("Looking for sig3-bot-status close...")
    print(cur[idx_cur+2000:idx_cur+3000].decode('utf-8','replace'))
else:
    print(cur[idx_cur-50:idx_cur+500].decode('utf-8','replace'))

print("\n\n=== ORIGINAL GIT: same area ===")
idx_orig = orig.find(b'</div>\n\n    <!-- Strategy Tab Switcher -->')
if idx_orig == -1:
    idx_orig = orig.find(b'sig3-bot-status')
    print(orig[idx_orig+2000:idx_orig+3000].decode('utf-8','replace'))
else:
    print(orig[idx_orig-50:idx_orig+500].decode('utf-8','replace'))
