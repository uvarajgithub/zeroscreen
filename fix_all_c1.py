import os, re

base = '/home/ubuntu/trading-bot'

# Files where variable is 'pnl'
pnl_files = [
    'backtest_2024_2026.js',
    'backtest_3strat.js',
    'backtest_5yr_correct.js',
    'backtest_bb.js',
    'backtest_candle_dir.js',
    'backtest_combined.js',
    'backtest_fcb_csc.js',
    'backtest_multitf.js',
    'market_type_analysis.js',
    'trail_optimizer.js',
]

# Files where variable is 'p'
p_files = [
    'backtest_may.js',
    'today_trades.js',
]

fixed = 0
for fname in pnl_files:
    path = os.path.join(base, fname)
    if not os.path.exists(path): continue
    with open(path, 'r') as f: txt = f.read()
    old = 'return {action:\'EXIT_EARLY\', pts:-3}'
    new = 'return {action:\'EXIT_EARLY\', pts:pnl}'
    if old in txt:
        txt = txt.replace(old, new)
        with open(path, 'w') as f: f.write(txt)
        print(f'Fixed (pnl): {fname}')
        fixed += 1
    else:
        # try space variant
        old2 = "return { action:'EXIT_EARLY', pts:-3 }"
        new2 = "return { action:'EXIT_EARLY', pts:pnl }"
        if old2 in txt:
            txt = txt.replace(old2, new2)
            with open(path, 'w') as f: f.write(txt)
            print(f'Fixed (pnl spaced): {fname}')
            fixed += 1
        else:
            print(f'SKIP (not found): {fname}')

for fname in p_files:
    path = os.path.join(base, fname)
    if not os.path.exists(path): continue
    with open(path, 'r') as f: txt = f.read()
    old = "return { action:'EXIT_EARLY', pts:-3 }"
    new = "return { action:'EXIT_EARLY', pts:p }"
    if old in txt:
        txt = txt.replace(old, new)
        with open(path, 'w') as f: f.write(txt)
        print(f'Fixed (p): {fname}')
        fixed += 1
    else:
        print(f'SKIP (not found): {fname}')

print(f'\nTotal fixed: {fixed}')
