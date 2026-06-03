from pathlib import Path

p = Path('src/index.ts')
lines = p.read_text().splitlines()
for i, line in enumerate(lines):
    if line == '    if (!order || order.status !== "COMPLETE" || order.filled_quantity <= 0) {':
        # expect the malformed block start here
        start = i
        break
else:
    raise SystemExit('start line not found')
# determine end of malformed block
end = None
for j in range(start + 1, len(lines)):
    if lines[j] == '    }' and j > start:
        end = j
        break
if end is None:
    raise SystemExit('end line not found')
replacement = [
    '    if (!order || order.status !== "COMPLETE" || order.filled_quantity <= 0) {',
    '      stopDrishtiLTPMonitor();  // trade failed Γö stop LTP monitor',
    '      log("ORDER_NOT_FILLED", { order });',
    '      mainEntryDone = false; activeTrade = false; tradeDirection = null;',
    '      tradeSymbol = ""; entryPrice = 0; entryTime = 0;',
    '      DrishtiState.inTrade = false;',
    '      return;',
    '    }',
    '    actualFillPrice = (order as any).average_price ?? bc.close;',
    '    entryPrice = actualFillPrice;',
    '    DrishtiState.entry = actualFillPrice;',
    '    log("ENTRY_PRICE_UPDATE", { indexCandle: bc.close.toFixed(1), futuresFill: actualFillPrice.toFixed(1), diff: (actualFillPrice - bc.close).toFixed(1) });'
]
lines[start:end+1] = replacement
p.write_text('\n'.join(lines) + '\n')
print('done')
