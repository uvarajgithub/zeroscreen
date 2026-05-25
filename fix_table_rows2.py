with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the line with thead containing "Buy Index"..."Sell Index"
start = None
for i, ln in enumerate(lines):
    if 'tt-body-lock50' in ln and start is None:
        # thead is the line before tbody, back up 2
        for j in range(i-1, max(0,i-5), -1):
            if '<thead>' in lines[j] and 'Buy Index' in lines[j]:
                start = j
                break

if start is None:
    print('Could not find thead line')
    exit()

# Find the end: </tbody>
end = None
for i in range(start, min(len(lines), start+40)):
    if '</tbody>' in lines[i]:
        end = i
        break

print(f'Replacing lines {start+1} to {end+1}')
print('OLD:')
for i in range(start, end+1):
    print(f'  {i+1}: {repr(lines[i][:80])}')

# Get the em-dash character as used in file (read from existing line)
emdash = None
for i in range(start, end+1):
    if "toFixed(1):'" in lines[i] and "premiumEntry" in lines[i]:
        idx = lines[i].find("toFixed(1):'")
        emdash = lines[i][idx+12]  # char right after the quote
        print(f'em-dash char: {repr(emdash)}')
        break
if emdash is None:
    emdash = '\u2014'  # fallback

D = emdash  # the actual dash char used in file

NEW_LINES = [
    "          <thead><tr><th>Time</th><th>Dir</th><th>Side</th><th>Index</th><th>Prem</th><th>Symbol</th><th>Index P&amp;L</th><th>&#8377; P&amp;L</th><th>Reason</th><th>Dur</th></tr></thead>\n",
    "          <tbody id=\"tt-body-lock50\">\n",
    "            ${closedToday2.length===0&&!inTrade2\n",
    f"              ? `<tr><td colspan=\"10\" class=\"tt-e\">No closed trades today</td></tr>`\n",
    "              : [...closedToday2].reverse().map(t=>{\n",
    "                  const d3=(t.direction||'').toLowerCase();\n",
    "                  const pts=t.pnl??0;\n",
    f"                  const _bPrem=(t.premiumEntry??0)>0?(t.premiumEntry??0).toFixed(1):'{D}';\n",
    f"                  const _sPrem=(t.premiumExit??0)>0?(t.premiumExit??0).toFixed(1):'{D}';\n",
    "                  const rs=(t.premiumEntry>0&&t.premiumExit>0)?Math.round((t.premiumExit-t.premiumEntry)*(t.qty||30)):Math.round(pts*QTY_MULT2);\n",
    f"                  const reason=t.reasonExit||'{D}';\n",
    "                  const rTag=reason.toLowerCase().includes('sl')||reason.toLowerCase().includes('stop')?'rc-sl':reason.toLowerCase().includes('trail')||reason.toLowerCase().includes('early')?'rc-trail':'rc-eod';\n",
    f"                  const dur=t.duration?(t.duration<60?t.duration+'s':Math.round(t.duration/60)+'m'):'{D}';\n",
    "                  return `\n",
    "                  <tr style=\"border-bottom:none\">\n",
    "                    <td class=\"tc\" rowspan=\"2\" style=\"vertical-align:middle\">${fmtTime2(t.date)}</td>\n",
    "                    <td rowspan=\"2\" style=\"vertical-align:middle\"><span class=\"db-badge ${d3}\">${t.direction||'"+D+"'}</span></td>\n",
    "                    <td style=\"font-size:.65rem;color:#60a5fa;font-weight:700\">BUY</td>\n",
    "                    <td class=\"mono\">${(t.entryPrice??0)>0?(t.entryPrice??0).toFixed(1):'"+D+"'}</td>\n",
    "                    <td class=\"mono\" style=\"color:#94a3b8\">${_bPrem}</td>\n",
    "                    <td class=\"tc mono\" rowspan=\"2\" style=\"vertical-align:middle\">${t.symbol||'"+D+"'}</td>\n",
    "                    <td class=\"${pts>=0?'g':'r'}\" style=\"font-weight:800\" rowspan=\"2\">${pts>=0?'+':''}${pts.toFixed(0)} pts</td>\n",
    "                    <td rowspan=\"2\"><span class=\"pnl-rs ${rs>=0?'g':'r'}\">${rs>=0?'+':'&#8722;'}&#8377;${Math.abs(rs).toLocaleString('en-IN')}</span></td>\n",
    "                    <td rowspan=\"2\">${reason!='"+D+"'?`<span class=\"rc-b ${rTag}\">${reason}</span>`:'"+D+"'}</td>\n",
    "                    <td class=\"tc\" rowspan=\"2\" style=\"vertical-align:middle\">${dur}</td>\n",
    "                  </tr>\n",
    "                  <tr>\n",
    "                    <td style=\"font-size:.65rem;color:#fca5a5;font-weight:700\">SELL</td>\n",
    "                    <td class=\"mono\">${(t.exitPrice??0)>0?(t.exitPrice??0).toFixed(1):'"+D+"'}</td>\n",
    "                    <td class=\"mono\" style=\"color:#94a3b8\">${_sPrem}</td>\n",
    "                  </tr>`;\n",
    "                }).join('')\n",
    "            }\n",
    "          </tbody>\n",
]

lines[start:end+1] = NEW_LINES
print(f'Replaced {end+1-start} lines with {len(NEW_LINES)} lines')

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('server.js saved')
