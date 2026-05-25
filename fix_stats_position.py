with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    c = f.read()

# The stats strip block to move
STATS_STRIP = (
    '    <!-- Stats strip -->\n'
    '    <div class="kpi-mini" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:1rem">\n'
    '      <div class="kpi-m">\n'
    '        <div class="kpi-m-l">This Week</div>\n'
    '        <div class="kpi-m-v ${pnlCls2(an2.weekly.pnl)}" id="ss-wk-rs">${fmtRs2(an2.weekly.pnl)}</div>\n'
    '        <div class="kpi-m-s" id="ss-wk-pts">${fmtPts2(an2.weekly.pnl)}</div>\n'
    '      </div>\n'
    '      <div class="kpi-m">\n'
    '        <div class="kpi-m-l">All-Time P&amp;L</div>\n'
    '        <div class="kpi-m-v ${pnlCls2(an2.allTime.pnl)}">${fmtRs2(an2.allTime.pnl)}</div>\n'
    '        <div class="kpi-m-s">${fmtPts2(an2.allTime.pnl)}</div>\n'
    '      </div>\n'
    '      <div class="kpi-m">\n'
    '        <div class="kpi-m-l">Win Rate</div>\n'
    '        <div class="kpi-m-v" id="ss-wr">${an2.allTime.winRate}%</div>\n'
    '        <div class="kpi-m-s">${an2.allTime.wins}W / ${an2.allTime.losses}L</div>\n'
    '      </div>\n'
    '    </div>\n'
    '\n'
    '      <!-- \u2500\u2500 Trade History (Daily / Weekly / Monthly) \u2500\u2500 -->'
)

NEW_AFTER_STRIP = (
    '      <!-- \u2500\u2500 Trade History (Daily / Weekly / Monthly) \u2500\u2500 -->'
)

# The anchor after the monthly panel end
MONTHLY_END = (
    '                }).join(\'\')\n'
    '            }\n'
    '          </tbody>\n'
    '        </table></div>\n'
    '      </div>'
)

STATS_STRIP_BELOW = (
    '    <!-- Stats strip -->\n'
    '    <div class="kpi-mini" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:1rem">\n'
    '      <div class="kpi-m">\n'
    '        <div class="kpi-m-l">This Week</div>\n'
    '        <div class="kpi-m-v ${pnlCls2(an2.weekly.pnl)}" id="ss-wk-rs">${fmtRs2(an2.weekly.pnl)}</div>\n'
    '        <div class="kpi-m-s" id="ss-wk-pts">${fmtPts2(an2.weekly.pnl)}</div>\n'
    '      </div>\n'
    '      <div class="kpi-m">\n'
    '        <div class="kpi-m-l">All-Time P&amp;L</div>\n'
    '        <div class="kpi-m-v ${pnlCls2(an2.allTime.pnl)}">${fmtRs2(an2.allTime.pnl)}</div>\n'
    '        <div class="kpi-m-s">${fmtPts2(an2.allTime.pnl)}</div>\n'
    '      </div>\n'
    '      <div class="kpi-m">\n'
    '        <div class="kpi-m-l">Win Rate</div>\n'
    '        <div class="kpi-m-v" id="ss-wr">${an2.allTime.winRate}%</div>\n'
    '        <div class="kpi-m-s">${an2.allTime.wins}W / ${an2.allTime.losses}L</div>\n'
    '      </div>\n'
    '    </div>'
)

# Step 1: remove stats strip from above Trade History
if STATS_STRIP in c:
    c = c.replace(STATS_STRIP, NEW_AFTER_STRIP, 1)
    print('OK: removed stats strip from top')
else:
    print('FAIL: stats strip not found at top')

# Step 2: append stats strip after monthly panel end
# Find the LAST occurrence of the monthly panel closing </div>
idx = c.rfind(MONTHLY_END)
if idx >= 0:
    insert_at = idx + len(MONTHLY_END)
    c = c[:insert_at] + '\n\n' + STATS_STRIP_BELOW + c[insert_at:]
    print('OK: stats strip added after monthly panel')
else:
    print('FAIL: monthly panel end not found')

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8') as f:
    f.write(c)
print('server.js saved')
