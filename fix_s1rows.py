with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Find current end of db-sub row 1 (already has BHAV V3)
old_end = b' &middot; Max 5 trades/day</div>\n      </div>'
new_end = (b' &middot; Max 5 trades/day</div>\n'
    b'        <div class="db-sub" style="margin-top:3px">'
    b'PDH: <span id="db-pdh" style="color:#10b981;font-weight:600">${hb2?.bhavPrevDayHigh ?? "&mdash;"}</span>'
    b' &middot; PDL: <span id="db-pdl" style="color:#ef4444;font-weight:600">${hb2?.bhavPrevDayLow ?? "&mdash;"}</span>'
    b' &middot; Candles today: <span id="db-cndl">${hb2?.bhavCandles ?? "&mdash;"}</span>'
    b' &middot; &#8377; P&amp;L: idx pts &times; 15</div>\n'
    b'        <div class="db-sub" style="margin-top:3px">'
    b'5yr Backtest (Jan&rsquo;21&ndash;May&rsquo;26): <strong style="color:#10b981">&#8377;31.07L</strong>'
    b' &middot; 74.6% WR &middot; &#8377;2,583 avg/trade &middot; MaxDD &#8377;11,027</div>\n'
    b'      </div>')

if old_end in c:
    c = c.replace(old_end, new_end, 1)
    print("S1 rows 2+3: OK")
else:
    print("NOT FOUND")
    idx = c.find(b'Max 5 trades/day')
    print(repr(c[idx:idx+80]))

with open('/root/zeroscreen/dist/server.js', 'wb') as f:
    f.write(c)
print(f"Size: {len(c)}")
