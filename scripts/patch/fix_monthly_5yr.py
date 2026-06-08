import os, json, re

f='/root/zeroscreen/dist/server.js'
raw=open(f,'rb').read()

# ── 1. Build 66-month static rows from futures JSON ──────────────────────────
d = json.load(open('/home/ubuntu/trading-bot/futures-monthly-results.json'))
monthly = d.get('monthly', {})
MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

rows = ''
for mo in sorted(monthly.keys(), reverse=True):
    r = monthly[mo]
    y, mn = mo.split('-')
    lbl = MN[int(mn)-1] + ' ' + y
    net = r['netRs']
    pts = round(r['grossRs'] / 30)  # index pts approx
    trades = r['trades']
    win_days = r['winDays']
    total_days = r['totalDays']
    wr = f"{round(win_days/total_days*100)}%" if total_days else '—'
    rs_sign = '+' if net >= 0 else '&#8722;'
    pts_sign = '+' if pts >= 0 else ''
    cls = 'g' if net >= 0 else 'r'
    rows += (
        f'<tr>'
        f'<td style="font-weight:600">{lbl}</td>'
        f'<td class="{cls}" style="font-weight:800">{rs_sign}&#8377;{abs(net):,}</td>'
        f'<td class="{cls}">{pts_sign}{pts} pts</td>'
        f'<td>{trades}</td>'
        f'<td><span class="g">{win_days}W</span> / <span class="r">{total_days - win_days}L</span></td>'
        f'<td>{wr}</td>'
        f'</tr>'
    )

static_tbody = rows.encode('utf-8')

# ── 2. Replace the dynamic monthly block with static rows ────────────────────
OLD_DYN = (
    b"            ${!an2.monthly.length\n"
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
    b"                    <td>${m.trades>0?m.winRate+'%':'\xce\x93\xc3\xb6'}</td>\n"
    b"                  </tr>`;\n"
    b"                }).join('')\n"
    b"            }"
)
print('dynamic block found:', raw.count(OLD_DYN))
raw = raw.replace(OLD_DYN, b'            ' + static_tbody, 1)

# ── 3. Remove the 5-year panel (added by mistake earlier) ───────────────────
raw = re.sub(
    rb'\n      <!-- 5-YEAR panel -->.*?</div>\n\n    <!-- Stats strip -->',
    b'\n\n    <!-- Stats strip -->',
    raw,
    count=1,
    flags=re.DOTALL
)

# ── 4. Remove the 5-year button if still present ────────────────────────────
OLD_BTN = b'\n          <button id="th-btn-5y" onclick="_thFilter(\'5y\')" style="padding:3px 12px;border-radius:5px;font-size:.72rem;font-weight:700;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-muted)">5-Year</button>'
raw = raw.replace(OLD_BTN, b'', 1)

# ── 5. Revert filter array back to ['d','w','m'] ─────────────────────────────
raw = raw.replace(b"['d','w','m','5y'].forEach(function(x){", b"['d','w','m'].forEach(function(x){", 1)

tmp = f + '.monthly5yr_tmp'
open(tmp,'wb').write(raw)
os.rename(tmp, f)
print('DONE, size:', os.path.getsize(f))
