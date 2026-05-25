f = open('/home/ubuntu/trading-bot/src/index.ts').read()
lines = [(i+1, l) for i, l in enumerate(f.split('\n')) if 'pnl' in l or 'signal' in l.lower() and 'EXIT' in l]
for ln, l in lines[:40]:
    print(ln, l)
