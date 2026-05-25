with open('/root/zeroscreen/dist/server.js.bak.may25-good', 'rb') as f:
    bak = f.read()
with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    cur = f.read()

# ── 1. Extract hb-* CSS from backup ──────────────────────────────────────────
css_start = bak.find(b'.hb{')
if css_start == -1:
    css_start = bak.find(b'.hb {')
css_end = bak.find(b'.bot-ctl-menu{', css_start)
if css_end == -1:
    css_end = bak.find(b'.bot-ctl-menu {', css_start)
# go past that rule too — find next .db- or major rule after bot-ctl-menu
css_end2 = bak.find(b'.db-main{', css_end)
if css_end2 == -1:
    css_end2 = bak.find(b'\n    .', css_end + 50)
hb_css = bak[css_start:css_end2].strip()
print("=== HB CSS EXTRACTED ===")
print(hb_css[:800].decode('utf-8','replace'))
print("...")

# ── 2. Extract hb HTML block from backup ─────────────────────────────────────
hb_html_start = bak.find(b'<div class="hb" id="hb-bar">')
# end at the next major comment or div section
hb_html_end = bak.find(b'<!-- ', hb_html_start + 10)
hb_html = bak[hb_html_start:hb_html_end].strip()
print("\n=== HB HTML EXTRACTED ===")
print(hb_html[:800].decode('utf-8','replace'))
print("...")

# ── 3. Find what Section 2 looks like in current server.js ───────────────────
sig3_start = cur.find(b'<div class="sig3-bot-status"')
print(f"\n=== sig3-bot-status in current JS at: {sig3_start} ===")
if sig3_start != -1:
    print(cur[sig3_start:sig3_start+300].decode('utf-8','replace'))
