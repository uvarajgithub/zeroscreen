#!/usr/bin/env python3
"""Pump up row colors — more saturated, less washed out."""

with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# 1. CE row — blue: 8% → 18% bg, .2 → .4 border
old = '.watch-ce-row{background:rgba(37,99,235,.08);border:1px solid rgba(59,130,246,.2)}'
new = '.watch-ce-row{background:rgba(59,130,246,.18);border:1px solid rgba(96,165,250,.4)}'
assert old in content, "ce-row not found"
content = content.replace(old, new)
print("  [1] .watch-ce-row darkened")

# 2. PE row — red: 8% → 16% bg, .2 → .4 border
old = '.watch-pe-row{background:rgba(185,28,28,.08);border:1px solid rgba(239,68,68,.2)}'
new = '.watch-pe-row{background:rgba(239,68,68,.16);border:1px solid rgba(248,113,113,.4)}'
assert old in content, "pe-row not found"
content = content.replace(old, new)
print("  [2] .watch-pe-row darkened")

# 3. Candle row — amber: 6% → 18% bg, .18 → .4 border
old = '.watch-cnd-row{background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.18)}'
new = '.watch-cnd-row{background:rgba(217,119,6,.18);border:1px solid rgba(251,191,36,.4)}'
assert old in content, "cnd-row not found"
content = content.replace(old, new)
print("  [3] .watch-cnd-row darkened")

# 4. PDH label in BHAV V3 watch card — pastel pink → vivid red
old = 'style="color:#fca5a5">PDH &#9660;'
new = 'style="color:#f87171">PDH &#9660;'
if old in content:
    content = content.replace(old, new)
    print("  [4] PDH label color vivid")
else:
    print("  [4] PDH label not found (skipped)")

# 5. _pdhNote "above" color — pastel pink → vivid red
old = "'color:'+(_pdhAbove?'#fca5a5':'#94a3b8')+\"'>\""
new = "'color:'+(_pdhAbove?'#f87171':'#64748b')+\"'>\""
if old in content:
    content = content.replace(old, new)
    print("  [5] pdhNote above color vivid")
else:
    # try without escaped quotes
    old2 = "'color:'+(_pdhAbove?'#fca5a5':'#94a3b8')+'\">'+('"
    new2 = "'color:'+(_pdhAbove?'#f87171':'#64748b')+'\">'+('"
    if old2 in content:
        content = content.replace(old2, new2)
        print("  [5] pdhNote above color vivid (alt)")
    else:
        print("  [5] pdhNote color not found (skipped)")

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8', errors='replace') as f:
    f.write(content)

print("\nDone!")
