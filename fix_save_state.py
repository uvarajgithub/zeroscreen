content = open('/home/ubuntu/trading-bot/dist/src/index.js').read()

# Fix: add saveTradeState() after TRAIL shadow exit block
old1 = (
    "                `Day P&L (TRAIL): ${_shDaySign}${shadowPnL.toFixed(0)} pts | ${shadowWins}W ${shadowLosses}L | T:${shadowTrades}/5`).catch(() => { });\n"
    "        }\n"
    "    }\n"
    "    shadowPrevCandle = currentCandle;"
)
new1 = (
    "                `Day P&L (TRAIL): ${_shDaySign}${shadowPnL.toFixed(0)} pts | ${shadowWins}W ${shadowLosses}L | T:${shadowTrades}/5`).catch(() => { });\n"
    "            saveTradeState();\n"
    "        }\n"
    "    }\n"
    "    shadowPrevCandle = currentCandle;"
)

# Fix: add saveTradeState() after LOCK50 Old shadow exit block
old2 = (
    "                _l50L.reason = _l50Reason;\n"
    "                _l50L.exitMs = Date.now();\n"
    "            }\n"
    "        }\n"
    "    }\n"
    "    lock50ShadowPrev = currentCandle;"
)
new2 = (
    "                _l50L.reason = _l50Reason;\n"
    "                _l50L.exitMs = Date.now();\n"
    "            }\n"
    "            saveTradeState();\n"
    "        }\n"
    "    }\n"
    "    lock50ShadowPrev = currentCandle;"
)

changed = 0
if old1 in content:
    content = content.replace(old1, new1, 1)
    print('Fix 1 applied: saveTradeState after TRAIL exit')
    changed += 1
else:
    print('Fix 1 NOT FOUND')
    idx = content.find('Day P&L (TRAIL)')
    print(repr(content[idx:idx+200]))

if old2 in content:
    content = content.replace(old2, new2, 1)
    print('Fix 2 applied: saveTradeState after LOCK50 Old exit')
    changed += 1
else:
    print('Fix 2 NOT FOUND')
    idx = content.find('_l50L.exitMs = Date.now()')
    print(repr(content[idx:idx+150]))

if changed > 0:
    open('/home/ubuntu/trading-bot/dist/src/index.js', 'w').write(content)
    print(f'Done. {changed} fixes applied.')
