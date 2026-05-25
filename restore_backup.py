import shutil

# Step 1: Copy backup to dist/server.js
shutil.copy('/root/zeroscreen/dist/server.js.bak.may25-good', '/root/zeroscreen/dist/server.js')
print("Restored backup to dist/server.js")

with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()
print("Size:", len(c))

# Step 2: Patch Section 1 subtitle - BODY_BREAKOUT → BHAV V3
# Current subtitle: BANKNIFTY · BODY_BREAKOUT · ${mode2} · 30 qty · ₹ P&L = pts × 15
old1 = b'BANKNIFTY \xc2\xb7 BODY_BREAKOUT \xc2\xb7 <strong>${mode2}</strong> \xc2\xb7 30 qty \xc2\xb7 \xe2\x82\xb9 P&L = pts \xc3\x97 15'
new1 = (b'BANKNIFTY &middot; BHAV V3 &middot; <strong>${mode2.toUpperCase()}</strong>'
        b' &middot; 30 qty &middot; SL: <strong>${_slPts2ssr} pts</strong>'
        b' &middot; Entry: PDH/PDL Break &middot; Candle-close SL &middot; Max 5 trades/day')

if old1 in c:
    c = c.replace(old1, new1, 1)
    print("P1: BODY_BREAKOUT -> BHAV V3 OK")
else:
    # Try alternate encoding
    old1b = 'BANKNIFTY · BODY_BREAKOUT · <strong>${mode2}</strong> · 30 qty · ₹ P&L = pts × 15'.encode('utf-8')
    if old1b in c:
        c = c.replace(old1b, new1, 1)
        print("P1 (alt): BODY_BREAKOUT -> BHAV V3 OK")
    else:
        # Search for it manually
        idx = c.find(b'BODY_BREAKOUT')
        print(f"BODY_BREAKOUT at: {idx}")
        if idx != -1:
            print(repr(c[max(0,idx-30):idx+80]))
        print("P1: NOT FOUND")

with open('/root/zeroscreen/dist/server.js', 'wb') as f:
    f.write(c)
print("Written OK")
