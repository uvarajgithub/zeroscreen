#!/usr/bin/env python3
"""
Fix dashboard _dbRefresh:
1. Split into try/catch sections so shadow section doesn't silently fail
2. Fix candle condition: just check hb.lastCandle (empty array [] is truthy)
3. Add visible error div to show JS errors in UI during debugging
"""
FILE = '/root/zeroscreen/dist/server.js'
with open(FILE, 'r', encoding='utf-8') as f:
    src = f.read()

fixes = 0

# ── Fix: candle condition — also rebuild when candleHistory arrives fresh ──
# Change: if(hb.candleHistory){...} if(hb.lastCandle&&_candleHistory){...}
# To: always update _candleHistory if provided, build timeline if lastCandle present
OLD_CANDLE_COND = ('      if(hb.candleHistory){_candleHistory=hb.candleHistory;}\n'
                   '      if(hb.lastCandle&&_candleHistory){')
NEW_CANDLE_COND = ('      if(hb.candleHistory&&hb.candleHistory.length){_candleHistory=hb.candleHistory;}\n'
                   '      if(hb.lastCandle){')
if OLD_CANDLE_COND in src:
    src = src.replace(OLD_CANDLE_COND, NEW_CANDLE_COND, 1)
    fixes += 1; print("OK: candle condition relaxed")
else:
    print("WARN: candle condition not found")

# ── Fix: wrap shadow section in its own try/catch for visibility ──────────
OLD_SHADOW_START = ('      // ΓöΓö TRAIL shadow')
OLD_SHADOW_AREA = src[src.find('      // ΓöΓö TRAIL shadow'):]
# Find the comment just before TRAIL shadow section
TRAIL_COMMENT = '      // ── TRAIL shadow'
if TRAIL_COMMENT not in src:
    # The actual comment in file (with box-drawing chars) — find via simpler pattern
    idx = src.find('      // ')
    # Find "TRAIL shadow" comment
    idx = src.find('TRAIL shadow')
    if idx > 0:
        line_start = src.rfind('\n', 0, idx) + 1
        print(f"TRAIL shadow line: {repr(src[line_start:line_start+60])}")

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"\nDONE — {fixes} fixes applied to dashboard")
