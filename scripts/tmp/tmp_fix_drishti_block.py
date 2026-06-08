from pathlib import Path

p = Path('src/index.ts')
text = p.read_text()
old = '''    if (!order || order.status !== "COMPLETE" || order.filled_quantity <= 0) {
      stopDrishtiLTPMonitor();  // trade failed Γö stop LTP monitor
      log("ORDER_NOT_FILLED", { order });
      mainEntryDone = false; activeTrade = false; tradeDirection = null;
      tradeSymbol = ""; entryPrice = 0; entryTime = 0;
      DrishtiState.inTrade = false;
      return;
    actualFillPrice = (order as any).average_price ?? bc.close;
    entryPrice = actualFillPrice;
    DrishtiState.entry = actualFillPrice;
    log( ENTRY_PRICE_UPDATE, { indexCandle: bc.close.toFixed(1), futuresFill: actualFillPrice.toFixed(1), diff: (actualFillPrice - bc.close).toFixed(1) });
    }'''
new = '''    if (!order || order.status !== "COMPLETE" || order.filled_quantity <= 0) {
      stopDrishtiLTPMonitor();  // trade failed Γö stop LTP monitor
      log("ORDER_NOT_FILLED", { order });
      mainEntryDone = false; activeTrade = false; tradeDirection = null;
      tradeSymbol = ""; entryPrice = 0; entryTime = 0;
      DrishtiState.inTrade = false;
      return;
    }
    actualFillPrice = (order as any).average_price ?? bc.close;
    entryPrice = actualFillPrice;
    DrishtiState.entry = actualFillPrice;
    log("ENTRY_PRICE_UPDATE", { indexCandle: bc.close.toFixed(1), futuresFill: actualFillPrice.toFixed(1), diff: (actualFillPrice - bc.close).toFixed(1) });'''
if old not in text:
    raise SystemExit('text block not found')
text = text.replace(old, new, 1)
p.write_text(text)
print('block patched')
