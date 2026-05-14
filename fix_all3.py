#!/usr/bin/env python3
"""
3 fixes:
1. hb.tradeCount++ -> hb.tradeCount  (TypeError crashes _dbRefresh before shadow updates)
2. Move db-main block back inside panel-lock50 (was shared, shows TICK TRAIL on all tabs)
3. Show unrealised P&L sub-line in Today P&L row when in trade
"""
FILE = '/root/zeroscreen/dist/server.js'
with open(FILE, 'r', encoding='utf-8') as f:
    src = f.read()

fixes = 0

# ── Fix 1: tradeCount++ crash ────────────────────────────────────────────────
BAD  = "ge('ss-tc').innerHTML=hb.tradeCount++(inT?"
GOOD = "ge('ss-tc').innerHTML=hb.tradeCount+(inT?"
if BAD in src:
    src = src.replace(BAD, GOOD, 1)
    fixes += 1; print("OK: tradeCount++ -> tradeCount")
else:
    print("WARN: tradeCount++ not found, checking:")
    idx = src.find('ss-tc')
    # find the JS update line
    for i in range(5):
        idx2 = src.find('ss-tc', idx+1)
        if idx2 > 0: idx = idx2
    print(repr(src[idx:idx+120]))

# ── Fix 2: Move db-main back inside panel-lock50 ────────────────────────────
# The db-main was extracted and placed BEFORE the TICK TRAIL comment block.
# We need to remove it from there and put it inside panel-lock50.

PANEL_OPEN = '<div id="panel-lock50">'
TRAIL_COMMENT_START = '\n    <!-- '  # The TICK TRAIL comment block

# Find db-main block in current position (before panel-lock50)
# It sits between the </script> of _sTab and the <!-- TICK TRAIL comment
DBMAIN_START_MARKER = '\n      <div class="db-main">'
DBMAIN_END_MARKER = '      </div><!-- /db-main -->'

# Find the db-main that's BEFORE panel-lock50
panel_pos = src.find(PANEL_OPEN)
if panel_pos < 0:
    print("ERROR: panel-lock50 not found"); exit(1)

# Look for db-main before panel-lock50
dbm_pos = src.rfind(DBMAIN_START_MARKER, 0, panel_pos)
if dbm_pos < 0:
    print("INFO: db-main not found before panel-lock50, may already be inside — skipping move")
else:
    dbm_end_pos = src.find(DBMAIN_END_MARKER, dbm_pos)
    if dbm_end_pos < 0:
        print("ERROR: db-main end not found"); exit(1)
    dbm_end_pos += len(DBMAIN_END_MARKER)
    
    # Extract the block
    extracted = src[dbm_pos:dbm_end_pos]
    print(f"Found db-main ({len(extracted)} chars) before panel-lock50, moving inside")
    
    # Remove it from current location (also eat the trailing newline if any)
    after = src[dbm_end_pos:]
    if after.startswith('\n    \n'):
        dbm_end_pos += 1  # eat one extra newline
    src = src[:dbm_pos] + src[dbm_end_pos:]
    
    # Now insert inside panel-lock50 right after its opening tag
    # panel_pos needs to be recalculated since we removed content
    panel_pos2 = src.find(PANEL_OPEN)
    insert_after = panel_pos2 + len(PANEL_OPEN)
    src = src[:insert_after] + '\n' + extracted + src[insert_after:]
    fixes += 1
    print("OK: db-main moved back inside panel-lock50")

# ── Fix 3: Show unrealised P&L sub-line in Today P&L row ─────────────────────
# In the static HTML ss-card, add a hidden unrealised sub-row after today P&L row.
# Find the ss-row for Today P&L and add an unrealised sub-line after it.

OLD_TODAY_ROW = '''              <div style="text-align:right">
                <div class="ss-val ${pnlCls2(an2.today.pnl)}" id="ss-today-rs">${fmtRs2(an2.today.pnl)}</div>
                <div class="ss-sub" id="ss-today-pts">${fmtPts2(an2.today.pnl)}</div>
              </div>
            </div>'''
NEW_TODAY_ROW = '''              <div style="text-align:right">
                <div class="ss-val ${pnlCls2(an2.today.pnl)}" id="ss-today-rs">${fmtRs2(an2.today.pnl)}</div>
                <div class="ss-sub" id="ss-today-pts">${fmtPts2(an2.today.pnl)}</div>
              </div>
            </div>
            <div class="ss-row" id="ss-unr-row" style="${inTrade2?'':'display:none'}">
              <div><div class="ss-lbl" style="color:var(--muted);font-style:italic">↳ Unrealised</div></div>
              <div style="text-align:right">
                <div class="ss-val" id="ss-unr-rs" style="color:${unreal2>=0?'#059669':'#dc2626'}">${fmtRs2(unreal2)}</div>
                <div class="ss-sub" id="ss-unr-pts" style="color:${unreal2>=0?'#059669':'#dc2626'}">${fmtPts2(unreal2)}</div>
              </div>
            </div>'''
if OLD_TODAY_ROW in src:
    src = src.replace(OLD_TODAY_ROW, NEW_TODAY_ROW, 1)
    fixes += 1; print("OK: unrealised sub-row added to static HTML")
else:
    print("WARN: today P&L row not found for unrealised sub-row")

# In _dbRefresh, update the unrealised row
OLD_UNR_JS = "        if(ge('ss-today-rs')){ge('ss-today-rs').textContent=fR(tot);ge('ss-today-rs').style.color=gc(tot);}"
NEW_UNR_JS = """        if(ge('ss-today-rs')){ge('ss-today-rs').textContent=fR(tot);ge('ss-today-rs').style.color=gc(tot);}
        // Unrealised sub-row
        var unrRow=ge('ss-unr-row');
        if(unrRow){
          unrRow.style.display=inT?'':'none';
          if(inT){
            const rR=ge('ss-unr-rs');const rP=ge('ss-unr-pts');
            if(rR){rR.textContent=fR(unr);rR.style.color=gc(unr);}
            if(rP){rP.textContent=fP(unr);rP.style.color=gc(unr);}
          }
        }"""
if OLD_UNR_JS in src:
    src = src.replace(OLD_UNR_JS, NEW_UNR_JS, 1)
    fixes += 1; print("OK: unrealised JS update added")
else:
    print("WARN: ss-today-rs JS line not found")

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"\nDONE — {fixes} fixes applied")
