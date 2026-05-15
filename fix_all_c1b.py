import os

base = '/home/ubuntu/trading-bot'
files = ['backtest_bb.js', 'backtest_combined.js', 'backtest_candle_dir.js', 'backtest_multitf.js', 'backtest_fcb_csc.js']

for fname in files:
    path = os.path.join(base, fname)
    if not os.path.exists(path): continue
    with open(path, 'r') as f: txt = f.read()
    old = "return {action:'EXIT_EARLY',pts:-3}"
    new = "return {action:'EXIT_EARLY',pts:pnl}"
    if old in txt:
        txt = txt.replace(old, new)
        with open(path, 'w') as f: f.write(txt)
        print(f'Fixed: {fname}')
    else:
        print(f'Not found: {fname}')
