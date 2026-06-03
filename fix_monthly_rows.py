import os, json

f='/root/zeroscreen/dist/server.js'
raw=open(f,'rb').read()

# Build 66-month static rows
d = json.load(open('/home/ubuntu/trading-bot/futures-monthly-results.json'))
monthly = d.get('monthly', {})
MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

rows = ''
for mo in sorted(monthly.keys(), reverse=True):
    r = monthly[mo]
    y, mn = mo.split('-')
    lbl = MN[int(mn)-1] + ' ' + y
    net = r['netRs']
    pts = round(r['grossRs'] / 30)
    trades = r['trades']
    win_days = r['winDays']
    total_days = r['totalDays']
    loss_days = total_days - win_days
    wr = f"{round(win_days/total_days*100)}%" if total_days else '\u2014'
    rs_sign = '+' if net >= 0 else '&#8722;'
    pts_sign = '+' if pts >= 0 else ''
    cls = 'g' if net >= 0 else 'r'
    rows += (
        f'<tr>'
        f'<td style="font-weight:600">{lbl}</td>'
        f'<td class="{cls}" style="font-weight:800">{rs_sign}&#8377;{abs(net):,}</td>'
        f'<td class="{cls}">{pts_sign}{pts} pts</td>'
        f'<td>{trades}</td>'
        f'<td><span class="g">{win_days}W</span> / <span class="r">{loss_days}L</span></td>'
        f'<td>{wr}</td>'
        f'</tr>'
    )

OLD = (
    b"an2.monthly.length\n"
    b"              ? '<tr><td colspan=\"6\" class=\"tt-e\">No monthly data yet</td></tr>'\n"
    b"              : an2.monthly.map(m=>{\n"
    b"                  const [y,mo]=m.month.split('-');\n"
    b"                  const ml=new Date(parseInt(y),parseInt(mo)-1,1).toLocaleString('en-IN',{month:'long',year:'numeric'});\n"
    b"                  const rs=Math.round(m.pnl*QTY_MULT2);\n"
    b"                  return `<tr>\n"
    b"                    <td style=\"font-weight:600\">${ml}</td>\n"
    b"                    <td class=\"${m.pnl>=0?'g':'r'}\" style=\"font-weight:800\">${rs>=0?'+':'&#8722;'}&#8377;${Math.abs(rs).toLocaleString('en-IN')}</td>\n"
    b"                    <td class=\"${m.pnl>=0?'g':'r'}\">${m.pnl>=0?'+':''}${m.pnl.toFixed(0)} pts</td>\n"
    b"                    <td>${m.trades}</td>\n"
    b"                    <td><span class=\"g\">${m.wins}W</span> / <span class=\"r\">${m.losses}L</span></td>\n"
    b"                    <td>${m.trades>0?m.winRate+'%':'\xe2\x80\x94'}</td>\n"
    b"                  </tr>`;\n"
    b"                }).join('')\n"
    b"            }"
)
NEW = rows.encode('utf-8')
print('found:', raw.count(OLD))
raw = raw.replace(OLD, NEW, 1)

tmp = f + '.m5_tmp'
open(tmp,'wb').write(raw)
os.rename(tmp, f)
print('DONE, size:', os.path.getsize(f))
