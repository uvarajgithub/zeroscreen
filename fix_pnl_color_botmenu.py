#!/usr/bin/env python3
"""
Fix two issues:
1. Tab P&L color: all 3 tabs show green/red based on value (both SSR and JS refresh)
2. Bot dropdown: toggle was checking display==='none' but initial value is '' so never opened
"""
FILE = '/root/zeroscreen/dist/server.js'
with open(FILE, 'r', encoding='utf-8') as f:
    src = f.read()

fixes = 0

def rpl(old, new, label):
    global src, fixes
    if old not in src:
        print(f"WARN: {label} not found")
        return False
    src = src.replace(old, new, 1)
    fixes += 1
    print(f"OK: {label}")
    return True

# ─── 1. SSR: TICK TRAIL tab P&L — use dynamic color class instead of hardcoded 'g' ─
rpl(
    '<span class="stab-pnl g" id="stab-pnl-lock50">${fmtRs2(an2.today.pnl)}</span>',
    '<span class="stab-pnl" id="stab-pnl-lock50" style="color:${an2.today.pnl>=0?\'#059669\':\'#dc2626\'}">${fmtRs2(an2.today.pnl)}</span>',
    'SSR TICK TRAIL tab P&L color'
)

# ─── 2. SSR: TRAIL tab P&L — use green/red instead of hardcoded purple ───────
rpl(
    '<span class="stab-pnl" id="stab-pnl-trail" style="color:#6366f1">${fmtRs2(hb2.shadowPnL??0)}</span>',
    '<span class="stab-pnl" id="stab-pnl-trail" style="color:${(hb2.shadowPnL??0)>=0?\'#059669\':\'#dc2626\'}">${fmtRs2(hb2.shadowPnL??0)}</span>',
    'SSR TRAIL tab P&L color'
)

# ─── 3. SSR: LOCK50 Old tab P&L — use green/red instead of .am (amber) ───────
rpl(
    '<span class="stab-pnl am" id="stab-pnl-l50o">${fmtRs2(hb2.scalp1PnL??0)}</span>',
    '<span class="stab-pnl" id="stab-pnl-l50o" style="color:${(hb2.scalp1PnL??0)>=0?\'#059669\':\'#dc2626\'}">${fmtRs2(hb2.scalp1PnL??0)}</span>',
    'SSR LOCK50 Old tab P&L color'
)

# ─── 4. JS refresh: Trail and Lock50Old tabs also need color update ───────────
rpl(
    "const tpTrail=ge('stab-pnl-trail');if(tpTrail)tpTrail.textContent=fR(shPnl);\n      const tpL50o=ge('stab-pnl-l50o');if(tpL50o)tpL50o.textContent=fR(s1Pnl);",
    "const tpTrail=ge('stab-pnl-trail');if(tpTrail){tpTrail.textContent=fR(shPnl);tpTrail.style.color=gc(shPnl);}\n      const tpL50o=ge('stab-pnl-l50o');if(tpL50o){tpL50o.textContent=fR(s1Pnl);tpL50o.style.color=gc(s1Pnl);}",
    'JS trail+lock50old tab color update'
)

# ─── 5. Bot dropdown: fix toggle — check 'block' not 'none' (initial state is '') ─
rpl(
    "function _toggleBotMenu(e){e.stopPropagation();var m=ge('bot-ctl-menu');if(m)m.style.display=m.style.display==='none'?'block':'none';}",
    "function _toggleBotMenu(e){e.stopPropagation();var m=ge('bot-ctl-menu');if(m)m.style.display=m.style.display==='block'?'none':'block';}",
    'bot dropdown toggle fix'
)

# ─── 6. Also add type=button to the bot ctl button so it doesn't submit ──────
rpl(
    '<button onclick="_toggleBotMenu(event)" style="padding:3px 11px;border-radius:6px;font-size:.7rem;font-weight:700;cursor:pointer;background:rgba(5,150,105,.1);border:1px solid rgba(5,150,105,.4);color:#059669">',
    '<button onclick="_toggleBotMenu(event)" type="button" style="padding:3px 11px;border-radius:6px;font-size:.7rem;font-weight:700;cursor:pointer;background:rgba(5,150,105,.1);border:1px solid rgba(5,150,105,.4);color:#059669">',
    'bot button type=button'
)

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"\nDONE — {fixes} fixes applied")
