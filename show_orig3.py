import subprocess

r = subprocess.run(['git', 'show', 'HEAD:src/server.ts'], capture_output=True, cwd='/root/zeroscreen')
d = r.stdout

idx = d.find(b'sig3-bot-status')
# show 3000 to 5000 after bot-status
print(d[idx+2000:idx+4500].decode('utf-8','replace'))
