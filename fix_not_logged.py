content = open('/home/ubuntu/trading-bot/dist/src/index.js').read()

# Fix 1: LOCK50 Old _l50oRows — no null check, prints "null pts"
old1 = (
    '                const _l50oRows = scalp1TradeLog.slice(-6).map((t, i) => {\n'
    '                    const _s = t.pts >= 0 ? "+" : "";\n'
    '                    return `T${i + 1}: ${t.dir} \u2192 ${_s}${t.pts} pts`;\n'
    '                });'
)
new1 = (
    '                const _l50oRows = scalp1TradeLog.slice(-6).map((t, i) => {\n'
    '                    if (t.pts !== null && t.pts !== undefined) {\n'
    '                        const _s = t.pts >= 0 ? "+" : "";\n'
    '                        return `T${i + 1}: ${t.dir} \u2192 ${_s}${t.pts} pts`;\n'
    '                    } else if (t.exit !== null && t.exit !== undefined && t.entry) {\n'
    '                        const _calc = t.dir === "CE" ? t.exit - t.entry : t.entry - t.exit;\n'
    '                        const _s = _calc >= 0 ? "+" : "";\n'
    '                        return `T${i + 1}: ${t.dir} \u2192 ${_s}${_calc.toFixed(0)} pts`;\n'
    '                    } else { return `T${i + 1}: ${t.dir} \u2192 (exit not recorded)`; }\n'
    '                });'
)

# Fix 2: TRAIL "not logged" — change message to be clearer
old2 = '                    } else { return `T${i2+1}: ${t.dir} \u2192 (not logged)`; }'
new2 = '                    } else { return `T${i2+1}: ${t.dir} \u2192 (exit not recorded)`; }'

# Fix 3: LOCK50 Old in-trade "not logged" — same
old3 = '                    } else { return `T${i3+1}: ${t.dir} \u2192 (not logged)`; }'
new3 = '                    } else { return `T${i3+1}: ${t.dir} \u2192 (exit not recorded)`; }'

changed = 0
if old1 in content:
    content = content.replace(old1, new1, 1)
    print('Fix 1 applied: LOCK50 Old null pts guard')
    changed += 1
else:
    print('Fix 1 NOT FOUND - checking actual text...')
    idx = content.find('scalp1TradeLog.slice(-6).map')
    print(repr(content[idx:idx+200]))

if old2 in content:
    content = content.replace(old2, new2, 1)
    print('Fix 2 applied: TRAIL not logged -> exit not recorded')
    changed += 1
else:
    print('Fix 2 NOT FOUND')

if old3 in content:
    content = content.replace(old3, new3, 1)
    print('Fix 3 applied: LOCK50 Old not logged -> exit not recorded')
    changed += 1
else:
    print('Fix 3 NOT FOUND')

if changed > 0:
    open('/home/ubuntu/trading-bot/dist/src/index.js', 'w').write(content)
    print(f'Done. {changed} fixes applied.')
