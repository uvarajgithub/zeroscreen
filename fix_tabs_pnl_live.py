#!/usr/bin/env python3
"""
Fix tabs and P&L liveness:
1. Inline _sTab script right after stab-wrap (so onclick fires reliably)
2. Refresh interval 8000 -> 3000ms
3. P&L fallback: compute from lp-ep when unrealisedPnL is 0 and in trade
"""
FILE = '/root/zeroscreen/dist/server.js'
with open(FILE, 'r', encoding='utf-8') as f:
    src = f.read()

fixes = 0

# ── Fix 1: add inline _sTab right after stab-wrap closing div ──────────────
# Anchor: the stab-pnl-l50o element is inside the last tab button.
# Right after the last </button>, there's a </div> that closes stab-wrap.
# We insert an inline <script> immediately after that </div>.

anchor = 'id="stab-pnl-l50o"'
pos = src.find(anchor)
if pos < 0:
    print("ERROR: anchor not found"); exit(1)

end_btn = src.find('</button>', pos)
if end_btn < 0:
    print("ERROR: </button> not found after anchor"); exit(1)

end_wrap = src.find('</div>', end_btn + 9)
if end_wrap < 0:
    print("ERROR: closing </div> for stab-wrap not found"); exit(1)

context = src[end_wrap-5:end_wrap+80]
print(f"Insertion point context: {repr(context[:80])}")

INSERT_POS = end_wrap + len('</div>')
inline = ("\n    <script>"
          "function _sTab(t){"
          "['lock50','trail','lock50old'].forEach(function(id){"
          "var p=document.getElementById('panel-'+id);"
          "var b=document.getElementById('stab-'+id);"
          "if(p)p.style.display=t===id?'block':'none';"
          "if(b)b.classList.toggle('act',t===id);"
          "});}"
          "</script>")

src = src[:INSERT_POS] + inline + src[INSERT_POS:]
fixes += 1
print("OK: inline _sTab added after stab-wrap")

# ── Fix 2: reduce refresh interval ─────────────────────────────────────────
OLD_INTERVAL = 'setInterval(_dbRefresh,8000);'
NEW_INTERVAL = 'setInterval(_dbRefresh,3000);'
if OLD_INTERVAL in src:
    src = src.replace(OLD_INTERVAL, NEW_INTERVAL, 1)
    fixes += 1
    print("OK: interval 8000->3000ms")
else:
    print("WARN: 8000 interval not found")

# ── Fix 3: P&L fallback (compute from lp-ep when heartbeat gives 0) ────────
OLD_UNR = 'const unr=parseFloat(hb.unrealisedPnL||0);'
NEW_UNR = ('const _rawUnr=parseFloat(hb.unrealisedPnL||0);'
           "const dir=hb.direction||'';"
           'const unr=(_rawUnr===0&&inT&&lp>0&&ep>0)?(dir==="CE"?lp-ep:ep-lp):_rawUnr;')
if OLD_UNR in src:
    src = src.replace(OLD_UNR, NEW_UNR, 1)
    fixes += 1
    print("OK: P&L fallback from lp-ep")
else:
    print("WARN: unrealisedPnL line not found, skipping fallback")

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"\nDONE — {fixes} fixes applied")
