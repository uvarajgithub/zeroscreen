#!/usr/bin/env python3
"""Fix watch card row colors to work on both light and dark themes."""

with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# 1. Row backgrounds — more opaque so they're visible on white too
content = content.replace(
    '.watch-ce-row{background:rgba(59,130,246,.18);border:1px solid rgba(96,165,250,.4)}',
    '.watch-ce-row{background:rgba(59,130,246,.12);border:1.5px solid rgba(37,99,235,.45)}'
)
content = content.replace(
    '.watch-pe-row{background:rgba(239,68,68,.16);border:1.5px solid rgba(248,113,113,.4)}',
    '.watch-pe-row{background:rgba(239,68,68,.12);border:1.5px solid rgba(220,38,38,.45)}'
)
content = content.replace(
    '.watch-cnd-row{background:rgba(217,119,6,.18);border:1px solid rgba(251,191,36,.4)}',
    '.watch-cnd-row{background:rgba(217,119,6,.12);border:1.5px solid rgba(180,83,9,.45)}'
)
print("  [1-3] Row backgrounds updated")

# 2. PDH label: pastel #f87171 → deep red #dc2626 (readable on both themes)
content = content.replace(
    'style="color:#f87171">PDH &#9660;',
    'style="color:#dc2626">PDH &#9660;'
)
print("  [4] PDH label color: deep red")

# 3. _pdhNote "above → PE fade" color: #fca5a5 (pastel, invisible on light) → #dc2626
content = content.replace(
    "const _pdhCol=_pdhAbove?'#fca5a5':'#94a3b8';",
    "const _pdhCol=_pdhAbove?'#dc2626':'#64748b';"
)
print("  [5] pdhNote color: deep red / slate")

# 4. Candle countdown color: #fbbf24 (yellow, invisible on light) → #d97706 (amber, readable both)
content = content.replace(
    "'next close <b style=\"color:#fbbf24\">'+_remStr+'</b>'",
    "'next close <b style=\"color:#d97706\">'+_remStr+'</b>'"
)
print("  [6] Countdown color: amber")

# 5. Spot value: #e2e8f0 (near-white, invisible on light) → var(--text-main)
content = content.replace(
    "' &middot; spot <b style=\"color:#e2e8f0\">'+lp.toFixed(0)+'</b>'",
    "' &middot; spot <b style=\"color:var(--text-main)\">'+lp.toFixed(0)+'</b>'"
)
print("  [7] Spot value: var(--text-main)")

# 6. Candle label color: #fbbf24 → #d97706 for the hourglass icon too
content = content.replace(
    'style="color:#fbbf24;min-width:28px">&#8987;',
    'style="color:#d97706;min-width:28px">&#8987;'
)
print("  [8] Candle icon color: amber")

# 7. Watch title: var(--muted) text is fine, but also fix .watch-title to use a slightly more visible color
# Already using var(--muted) which adapts

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8', errors='replace') as f:
    f.write(content)

print("\nDone!")
