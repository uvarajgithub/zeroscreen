#!/usr/bin/env python3
"""
Fix 3 things in server.js:
1. Remove candle timeline sections from TRAIL and LOCK50 Old panels
2. Remove the test marker div from panel-trail
3. Fix _sTab to scroll to panel top on tab switch
4. Also remove _buildTimeline calls for trail/l50o (no containers to render into)
"""

path = '/root/zeroscreen/dist/server.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# ── 1. Remove test marker from panel-trail ────────────────────────────────────
OLD_MARKER = '<!-- TEST_V3 --><div style="background:#ef4444;color:#fff;padding:8px 14px;border-radius:8px;font-weight:800;margin-bottom:10px">\U0001f534 TEST MARKER \u2014 New HTML v3 is live</div>\n      '
if OLD_MARKER in content:
    content = content.replace(OLD_MARKER, '', 1)
    print("Fix 1: test marker removed")
    changes += 1
else:
    # Try simpler removal
    import re
    content2 = re.sub(r'<!-- TEST_V3 -->.*?</div>\n\s*', '', content, count=1, flags=re.DOTALL)
    if content2 != content:
        content = content2
        print("Fix 1: test marker removed (regex)")
        changes += 1
    else:
        print("Fix 1: test marker not found (may already be removed)")

# ── 2. Remove candle timeline from TRAIL panel ────────────────────────────────
# Pattern: the ctl-wrap line for TRAIL
OLD_CTL_TRAIL = "\n      <!-- Timeline -->\n      <div class=\"ctl-wrap\"><div class=\"ctl-hdr\"><span class=\"ctl-title\">\U0001f4c8 15-Min Candle Session \u00b7 TRAIL</span></div><div class=\"ctl-grid\" id=\"ctl-grid-trail\"></div></div>"
if OLD_CTL_TRAIL in content:
    content = content.replace(OLD_CTL_TRAIL, '', 1)
    print("Fix 2: TRAIL candle timeline removed")
    changes += 1
else:
    import re
    pat = r'\n\s*<!-- Timeline -->\n\s*<div class="ctl-wrap">.*?id="ctl-grid-trail".*?</div></div>'
    content2 = re.sub(pat, '', content, count=1)
    if content2 != content:
        content = content2
        print("Fix 2: TRAIL candle timeline removed (regex)")
        changes += 1
    else:
        print("Fix 2 ERROR: TRAIL candle timeline not found")

# ── 3. Remove candle timeline from LOCK50 Old panel ──────────────────────────
OLD_CTL_L50O = "\n      <!-- Timeline -->\n      <div class=\"ctl-wrap\"><div class=\"ctl-hdr\"><span class=\"ctl-title\">\U0001f4c8 15-Min Candle Session \u00b7 LOCK50 Old</span></div><div class=\"ctl-grid\" id=\"ctl-grid-l50o\"></div></div>"
if OLD_CTL_L50O in content:
    content = content.replace(OLD_CTL_L50O, '', 1)
    print("Fix 3: LOCK50 Old candle timeline removed")
    changes += 1
else:
    import re
    pat2 = r'\n\s*<!-- Timeline -->\n\s*<div class="ctl-wrap">.*?id="ctl-grid-l50o".*?</div></div>'
    content2 = re.sub(pat2, '', content, count=1)
    if content2 != content:
        content = content2
        print("Fix 3: LOCK50 Old candle timeline removed (regex)")
        changes += 1
    else:
        print("Fix 3 ERROR: LOCK50 Old candle timeline not found")

# ── 4. Fix inline _sTab - just remove scroll from it (gets overridden by main script anyway) ──
# The real _sTab is in the main <script> block; we'll fix that one instead
print("Fix 4: skipped inline _sTab (overridden by main script)") 

# ── 5. Remove _buildTimeline calls for trail/l50o (no containers anymore) ─────
OLD_BT = "        _buildTimeline('ctl-grid-trail',_candleHistory,hb.shadowTradeLog||[]);\n        _buildTimeline('ctl-grid-l50o',_candleHistory,hb.scalp1TradeLog||[]);"
if OLD_BT in content:
    content = content.replace(OLD_BT, "        // candle timeline removed from TRAIL/LOCK50 Old panels", 1)
    print("Fix 5: _buildTimeline calls for trail/l50o removed")
    changes += 1
else:
    print("Fix 5 ERROR: _buildTimeline calls not found (may need manual check)")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nTotal changes applied: {changes}/5")
