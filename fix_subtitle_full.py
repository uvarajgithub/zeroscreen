path = '/root/zeroscreen/src/server.ts'
with open(path, encoding='utf-8') as f:
    c = f.read()

# --- Patch 1: expand sig3-sub into two rows ---
old_sub = (
    '<div class="sig3-sub">BANKNIFTY &middot; BHAV V3 &middot; '
    '<strong>${mode2.toUpperCase()}</strong> &middot; 30 qty &middot; '
    '&#8377; P&amp;L = index pts &times; 30 qty &times; 0.5&#948; = pts &times; 15</div>'
)
new_sub = (
    '<div class="sig3-sub">BANKNIFTY &middot; BHAV V3 &middot; '
    '<strong>${mode2.toUpperCase()}</strong> &middot; 30 qty '
    '&middot; SL: <strong>${_slPts2ssr} pts</strong> '
    '&middot; Entry: PDH/PDL Break &middot; Candle-close SL &middot; Max 5 trades/day</div>\n'
    '        <div class="sig3-sub" style="margin-top:3px">'
    'PDH: <span id="sig3-pdh" style="color:#10b981;font-weight:600">'
    '${hb2?.bhavPrevDayHigh ?? "&mdash;"}</span> &middot; '
    'PDL: <span id="sig3-pdl" style="color:#ef4444;font-weight:600">'
    '${hb2?.bhavPrevDayLow ?? "&mdash;"}</span> &middot; '
    'Candles today: <span id="sig3-cndl">${hb2?.bhavCandles ?? "&mdash;"}</span> '
    '&middot; &#8377; P&amp;L = pts &times; 15</div>'
)

if old_sub in c:
    c = c.replace(old_sub, new_sub, 1)
    print('Patch 1 OK')
else:
    print('Patch 1 NOT FOUND')

# --- Patch 2: add live PDH/PDL/candles update in _sig3Refresh ---
old_js = 'const shPnl=parseFloat((d.heartbeat?.shadowPnL??0).toFixed(0));'
new_js = (
    'if(_ge("sig3-pdh")&&d.heartbeat?.bhavPrevDayHigh!=null)'
    '_ge("sig3-pdh").textContent=d.heartbeat.bhavPrevDayHigh;\n'
    '      if(_ge("sig3-pdl")&&d.heartbeat?.bhavPrevDayLow!=null)'
    '_ge("sig3-pdl").textContent=d.heartbeat.bhavPrevDayLow;\n'
    '      if(_ge("sig3-cndl")&&d.heartbeat?.bhavCandles!=null)'
    '_ge("sig3-cndl").textContent=d.heartbeat.bhavCandles+" candles";\n'
    '      const shPnl=parseFloat((d.heartbeat?.shadowPnL??0).toFixed(0));'
)

if old_js in c:
    c = c.replace(old_js, new_js, 1)
    print('Patch 2 OK')
else:
    print('Patch 2 NOT FOUND')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('DONE')
