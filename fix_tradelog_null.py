"""
Fix 3: lock50TradeLog display - add null check to prevent "+null pts"
Applied directly to dist/src/index.js on VPS
"""
import re

path = '/home/ubuntu/trading-bot/dist/src/index.js'
with open(path, 'r') as f:
    s = f.read()

old = ('const _l50rows = lock50TradeLog.slice(-9).map((t, i) => {\n'
       '                    const _sign = t.pts >= 0 ? "+" : "";\n'
       '                    return `T${i + 1}: ${t.dir} \u2192 ${_sign}${t.pts} pts`;\n'
       '                });')

new = ('const _l50rows = lock50TradeLog.slice(-9).map((t, i) => {\n'
       '                    if (t.pts !== null && t.pts !== undefined) { const _sign = t.pts >= 0 ? "+" : ""; return `T${i + 1}: ${t.dir} \u2192 ${_sign}${t.pts} pts`; }\n'
       '                    else { return `T${i + 1}: ${t.dir} \u2192 (open)`; }\n'
       '                });')

if old in s:
    s = s.replace(old, new)
    with open(path, 'w') as f:
        f.write(s)
    print('Fix 3 applied OK')
else:
    # show nearby context
    idx = s.find('lock50TradeLog.slice(-9).map')
    print('Pattern not found. Context:')
    print(repr(s[idx:idx+300]) if idx >= 0 else 'Not found at all')
