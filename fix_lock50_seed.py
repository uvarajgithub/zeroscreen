#!/usr/bin/env python3
"""
Fix: seed lock50ShadowPrev alongside hybridPrevCandle and shadowPrevCandle
so LOCK50 Old processes candles from the same starting point as TRAIL.
"""

with open('/home/ubuntu/trading-bot/dist/src/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: initial seed block (hybridLastCandleKey === "")
OLD1 = (
    '        hybridPrevCandle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };\n'
    '        shadowPrevCandle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };\n'
    '        hybridLastCandleKey = candleKey;\n'
    '        log("HYBRID_SEEDED", { candle: hybridPrevCandle });\n'
    '        return;\n'
    '    }\n'
    '    if (candleKey === hybridLastCandleKey)\n'
    '        return; // same candle, no new close\n'
    '    hybridLastCandleKey = candleKey;\n'
    '    if (!hybridPrevCandle) {\n'
    '        hybridPrevCandle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };\n'
    '        shadowPrevCandle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };\n'
    '        return;\n'
    '    }'
)

NEW1 = (
    '        hybridPrevCandle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };\n'
    '        shadowPrevCandle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };\n'
    '        lock50ShadowPrev = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };\n'
    '        hybridLastCandleKey = candleKey;\n'
    '        log("HYBRID_SEEDED", { candle: hybridPrevCandle });\n'
    '        return;\n'
    '    }\n'
    '    if (candleKey === hybridLastCandleKey)\n'
    '        return; // same candle, no new close\n'
    '    hybridLastCandleKey = candleKey;\n'
    '    if (!hybridPrevCandle) {\n'
    '        hybridPrevCandle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };\n'
    '        shadowPrevCandle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };\n'
    '        lock50ShadowPrev = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };\n'
    '        return;\n'
    '    }'
)

count = content.count(OLD1)
print(f"Fix 1 occurrences found: {count}")
if count == 1:
    content = content.replace(OLD1, NEW1)
    print("Fix 1 applied.")
else:
    print("ERROR: Fix 1 not applied - text not found or found multiple times!")
    import sys; sys.exit(1)

with open('/home/ubuntu/trading-bot/dist/src/index.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done.")
