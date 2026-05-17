with open('/root/zeroscreen/dist/server.js','r') as f:
    lines = f.readlines()

# Insert 2-col mini stats after line 10791 (0-idx 10790, closing pos-lock50-wrap </div>)
insert_after = 10790  # 0-indexed

mini = [
    '        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">\n',
    '          <div class="kpi-m">\n',
    '            <div class="kpi-m-l">Today P&amp;L</div>\n',
    '            <div class="kpi-m-v ${pnlCls2(an2.today.pnl)}" id="ss-today-rs">${fmtRs2(an2.today.pnl)}</div>\n',
    '            <div class="kpi-m-s" id="ss-today-pts">${fmtPts2(an2.today.pnl)}</div>\n',
    '          </div>\n',
    '          <div class="kpi-m">\n',
    '            <div class="kpi-m-l">Trades Today</div>\n',
    '            <div class="kpi-m-v" id="ss-tc">${an2.today.trades}${inTrade2?\'<span style="font-size:.6rem;color:#10b981"> +live</span>\':\'\'}</div>\n',
    '            <div class="kpi-m-s"><span class="g" id="ss-wins">${an2.today.wins}W</span> / <span class="r" id="ss-losses">${an2.today.losses}L</span></div>\n',
    '          </div>\n',
    '        </div>\n',
]

# Insert after index 10790
lines = lines[:insert_after+1] + mini + lines[insert_after+1:]

# After insertion, remove Today P&L + Trades Today from strip below
# Original lines 10798-10807 (1-indexed) were at 0-idx 10797-10806
# After inserting 12 lines, they are now at 0-idx 10797+12=10809 to 10806+12=10818
remove_start = 10809  # 0-indexed after insertion
remove_end   = 10819  # exclusive (10 lines: 2x kpi-m blocks)
lines = lines[:remove_start] + lines[remove_end:]

with open('/root/zeroscreen/dist/server.js','w') as f:
    f.writelines(lines)
print('DONE', len(lines), 'lines')
