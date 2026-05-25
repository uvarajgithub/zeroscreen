import sys

content = open('/root/zeroscreen/src/scheduler.ts', 'r', encoding='utf-8').read()

old = (
    '      const CAPITAL_PER_PICK = 25000;\n'
    '      const qty   = Math.max(1, Math.floor(CAPITAL_PER_PICK / (livePrice > 0 ? livePrice : pick.entry_high)));\n'
    '      const priceRow = await dbAll<{ price: number }>(\n'
    '        "SELECT price FROM prices WHERE symbol = ?", [pick.stock_symbol]\n'
    '      );\n'
    '      const livePrice = priceRow[0]?.price ?? 0;'
)

new = (
    '      const priceRow = await dbAll<{ price: number }>(\n'
    '        "SELECT price FROM prices WHERE symbol = ?", [pick.stock_symbol]\n'
    '      );\n'
    '      const livePrice = priceRow[0]?.price ?? 0;\n'
    '      const CAPITAL_PER_PICK = 25000;\n'
    '      const qty = Math.max(1, Math.floor(CAPITAL_PER_PICK / (livePrice > 0 ? livePrice : pick.entry_high)));'
)

if old in content:
    content = content.replace(old, new)
    open('/root/zeroscreen/src/scheduler.ts', 'w', encoding='utf-8').write(content)
    print('OK - fixed')
else:
    print('NOT FOUND - no change')
    sys.exit(1)
