with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    c = f.read()

# The \u2014 char is the actual em-dash used in the file for missing values
OLD = (
    "        <div class=\"tw\"><table class=\"tt\">\n"
    "          <thead><tr><th>Time</th><th>Dir</th><th>Buy Index</th><th>Buy Prem</th><th>Symbol</th><th>Sell Index</th><th>Sell Prem</th><th>Index P&amp;L</th><th>&#8377; P&amp;L</th><th>Reason</th><th>Dur</th></tr></thead>\n"
    "          <tbody id=\"tt-body-lock50\">\n"
    "            ${closedToday2.length===0&&!inTrade2\n"
    "              ? `<tr><td colspan=\"11\" class=\"tt-e\">No closed trades today</td></tr>`\n"
    "              : [...closedToday2].reverse().map(t=>{\n"
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
    "                    <td><span class=\"pnl-rs ${pts>=0?'g':'r'}\">${rs>=0?'+':'&#8722;'}&#8377;${Math.abs(rs).toLocaleString('en-IN')}</span></td>\n"
    "                    <td>${reason!=='\u2014'?`<span class=\"rc-b ${rTag}\">${reason}</span>`:'\u2014'}</td>\n"
    "                    <td class=\"tc\">${dur}</td>\n"
    "                  </tr>`;\n"
    "                }).join('')\n"
    "            }\n"
    "          </tbody>\n"
    "        </table></div>"
)

NEW = (
    "        <div class=\"tw\"><table class=\"tt\">\n"
    "          <thead><tr><th>Time</th><th>Dir</th><th>Side</th><th>Index</th><th>Prem</th><th>Symbol</th><th>Index P&amp;L</th><th>&#8377; P&amp;L</th><th>Reason</th><th>Dur</th></tr></thead>\n"
    "          <tbody id=\"tt-body-lock50\">\n"
    "            ${closedToday2.length===0&&!inTrade2\n"
    "              ? `<tr><td colspan=\"10\" class=\"tt-e\">No closed trades today</td></tr>`\n"
    "              : [...closedToday2].reverse().map(t=>{\n"
    "                  const d3=(t.direction||'').toLowerCase();\n"
    "                  const pts=t.pnl??0;\n"
    "                  const _bPrem=(t.premiumEntry??0)>0?(t.premiumEntry??0).toFixed(1):'\u2014';\n"
    "                  const _sPrem=(t.premiumExit??0)>0?(t.premiumExit??0).toFixed(1):'\u2014';\n"
    "                  const rs=(t.premiumEntry>0&&t.premiumExit>0)?Math.round((t.premiumExit-t.premiumEntry)*(t.qty||30)):Math.round(pts*QTY_MULT2);\n"
    "                  const reason=t.reasonExit||'\u2014';\n"
    "                  const rTag=reason.toLowerCase().includes('sl')||reason.toLowerCase().includes('stop')?'rc-sl':reason.toLowerCase().includes('trail')||reason.toLowerCase().includes('early')?'rc-trail':'rc-eod';\n"
    "                  const dur=t.duration?(t.duration<60?t.duration+'s':Math.round(t.duration/60)+'m'):'\u2014';\n"
    "                  return `\n"
    "                  <tr style=\"border-bottom:none\">\n"
    "                    <td class=\"tc\" rowspan=\"2\" style=\"vertical-align:middle\">${fmtTime2(t.date)}</td>\n"
    "                    <td rowspan=\"2\" style=\"vertical-align:middle\"><span class=\"db-badge ${d3}\">${t.direction||'\u2014'}</span></td>\n"
    "                    <td style=\"font-size:.65rem;color:#60a5fa;font-weight:700;padding-bottom:1px\">BUY</td>\n"
    "                    <td class=\"mono\">${(t.entryPrice??0)>0?(t.entryPrice??0).toFixed(1):'\u2014'}</td>\n"
    "                    <td class=\"mono\" style=\"color:#94a3b8\">${_bPrem}</td>\n"
    "                    <td class=\"tc mono\" rowspan=\"2\" style=\"vertical-align:middle\">${t.symbol||'\u2014'}</td>\n"
    "                    <td class=\"${pts>=0?'g':'r'}\" style=\"font-weight:800\" rowspan=\"2\" style=\"vertical-align:middle\">${pts>=0?'+':''}${pts.toFixed(0)} pts</td>\n"
    "                    <td rowspan=\"2\" style=\"vertical-align:middle\"><span class=\"pnl-rs ${rs>=0?'g':'r'}\">${rs>=0?'+':'&#8722;'}&#8377;${Math.abs(rs).toLocaleString('en-IN')}</span></td>\n"
    "                    <td rowspan=\"2\" style=\"vertical-align:middle\">${reason!=='\u2014'?`<span class=\"rc-b ${rTag}\">${reason}</span>`:'\u2014'}</td>\n"
    "                    <td class=\"tc\" rowspan=\"2\" style=\"vertical-align:middle\">${dur}</td>\n"
    "                  </tr>\n"
    "                  <tr>\n"
    "                    <td style=\"font-size:.65rem;color:#fca5a5;font-weight:700;padding-top:1px\">SELL</td>\n"
    "                    <td class=\"mono\">${(t.exitPrice??0)>0?(t.exitPrice??0).toFixed(1):'\u2014'}</td>\n"
    "                    <td class=\"mono\" style=\"color:#94a3b8\">${_sPrem}</td>\n"
    "                  </tr>`;\n"
    "                }).join('')\n"
    "            }\n"
    "          </tbody>\n"
    "        </table></div>"
)

if OLD in c:
    c = c.replace(OLD, NEW, 1)
    print('OK: table redesigned with BUY/SELL rows')
else:
    print('NOT FOUND')
    # find anchor
    idx = c.find('tt-body-lock50')
    if idx >= 0:
        print(repr(c[idx-200:idx+50]))

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8') as f:
    f.write(c)
print('server.js saved')
