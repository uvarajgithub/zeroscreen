from pathlib import Path

p = Path('src/index.ts')
lines = p.read_text().splitlines()
start = None
for i, line in enumerate(lines):
    if line == '    if (!order || order.status !== "COMPLETE" || order.filled_quantity <= 0) {':
        if i+6 < len(lines) and lines[i+6] == '    actualFillPrice = (order as any).average_price ?? bc.close;':
            start = i
            break
if start is None:
    raise SystemExit('could not locate malformed block')
end = start + 6
# Replace lines start..end inclusive with corrected lines
lines[start:end+1] = [
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
p.write_text('\n'.join(lines) + '\n')
print('patched line block')
