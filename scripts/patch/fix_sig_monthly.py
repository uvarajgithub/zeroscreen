import os, json

f='/root/zeroscreen/dist/server.js'
raw=open(f,'rb').read()

# Build 66-month static rows (sig3 table: 5 cols)
d = json.load(open('/home/ubuntu/trading-bot/futures-monthly-results.json'))
monthly = d.get('monthly', {})
MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

rows = ''
for mo in sorted(monthly.keys(), reverse=True):
    r = monthly[mo]
    y, mn = mo.split('-')
    lbl = MN[int(mn)-1] + " '" + y[2:]   # e.g. "Jun '26"
    net = r['netRs']
    pts = round(net / 30)
    trades = r['trades']
    win_days = r['winDays']
    total_days = r['totalDays']
    wr = f"{round(win_days/total_days*100)}%" if total_days else '\u2014'
    cls_rs = 'sig3-g' if net >= 0 else 'sig3-r'
    cls_wr = 'sig3-g' if (total_days and win_days/total_days >= 0.55) else ('' if (total_days and win_days/total_days >= 0.40) else 'sig3-r')
    # Format ₹ amount: sign + ₹ + abs
    rs_sign = '+' if net >= 0 else '&#8722;'
    pts_sign = '+' if pts >= 0 else ''
    abs_net = abs(net)
    # Indian number format
    s = str(abs_net)
    if len(s) > 3:
        last3 = s[-3:]
        rest = s[:-3]
        parts = [rest[max(0,i-2):i] for i in range(len(rest), 0, -2)][::-1]
        formatted = ','.join(p for p in parts if p) + ',' + last3
    else:
        formatted = s
    rows += (
        f'<tr>'
        f'<td style="font-weight:600">{lbl}</td>'
        f'<td><span class="sig3-pnl-rs {cls_rs}" style="font-size:.95rem">{rs_sign}&#8377;{formatted}</span></td>'
        f'<td class="sig3-mono" style="font-size:.76rem;color:var(--text-muted)">{pts_sign}{pts} pts</td>'
        f'<td>{trades}</td>'
        f'<td class="{cls_wr}">{wr}</td>'
        f'</tr>'
    )

OLD = (
    b'${analytics.monthly.slice(0, 6).map((m) => {\n'
    b'        const ml = new Date(m.month + "-01").toLocaleString("en-IN", { month: "short", year: "2-digit" });\n'
    b'        return `<tr>\n'
    b'              <td style="font-weight:600">${ml}</td>\n'
    b'              <td><span class="sig3-pnl-rs ${m.pnl >= 0 ? "sig3-g" : "sig3-r"}" style="font-size:.95rem"><span class="${!loggedIn ? \'sig-blur\' : \'\'}">${fmtRsG(m.pnl)}</span></span></td>\n'
    b'              <td class="sig3-mono" style="font-size:.76rem;color:var(--text-muted)"><span class="${!loggedIn ? \'sig-blur\' : \'\'}">${fmtPtsG(m.pnl)}</span></td>\n'
    b'              <td>${m.trades}</td>\n'
    b'              <td class="${m.winRate >= 55 ? "sig3-g" : m.winRate >= 40 ? "" : "sig3-r"}"><span class="${!loggedIn ? \'sig-blur\' : \'\'}">${m.trades > 0 ? m.winRate + "%" : "\\u2014"}</span></td>\n'
    b"            </tr>`;\n"
    b"    }).join(\"\") || '<tr><td colspan=\"5\" class=\"sig3-te\">No historical data yet</td></tr>'}"
)

NEW = rows.encode('utf-8')
count = raw.count(OLD)
print('found:', count)
if count == 1:
    raw = raw.replace(OLD, NEW, 1)
    tmp = f + '.sig_monthly_tmp'
    open(tmp,'wb').write(raw)
    os.rename(tmp, f)
    print('DONE, size:', os.path.getsize(f))
else:
    print('ERROR: pattern not found exactly once')
    # Debug: try partial match
    p1 = b'analytics.monthly.slice(0, 6)'
    print('partial found:', raw.count(p1))
