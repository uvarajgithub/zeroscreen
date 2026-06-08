import os, json

f='/root/zeroscreen/dist/server.js'
raw=open(f,'rb').read()

# ── 1. Add "5-Year" button after Monthly button ──────────────────────────────
OLD_BTNS = b'<button id="th-btn-m" onclick="_thFilter(\'m\')" style="padding:3px 12px;border-radius:5px;font-size:.72rem;font-weight:700;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-muted)">Monthly</button>'
NEW_BTNS = OLD_BTNS + b'\n          <button id="th-btn-5y" onclick="_thFilter(\'5y\')" style="padding:3px 12px;border-radius:5px;font-size:.72rem;font-weight:700;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-muted)">5-Year</button>'
print('btn found:', raw.count(OLD_BTNS))
raw = raw.replace(OLD_BTNS, NEW_BTNS, 1)

# ── 2. Build the 5-year panel rows from futures-monthly-results.json ──────────
try:
    d = json.load(open('/home/ubuntu/trading-bot/futures-monthly-results.json'))
    monthly = d.get('monthly', {})
except Exception as e:
    print('ERROR reading futures json:', e)
    raise SystemExit(1)

MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
rows_html = ''
for mo in sorted(monthly.keys(), reverse=True):
    r = monthly[mo]
    y, mn = mo.split('-')
    lbl = MN[int(mn)-1] + ' ' + y
    net = r['netRs']
    gross = r['grossRs']
    costs = r['costs']
    trades = r['trades']
    win_days = r['winDays']
    total_days = r['totalDays']
    wr = round(win_days / total_days * 100, 0) if total_days else 0
    rs_sign = '+' if net >= 0 else '&#8722;'
    rs_cls = 'g' if net >= 0 else 'r'
    rows_html += f'<tr><td style="font-weight:700">{lbl}</td><td class="{rs_cls}" style="font-weight:800">{rs_sign}&#8377;{abs(net):,}</td><td class="{rs_cls}">{"+"+str(round(gross/30)) if gross>=0 else str(round(gross/30))} pts</td><td>{trades}</td><td class="{"g" if wr>=70 else "r"}">{int(wr)}%</td><td>{win_days}/{total_days}</td></tr>'

total_net = sum(v['netRs'] for v in monthly.values())
total_trades = sum(v['trades'] for v in monthly.values())
total_months = len(monthly)
avg_month = round(total_net / total_months) if total_months else 0
rs_sign_total = '+' if total_net >= 0 else '&#8722;'

panel_html = f'''
      <!-- 5-YEAR panel -->
      <div id="th-panel-5y" style="display:none">
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
          <div class="kpi-m"><div class="kpi-m-l">5-Year Net P&amp;L</div><div class="kpi-m-v g">{rs_sign_total}&#8377;{abs(total_net):,}</div><div class="kpi-m-s">{total_months} months</div></div>
          <div class="kpi-m"><div class="kpi-m-l">Avg / Month</div><div class="kpi-m-v g">+&#8377;{avg_month:,}</div></div>
          <div class="kpi-m"><div class="kpi-m-l">Total Trades</div><div class="kpi-m-v">{total_trades}</div></div>
        </div>
        <div class="tw"><table class="tt">
          <thead><tr><th>Month</th><th>&#8377; P&amp;L</th><th>Index P&amp;L</th><th>Trades</th><th>Win Days%</th><th>Win/Total</th></tr></thead>
          <tbody>{rows_html}</tbody>
        </table></div>
      </div>'''.encode('utf-8')

# ── 3. Inject panel after closing </div> of monthly panel ────────────────────
OLD_PANEL_END = b'        </table></div>\n      </div>\n\n    <!-- Stats strip -->'
NEW_PANEL_END = b'        </table></div>\n      </div>\n' + panel_html + b'\n\n    <!-- Stats strip -->'
print('panel anchor found:', raw.count(OLD_PANEL_END))
raw = raw.replace(OLD_PANEL_END, NEW_PANEL_END, 1)

# ── 4. Update _thFilter to include '5y' ──────────────────────────────────────
OLD_FILTER = b"['d','w','m'].forEach(function(x){"
NEW_FILTER = b"['d','w','m','5y'].forEach(function(x){"
print('filter found:', raw.count(OLD_FILTER))
raw = raw.replace(OLD_FILTER, NEW_FILTER, 1)

tmp = f + '.5yr_tmp'
open(tmp, 'wb').write(raw)
os.rename(tmp, f)
print('DONE, size:', os.path.getsize(f))
