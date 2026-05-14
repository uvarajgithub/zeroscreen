import subprocess
raw = subprocess.run('iconv -f UTF-16 -t UTF-8 /home/ubuntu/trading-bot/src/index.ts', shell=True, capture_output=True)
c = raw.stdout
old = b'Day P&L:  pts | Trades: /5'
new = b'Day P&L:  pts | Trades: /5'
if old in c:
    c = c.replace(old, new, 1)
    proc = subprocess.run('iconv -f UTF-8 -t UTF-16 > /home/ubuntu/trading-bot/src/index.ts', shell=True, input=c, capture_output=True)
    print('Patched' if proc.returncode==0 else 'Write error: '+proc.stderr.decode())
else:
    print('NOT FOUND — exact bytes differ')
