#!/usr/bin/env python3
"""Fix LOCK50 Old shadow to server-render the in-trade card using actual hb2 data."""

path = '/root/zeroscreen/dist/server.js'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find sh-pos-l50o-wrap line
start_i = None
end_i = None
for i, l in enumerate(lines):
    if 'sh-pos-l50o-wrap' in l:
        start_i = i
    if start_i is not None and i > start_i and '        </div>' in l and end_i is None:
        # This is the closing of sh-pos-l50o-wrap (4-space indent closing)
        end_i = i
        break

if start_i is None or end_i is None:
    print(f"ERROR: start={start_i} end={end_i}")
    exit(1)

print(f"Block: lines {start_i+1} to {end_i+1}")
print("Current last lines:")
for j in range(end_i-3, end_i+2):
    print(f"  {j+1}: {repr(lines[j])}")

# Build replacement block
new_block = [
    '        <div id="sh-pos-l50o-wrap">\n',
    '          ${hb2.scalp1InTrade && (hb2.scalp1Entry||0) > 0 ? `\n',
    '          <!-- In-trade card (server-rendered) -->\n',
    '          <div class="pos-card pos-${(hb2.scalp1Dir||\'ce\').toLowerCase()}" id="sh-pos-l50o-card">\n',
    '            <div class="pos-hdr">\n',
    '              <span class="pos-live-dot"></span>\n',
    '              <span class="pos-badge pos-b-${(hb2.scalp1Dir||\'ce\').toLowerCase()}" id="sh-l50o-card-badge">${(hb2.scalp1Dir||\'CE\').toUpperCase()} OPTION</span>\n',
    '              <span class="pos-sym">BANKNIFTY</span>\n',
    '              <span class="pos-mode">PAPER</span>\n',
    '            </div>\n',
    '            <div class="pos-pnl-rs g" id="sh-l50o-card-rs">\u2014</div>\n',
    '            <div class="pos-pnl-pts g" id="sh-l50o-card-pts">\u2014 unrealised</div>\n',
    '            <div class="pos-grid">\n',
    '              <div><div class="pos-lbl">Entry Index</div><div class="pos-val mono" id="sh-l50o-card-ep">${(hb2.scalp1Entry||0).toFixed(1)}</div></div>\n',
    '              <div><div class="pos-lbl">Live Index</div><div class="pos-val g mono" id="sh-l50o-card-lp">${live2>0?live2.toFixed(1):\'—\'}</div></div>\n',
    '              <div><div class="pos-lbl">Stop Loss</div><div class="pos-val r mono" id="sh-l50o-card-sl">${(hb2.scalp1SL||0)>0?(hb2.scalp1SL).toFixed(1):\'—\'}</div></div>\n',
    '              <div><div class="pos-lbl">SL Risk \u20b9</div><div class="pos-val r" id="sh-l50o-card-slrs">\u2014</div></div>\n',
    '            </div>\n',
    '          </div>\n',
    '          <div class="sh-pos sh-pos-watch" id="sh-pos-l50o-flat" style="display:none">\n',
    '            <div class="watch-title"><span>\U0001f506</span> LOCK50 Old Shadow \u2014 <span id="sh-l50o-status">In Trade</span></div>\n',
    '            <div id="sh-l50o-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)"></div>\n',
    '            <div id="sh-l50o-watch" style="margin-top:10px"></div>\n',
    '          </div>\n',
    '          ` : `\n',
    '          <!-- Flat / watching card -->\n',
    '          <div class="sh-pos sh-pos-watch" id="sh-pos-l50o-flat">\n',
    '            <div class="watch-title"><span>\U0001f506</span> LOCK50 Old Shadow \u2014 <span id="sh-l50o-status">Watching</span></div>\n',
    '            <div id="sh-l50o-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Watching for next signal\u23f3</div>\n',
    '            <div id="sh-l50o-watch" style="margin-top:10px"></div>\n',
    '          </div>\n',
    '          <div class="pos-card pos-ce" id="sh-pos-l50o-card" style="display:none">\n',
    '            <div class="pos-hdr">\n',
    '              <span class="pos-live-dot"></span>\n',
    '              <span class="pos-badge pos-b-ce" id="sh-l50o-card-badge">CE OPTION</span>\n',
    '              <span class="pos-sym">BANKNIFTY</span>\n',
    '              <span class="pos-mode">PAPER</span>\n',
    '            </div>\n',
    '            <div class="pos-pnl-rs g" id="sh-l50o-card-rs">\u2014</div>\n',
    '            <div class="pos-pnl-pts g" id="sh-l50o-card-pts">\u2014 unrealised</div>\n',
    '            <div class="pos-grid">\n',
    '              <div><div class="pos-lbl">Entry Index</div><div class="pos-val mono" id="sh-l50o-card-ep">\u2014</div></div>\n',
    '              <div><div class="pos-lbl">Live Index</div><div class="pos-val g mono" id="sh-l50o-card-lp">\u2014</div></div>\n',
    '              <div><div class="pos-lbl">Stop Loss</div><div class="pos-val r mono" id="sh-l50o-card-sl">\u2014</div></div>\n',
    '              <div><div class="pos-lbl">SL Risk \u20b9</div><div class="pos-val r" id="sh-l50o-card-slrs">\u2014</div></div>\n',
    '            </div>\n',
    '          </div>\n',
    '          `}\n',
    '        </div>\n',
]

# Replace the lines
lines[start_i:end_i+1] = new_block
print(f"Replacement done: {end_i+1 - start_i} lines -> {len(new_block)} lines")

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Done.")
