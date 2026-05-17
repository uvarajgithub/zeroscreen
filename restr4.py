with open('/root/zeroscreen/dist/server.js','r') as f:
    lines = f.readlines()

# === Extract blocks (0-indexed) ===

# 1. Timeline core (pm-tl div + script) — from inside top-grid block
#    top-grid block: lines 10655-10801 (1-indexed) = 10654-10800 (0-indexed)
tl_blob = ''.join(lines[10654:10801])
tl_div_start = tl_blob.index('<div class="pm-tl"')
script_end    = tl_blob.rindex('</script>') + len('</script>')
tl_core       = tl_blob[tl_div_start:script_end]

# 2. pos-lock50-wrap block: lines 10804-10837 (1-indexed) = 10803-10836 (0-indexed)
pos_wrap = ''.join(lines[10803:10837])

# 3. ss-card block: lines 10755-10800 (1-indexed) = 10754-10799 (0-indexed)
ss_card = ''.join(lines[10754:10800]).rstrip()

# === Build new layout ===
# TOP SECTION: 2-col grid — LEFT: timeline, RIGHT: pos/watch card
# BELOW: Stats strip as 4 KPI boxes

stats_strip = (
    '    <!-- Stats strip -->\n'
    '    <div class="kpi-mini" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:1rem">\n'
    '      <div class="kpi-m">\n'
    '        <div class="kpi-m-l">Today P&amp;L</div>\n'
    '        <div class="kpi-m-v ${pnlCls2(an2.today.pnl)}" id="ss-today-rs">${fmtRs2(an2.today.pnl)}</div>\n'
    '        <div class="kpi-m-s" id="ss-today-pts">${fmtPts2(an2.today.pnl)}</div>\n'
    '      </div>\n'
    '      <div class="kpi-m">\n'
    '        <div class="kpi-m-l">Trades Today</div>\n'
    '        <div class="kpi-m-v" id="ss-tc">${an2.today.trades}${inTrade2?\'<span style="font-size:.6rem;color:#10b981"> +live</span>\':\'\'}</div>\n'
    '        <div class="kpi-m-s"><span class="g" id="ss-wins">${an2.today.wins}W</span> / <span class="r" id="ss-losses">${an2.today.losses}L</span></div>\n'
    '      </div>\n'
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
)

new_layout = (
    '\n'
    '    <!-- === AMINA 100: 2-col top (Timeline + Position) === -->\n'
    '    <div style="display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:1rem;align-items:start">\n'
    '      <style>@media(min-width:700px){#atl-top-grid{grid-template-columns:1.15fr 1fr!important}}</style>\n'
    '    </div>\n'
    '    <div id="atl-top-grid" style="display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:1.2rem;align-items:start">\n'
    '\n'
    '      <!-- LEFT: Session Timeline -->\n'
    '      <div>\n'
    '        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">\n'
    '          <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:1px;color:#8b949e;font-weight:700">&#9201; Today&#8217;s Session Timeline</span>\n'
    '          <span class="pm-phase" id="atl-phase-badge">Loading&hellip;</span>\n'
    '        </div>\n'
    + tl_core + '\n'
    '      </div>\n'
    '\n'
    '      <!-- RIGHT: Position / Watching card -->\n'
    '      <div>\n'
    '        <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:1px;color:#8b949e;font-weight:700;margin-bottom:8px">&#128203; Current Position</div>\n'
    + pos_wrap
    + '      </div>\n'
    '\n'
    '    </div><!-- /atl-top-grid -->\n'
    '\n'
    + stats_strip
    + '\n'
)

# Replace: lines 10653 (panel-lock50 open) through 10838 (just before trade history, 0-indexed 10837)
# panel-lock50 open: 0-indexed 10652
# Trade history: 0-indexed 10838 (line 10839)

before     = lines[:10652]          # up to but NOT including panel-lock50 open
panel_open = lines[10652]           # '    <div id="panel-lock50">\n'
after      = lines[10838:]          # from trade history onwards

new_lines = before + [panel_open, new_layout] + after

with open('/root/zeroscreen/dist/server.js','w') as f:
    f.writelines(new_lines)

print('DONE - new layout: timeline LEFT, position RIGHT, stats strip below')
print(f'new file lines: {len(new_lines)}')
