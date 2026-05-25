with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Update thead - add Buy Prem and Sell Prem columns (9 -> 11 cols)
OLD_HEAD = '<thead><tr><th>Time</th><th>Dir</th><th>Buy Index</th><th>Symbol</th><th>Sell Index</th><th>Index P&amp;L</th><th>&#8377; P&amp;L</th><th>Reason</th><th>Dur</th></tr></thead>'
NEW_HEAD = '<thead><tr><th>Time</th><th>Dir</th><th>Buy Index</th><th>Buy Prem</th><th>Symbol</th><th>Sell Index</th><th>Sell Prem</th><th>Index P&amp;L</th><th>&#8377; P&amp;L</th><th>Reason</th><th>Dur</th></tr></thead>'

if OLD_HEAD in c:
    c = c.replace(OLD_HEAD, NEW_HEAD, 1)
    print('OK: thead updated')
else:
    print('FAIL: thead not found')

# 2. Update colspan 9 -> 11
OLD_EMPTY = '? `<tr><td colspan="9" class="tt-e">No closed trades today</td></tr>`'
NEW_EMPTY = '? `<tr><td colspan="11" class="tt-e">No closed trades today</td></tr>`'
if OLD_EMPTY in c:
    c = c.replace(OLD_EMPTY, NEW_EMPTY, 1)
    print('OK: colspan updated')
else:
    print('FAIL: colspan not found')

# 3. Update row: add Buy Prem / Sell Prem cells + premium-based rs
OLD_ROW = (
    "                  const d3=(t.direction||'').toLowerCase();\n"
    "                  const pts=t.pnl??0; const rs=Math.round(pts*QTY_MULT2);\n"
    "                  const reason=t.reasonExit||'\u2014';\n"
    "                  const rTag=reason.toLowerCase().includes('sl')||reason.toLowerCase().includes('stop')?'rc-sl':reason.toLowerCase().includes('trail')||reason.toLowerCase().includes('early')?'rc-trail':'rc-eod';\n"
    "                  const dur=t.duration?(t.duration<60?t.duration+'s':Math.round(t.duration/60)+'m'):'\u2014';\n"
    "                  return `<tr>\n"
    "                    <td class=\"tc\">${fmtTime2(t.date)}</td>\n"
    "                    <td><span class=\"db-badge ${d3}\">${t.direction||'\u2014'}</span></td>\n"
    "                    <td class=\"mono\">${(t.entryPrice??0)>0?(t.entryPrice??0).toFixed(1):'\u2014'}</td>\n"
    "                    <td class=\"tc mono\">${t.symbol||'\u2014'}</td>\n"
    "                    <td class=\"mono\">${(t.exitPrice??0)>0?(t.exitPrice??0).toFixed(1):'\u2014'}</td>\n"
    "                    <td class=\"${pts>=0?'g':'r'}\" style=\"font-weight:800\">${pts>=0?'+':''}${pts.toFixed(0)} pts</td>\n"
    "                    <td><span class=\"pnl-rs ${pts>=0?'g':'r'}\">${rs>=0?'+':'&#8722;'}&#8377;${Math.abs(rs).toLocaleString('en-IN')}</span></td>\n"
    "                    <td>${reason!=='\u2014'?`<span class=\"rc-b ${rTag}\">${reason}</span>`:'\u2014'}</td>\n"
    "                    <td class=\"tc\">${dur}</td>\n"
    "                  </tr>`;"
)
NEW_ROW = (
    "                  const d3=(t.direction||'').toLowerCase();\n"
    "                  const pts=t.pnl??0;\n"
    "                  const _bPrem=(t.premiumEntry??0)>0?(t.premiumEntry??0).toFixed(1):'\u2014';\n"
    "                  const _sPrem=(t.premiumExit??0)>0?(t.premiumExit??0).toFixed(1):'\u2014';\n"
    "                  const rs=(t.premiumEntry>0&&t.premiumExit>0)?Math.round((t.premiumExit-t.premiumEntry)*(t.qty||30)):Math.round(pts*QTY_MULT2);\n"
    "                  const reason=t.reasonExit||'\u2014';\n"
    "                  const rTag=reason.toLowerCase().includes('sl')||reason.toLowerCase().includes('stop')?'rc-sl':reason.toLowerCase().includes('trail')||reason.toLowerCase().includes('early')?'rc-trail':'rc-eod';\n"
    "                  const dur=t.duration?(t.duration<60?t.duration+'s':Math.round(t.duration/60)+'m'):'\u2014';\n"
    "                  return `<tr>\n"
    "                    <td class=\"tc\">${fmtTime2(t.date)}</td>\n"
    "                    <td><span class=\"db-badge ${d3}\">${t.direction||'\u2014'}</span></td>\n"
    "                    <td class=\"mono\">${(t.entryPrice??0)>0?(t.entryPrice??0).toFixed(1):'\u2014'}</td>\n"
    "                    <td class=\"mono\" style=\"color:#94a3b8\">${_bPrem}</td>\n"
    "                    <td class=\"tc mono\">${t.symbol||'\u2014'}</td>\n"
    "                    <td class=\"mono\">${(t.exitPrice??0)>0?(t.exitPrice??0).toFixed(1):'\u2014'}</td>\n"
    "                    <td class=\"mono\" style=\"color:#94a3b8\">${_sPrem}</td>\n"
    "                    <td class=\"${pts>=0?'g':'r'}\" style=\"font-weight:800\">${pts>=0?'+':''}${pts.toFixed(0)} pts</td>\n"
    "                    <td><span class=\"pnl-rs ${rs>=0?'g':'r'}\">${rs>=0?'+':'&#8722;'}&#8377;${Math.abs(rs).toLocaleString('en-IN')}</span></td>\n"
    "                    <td>${reason!=='\u2014'?`<span class=\"rc-b ${rTag}\">${reason}</span>`:'\u2014'}</td>\n"
    "                    <td class=\"tc\">${dur}</td>\n"
    "                  </tr>`;"
)

if OLD_ROW in c:
    c = c.replace(OLD_ROW, NEW_ROW, 1)
    print('OK: row updated with Buy Prem / Sell Prem + premium rs')
else:
    print('FAIL: row not found - checking')
    idx = c.find("const d3=(t.direction||'').toLowerCase();")
    if idx >= 0:
        print(repr(c[idx:idx+200]))

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8') as f:
    f.write(c)
print('server.js saved')
