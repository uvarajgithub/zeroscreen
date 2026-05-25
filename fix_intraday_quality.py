import sys

content = open('/root/zeroscreen/src/scheduler.ts', 'r', encoding='utf-8').read()
changes = 0

# 1. Raise volume threshold: 750K -> 1M
old1 = '        vol > 750_000 &&                          // institutional volume'
new1 = '        vol > 1_000_000 &&                        // institutional volume (raised from 750K)'
if old1 in content:
    content = content.replace(old1, new1)
    changes += 1
    print('Fix 1: volume 750K -> 1M OK')
else:
    print('Fix 1 NOT FOUND')

# 2. Add confidence >= 70 filter after .filter(s => s.secAlign)
old2 = '    .filter(s => s.secAlign)  // only keep sector-confirmed signals\n    .sort((a, b) => b.score - a.score);'
new2 = '    .filter(s => s.secAlign)         // only keep sector-confirmed signals\n    .filter(s => s.confidence >= 70)   // only high-conviction picks\n    .sort((a, b) => b.score - a.score);'
if old2 in content:
    content = content.replace(old2, new2)
    changes += 1
    print('Fix 2: confidence >= 70 filter OK')
else:
    print('Fix 2 NOT FOUND')

# 3. Reduce max intraday picks: 5 -> 4
old3 = '  for (const s of selectBest(intradayPool, 5, 2, usedSymbols)) {'
new3 = '  for (const s of selectBest(intradayPool, 4, 2, usedSymbols)) {'
if old3 in content:
    content = content.replace(old3, new3)
    changes += 1
    print('Fix 3: max intraday picks 5 -> 4 OK')
else:
    print('Fix 3 NOT FOUND')

if changes == 3:
    open('/root/zeroscreen/src/scheduler.ts', 'w', encoding='utf-8').write(content)
    print(f'\nAll {changes} fixes applied and saved.')
else:
    print(f'\nOnly {changes}/3 fixes applied — NOT saved.')
    sys.exit(1)
