import os

base = '/home/ubuntu/trading-bot'
files = ['backtest_5yr_correct.js', 'backtest_2024_2026.js', 'market_type_analysis.js']

for fname in files:
    path = os.path.join(base, fname)
    with open(path, 'r') as f: txt = f.read()

    # Find what variable holds the actual c1 p&l in this file
    # Could be c1pnl, p, pnl computed just before
    import re
    # Pattern: const <var> = dir==='CE' ? curr.close-entry : entry-curr.close; \n if (<var> < -3) { \n ... pnl-=3
    # Replace pnl-=3 with pnl+=<var>
    match = re.search(r'const (\w+) = dir===.CE. \? curr\.close-entry : entry-curr\.close;\s+if \(\1 < -3\) \{[^}]+pnl-=3', txt, re.DOTALL)
    if match:
        varname = match.group(1)
        old = 'inTrade=false; losses++; pnl-=3; trades++;'
        new = f'inTrade=false; losses++; pnl+={varname}; trades++;'
        if old in txt:
            txt = txt.replace(old, new)
            with open(path, 'w') as f: f.write(txt)
            print(f'Fixed ({varname}): {fname}')
        else:
            print(f'Pattern found but replace failed: {fname}')
    else:
        print(f'Pattern not found: {fname}')
