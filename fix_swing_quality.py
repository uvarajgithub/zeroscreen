import sys

content = open('/root/zeroscreen/src/scheduler.ts', 'r', encoding='utf-8').read()
changes = 0

# 1. Tighten 52W range position: 0.90 -> 0.78 (more room to grow)
old1 = '        w52p >= 0.35 && w52p <= 0.90 &&              // in uptrend, not overextended'
new1 = '        w52p >= 0.35 && w52p <= 0.78 &&              // in uptrend, significant room to 52W high'
if old1 in content:
    content = content.replace(old1, new1)
    changes += 1
    print('Fix 1: w52p cap 0.90 -> 0.78 OK')
else:
    print('Fix 1 NOT FOUND')

# 2. Add confidence >= 70 filter after sector bullish filter
old2 = '        (s.volume ?? 0) > 200_000                    // minimum liquidity\n      );\n    })\n    .map(s => {'
new2 = '        (s.volume ?? 0) > 200_000                    // minimum liquidity\n      );\n    })\n    .filter(s => {\n      // Pre-score confidence filter: require strong technical setup\n      const cp2  = closePosition(s);\n      const w52p2 = week52Pos(s);\n      const secB2 = sectorBullishPct(s);\n      const signals2 = [\n        cp2 >= 0.75, w52p2 >= 0.50 && w52p2 <= 0.78, secB2 > 0.65,\n        (s.all_profitable === 1), (s.profit_uptrend === 1),\n        (s.roce ?? 0) > 18, (s.promoter_pct ?? 0) > 50, (s.volume ?? 0) > 500_000,\n      ];\n      const preConf = Math.round(50 + (signals2.filter(Boolean).length / signals2.length) * 35);\n      return preConf >= 70; // only high-conviction picks\n    })\n    .map(s => {'
if old2 in content:
    content = content.replace(old2, new2)
    changes += 1
    print('Fix 2: confidence >= 70 pre-filter OK')
else:
    print('Fix 2 NOT FOUND')

# 3. Reduce max swing picks from 5 to 4
old3 = '  for (const s of selectBest(swingPool, 5, 2, usedSymbols)) {'
new3 = '  for (const s of selectBest(swingPool, 4, 2, usedSymbols)) {'
if old3 in content:
    content = content.replace(old3, new3)
    changes += 1
    print('Fix 3: max swing picks 5 -> 4 OK')
else:
    print('Fix 3 NOT FOUND')

# 4. Add minimum 5% target check in the swing for loop
old4 = '    const naturalTarget = w52hi > price ? Math.min(w52hi, price * 1.12) : price * 1.08;\n    const target = parseFloat(naturalTarget.toFixed(2));'
new4 = '    const naturalTarget = w52hi > price ? Math.min(w52hi, price * 1.15) : price * 1.10;\n    const target = parseFloat(naturalTarget.toFixed(2));\n    // Skip if target is less than 5% above entry — not worth the risk\n    if (target < price * 1.05) continue;'
if old4 in content:
    content = content.replace(old4, new4)
    changes += 1
    print('Fix 4: min 5% target + raise cap to 15% OK')
else:
    print('Fix 4 NOT FOUND')

if changes == 4:
    open('/root/zeroscreen/src/scheduler.ts', 'w', encoding='utf-8').write(content)
    print(f'\nAll {changes} fixes applied and saved.')
else:
    print(f'\nOnly {changes}/4 fixes applied — NOT saved to avoid partial patch.')
    sys.exit(1)
