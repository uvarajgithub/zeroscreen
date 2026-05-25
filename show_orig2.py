import subprocess

r = subprocess.run(['git', 'show', 'HEAD:src/server.ts'], capture_output=True, cwd='/root/zeroscreen')
d = r.stdout

idx = d.find(b'sig3-bot-status')
# show 200 before to 3000 after
print(d[max(0,idx-200):idx+3000].decode('utf-8','replace'))
