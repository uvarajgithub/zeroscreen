import os

base = '/home/ubuntu/trading-bot'

# These files declare 'const p = ...' but got patched to 'pts:pnl' incorrectly
p_var_files = ['backtest_5yr_correct.js', 'backtest_2024_2026.js', 'market_type_analysis.js', 'trail_optimizer.js']

for fname in p_var_files:
    path = os.path.join(base, fname)
    if not os.path.exists(path): continue
    with open(path, 'r') as f: txt = f.read()
    # Check which variable is actually declared before the EXIT_EARLY line
    import re
    # Find the block: look for 'const p ' or 'const pnl ' near the exit
    if "const p = state.dir" in txt and "return { action:'EXIT_EARLY', pts:pnl" in txt:
        txt = txt.replace("return { action:'EXIT_EARLY', pts:pnl }", "return { action:'EXIT_EARLY', pts:p }")
        with open(path, 'w') as f: f.write(txt)
        print(f'Fixed p: {fname}')
    else:
        print(f'OK or skip: {fname}')
