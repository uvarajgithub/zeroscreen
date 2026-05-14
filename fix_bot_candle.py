#!/usr/bin/env python3
"""
Patch trading bot to preserve lastCandle + candleHistory in all heartbeat writes.
1. Add module-level variables after line 237
2. Set them in the candle completion block
3. Add to all 3 heartbeat writes
"""
FILE = '/home/ubuntu/trading-bot/dist/src/index.js'
with open(FILE, 'r', encoding='utf-8') as f:
    src = f.read()

fixes = 0

# ── 1. Add module-level variables after lastCandleKey declaration ─────────
OLD_DECL = 'let lastCandleKey = ""; // key of the last candle we already notified on'
NEW_DECL = ('let lastCandleKey = ""; // key of the last candle we already notified on\n'
            'let _lastCandleForHB = null; // persisted across heartbeat writes\n'
            'let _candleHistoryForHB = []; // up to 30 candles for dashboard timeline')
if OLD_DECL in src:
    src = src.replace(OLD_DECL, NEW_DECL, 1)
    fixes += 1; print("OK: module-level candle vars added")
else:
    print("WARN: lastCandleKey declaration not found")

# ── 2. Set the vars when candle completes (after existing lastCandle write) ─
# The candle completion writes: _hb.lastCandle = {...}; writeFileSync(...)
OLD_CANDLE = ('                _hb.lastCandle = { time: ist, open: finalPrev.open, high: finalPrev.high, low: finalPrev.low, close: finalPrev.close, '
              'colour: colour.includes("Bullish") ? "bull" : "bear", status };\n'
              '                fs_1.default.writeFileSync("bot-heartbeat.json", JSON.stringify(_hb));')
NEW_CANDLE = ('                _hb.lastCandle = { time: ist, open: finalPrev.open, high: finalPrev.high, low: finalPrev.low, close: finalPrev.close, '
              'colour: colour.includes("Bullish") ? "bull" : "bear", status };\n'
              '                fs_1.default.writeFileSync("bot-heartbeat.json", JSON.stringify(_hb));\n'
              '                // Persist for main heartbeat writes\n'
              '                _lastCandleForHB = { t: new Date().toISOString(), open: finalPrev.open, high: finalPrev.high, low: finalPrev.low, close: finalPrev.close, colour: colour.includes("Bullish") ? "bull" : "bear" };\n'
              '                _candleHistoryForHB = [..._candleHistoryForHB.slice(-29), _lastCandleForHB];')
if OLD_CANDLE in src:
    src = src.replace(OLD_CANDLE, NEW_CANDLE, 1)
    fixes += 1; print("OK: candle history tracking added")
else:
    print("WARN: candle write block not found")

# ── 3. Add to all 3 heartbeat write closings ────────────────────────────────
WRITE1_OLD = ('                sl: _inTrade ? (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100) : null,\n'
              '            }));')
WRITE1_NEW = ('                sl: _inTrade ? (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100) : null,\n'
              '                lastCandle: _lastCandleForHB,\n'
              '                candleHistory: _candleHistoryForHB,\n'
              '            }));')
if WRITE1_OLD in src:
    src = src.replace(WRITE1_OLD, WRITE1_NEW, 1)
    fixes += 1; print("OK: heartbeat write #1 patched")
else:
    print("WARN: write #1 not found")

WRITE2_OLD = ('                    sl: _inTrade ? (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100) : null,\n'
              '                }));')
WRITE2_NEW = ('                    sl: _inTrade ? (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100) : null,\n'
              '                    lastCandle: _lastCandleForHB,\n'
              '                    candleHistory: _candleHistoryForHB,\n'
              '                }));')
if WRITE2_OLD in src:
    src = src.replace(WRITE2_OLD, WRITE2_NEW, 1)
    fixes += 1; print("OK: heartbeat write #2 patched")
else:
    print("WARN: write #2 not found")

WRITE3_OLD = ('                        sl: _inTrade2 ? (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100) : null,\n'
              '                    }));')
WRITE3_NEW = ('                        sl: _inTrade2 ? (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100) : null,\n'
              '                        lastCandle: _lastCandleForHB,\n'
              '                        candleHistory: _candleHistoryForHB,\n'
              '                    }));')
if WRITE3_OLD in src:
    src = src.replace(WRITE3_OLD, WRITE3_NEW, 1)
    fixes += 1; print("OK: heartbeat write #3 patched")
else:
    print("WARN: write #3 not found")

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"\nDONE — {fixes} fixes applied")
