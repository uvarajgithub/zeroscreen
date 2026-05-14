#!/usr/bin/env python3
"""
Comprehensive fix:
1. Remove 15-Min Candle section from TICK TRAIL (panel-lock50)
2. Server-render TRAIL + LOCK50 Old shadow panels using hb2 data
   so position cards show immediately on page load (not just after JS refresh)
"""
import re

path = '/root/zeroscreen/dist/server.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# ─────────────────────────────────────────────────────────────────────────────
# FIX 1: Remove candle section from TICK TRAIL (panel-lock50)
# ─────────────────────────────────────────────────────────────────────────────
# Target the whole ctl-wrap block including the comment above it
OLD_CTL_LOCK50 = """      <!-- 2-col main area -->

      <!-- ── 15-Min Candle Timeline ── -->
      <div class="ctl-wrap">
        <div class="ctl-hdr">
          <span class="ctl-title">📈 15-Min Candle Session · ${todayStr2}</span>
          <span class="ctl-legend">
            <span><span class="ctl-legend-dot" style="background:#10b981"></span>Bullish</span>
            <span><span class="ctl-legend-dot" style="background:#ef4444"></span>Bearish</span>
            <span><span style="font-size:.75rem">▲</span> Entry</span>
            <span><span style="font-size:.75rem">▼</span> Exit</span>
          </span>
        </div>
        <div class="ctl-grid" id="ctl-grid-lock50"></div>
      </div>"""

# Use regex to handle unicode/encoding variations
pat_ctl = r'\s*<!-- 2-col main area -->\s*\n\s*<!-- [─\-]+ 15-Min Candle Timeline [─\-]+ -->\s*\n\s*<div class="ctl-wrap">.*?<div class="ctl-grid" id="ctl-grid-lock50"></div>\s*\n\s*</div>'
m = re.search(pat_ctl, content, re.DOTALL)
if m:
    content = content.replace(m.group(0), '', 1)
    print("Fix 1: Candle section removed from TICK TRAIL (regex)")
    changes += 1
else:
    # Simpler targeted removal
    pat2 = r'<div class="ctl-grid" id="ctl-grid-lock50"></div>\s*\n\s*</div>'
    # Find the enclosing ctl-wrap
    idx = content.find('<div class="ctl-grid" id="ctl-grid-lock50">')
    if idx > 0:
        # Find the start of the ctl-wrap that contains it
        start = content.rfind('<div class="ctl-wrap">', 0, idx)
        # Find the end (closing </div> after ctl-grid)
        end = content.find('</div>', idx) + len('</div>')
        if start > 0 and end > 0:
            # Also grab any comment + newlines before it
            comment_start = content.rfind('<!-- ', 0, start)
            if comment_start > 0 and '15-Min' in content[comment_start:start]:
                # grab from comment to end of ctl-wrap
                newline_before = content.rfind('\n', 0, comment_start)
                start = newline_before if newline_before > 0 else start
            content = content[:start] + content[end:]
            print("Fix 1: Candle section removed from TICK TRAIL (idx search)")
            changes += 1
    else:
        print("Fix 1 ERROR: ctl-grid-lock50 not found")

# Also remove _buildTimeline for lock50 if it still exists
if "_buildTimeline('ctl-grid-lock50'" in content:
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if "_buildTimeline('ctl-grid-lock50'" in line:
            lines[i] = '        // candle timeline removed from TICK TRAIL panel'
            content = '\n'.join(lines)
            print("Fix 1b: _buildTimeline for lock50 removed")
            changes += 1
            break

# ─────────────────────────────────────────────────────────────────────────────
# FIX 2: Server-render TRAIL shadow panel with real hb2 data
# Replace the static watching/in-trade card HTML with template-literal conditionals
# ─────────────────────────────────────────────────────────────────────────────

OLD_TRAIL_POS = """        <div id="sh-pos-trail-wrap">
          <!-- Flat / watching card -->
          <div class="sh-pos sh-pos-watch" id="sh-pos-trail-flat">
            <div class="watch-title"><span>⏳</span> TRAIL Shadow — <span id="sh-trail-status">Watching</span></div>
            <div id="sh-trail-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Watching for next signal⏳</div>
            <div id="sh-trail-watch" style="margin-top:10px"></div>
          </div>
          <!-- In-trade card (hidden when flat) -->
          <div class="pos-card pos-ce" id="sh-pos-trail-card" style="display:none">
            <div class="pos-hdr">
              <span class="pos-live-dot"></span>
              <span class="pos-badge pos-b-ce" id="sh-trail-card-badge">CE OPTION</span>
              <span class="pos-sym">BANKNIFTY</span>
              <span class="pos-mode">PAPER</span>
            </div>
            <div class="pos-pnl-rs g" id="sh-trail-card-rs">—</div>
            <div class="pos-pnl-pts g" id="sh-trail-card-pts">— unrealised</div>
            <div class="pos-grid">
              <div><div class="pos-lbl">Entry Index</div><div class="pos-val mono" id="sh-trail-card-ep">—</div></div>
              <div><div class="pos-lbl">Live Index</div><div class="pos-val g mono" id="sh-trail-card-lp">—</div></div>
              <div><div class="pos-lbl">Stop Loss</div><div class="pos-val r mono" id="sh-trail-card-sl">—</div></div>
              <div><div class="pos-lbl">SL Risk ₹</div><div class="pos-val r" id="sh-trail-card-slrs">—</div></div>
            </div>
          </div>
        </div>"""

NEW_TRAIL_POS = """        <div id="sh-pos-trail-wrap">
          \${hb2.shadowInTrade && (hb2.shadowEntry||0) > 0 ? \`
          <!-- In-trade card -->
          <div class="pos-card pos-\${(hb2.shadowDir||'ce').toLowerCase()}" id="sh-pos-trail-card">
            <div class="pos-hdr">
              <span class="pos-live-dot"></span>
              <span class="pos-badge pos-b-\${(hb2.shadowDir||'ce').toLowerCase()}" id="sh-trail-card-badge">\${(hb2.shadowDir||'CE').toUpperCase()} OPTION</span>
              <span class="pos-sym">BANKNIFTY</span>
              <span class="pos-mode">PAPER</span>
            </div>
            <div class="pos-pnl-rs g" id="sh-trail-card-rs">—</div>
            <div class="pos-pnl-pts g" id="sh-trail-card-pts">— unrealised</div>
            <div class="pos-grid">
              <div><div class="pos-lbl">Entry Index</div><div class="pos-val mono" id="sh-trail-card-ep">\${(hb2.shadowEntry||0).toFixed(1)}</div></div>
              <div><div class="pos-lbl">Live Index</div><div class="pos-val g mono" id="sh-trail-card-lp">\${live2>0?live2.toFixed(1):'—'}</div></div>
              <div><div class="pos-lbl">Stop Loss</div><div class="pos-val r mono" id="sh-trail-card-sl">\${(hb2.shadowSL||0)>0?(hb2.shadowSL).toFixed(1):'—'}</div></div>
              <div><div class="pos-lbl">SL Risk ₹</div><div class="pos-val r" id="sh-trail-card-slrs">—</div></div>
            </div>
          </div>
          <div class="sh-pos sh-pos-watch" id="sh-pos-trail-flat" style="display:none">
            <div class="watch-title"><span>⏳</span> TRAIL Shadow — <span id="sh-trail-status">In Trade</span></div>
            <div id="sh-trail-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)"></div>
            <div id="sh-trail-watch" style="margin-top:10px"></div>
          </div>
          \` : \`
          <!-- Flat / watching card -->
          <div class="sh-pos sh-pos-watch" id="sh-pos-trail-flat">
            <div class="watch-title"><span>⏳</span> TRAIL Shadow — <span id="sh-trail-status">Watching</span></div>
            <div id="sh-trail-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Watching for next signal⏳</div>
            <div id="sh-trail-watch" style="margin-top:10px"></div>
          </div>
          <div class="pos-card pos-ce" id="sh-pos-trail-card" style="display:none">
            <div class="pos-hdr">
              <span class="pos-live-dot"></span>
              <span class="pos-badge pos-b-ce" id="sh-trail-card-badge">CE OPTION</span>
              <span class="pos-sym">BANKNIFTY</span>
              <span class="pos-mode">PAPER</span>
            </div>
            <div class="pos-pnl-rs g" id="sh-trail-card-rs">—</div>
            <div class="pos-pnl-pts g" id="sh-trail-card-pts">— unrealised</div>
            <div class="pos-grid">
              <div><div class="pos-lbl">Entry Index</div><div class="pos-val mono" id="sh-trail-card-ep">—</div></div>
              <div><div class="pos-lbl">Live Index</div><div class="pos-val g mono" id="sh-trail-card-lp">—</div></div>
              <div><div class="pos-lbl">Stop Loss</div><div class="pos-val r mono" id="sh-trail-card-sl">—</div></div>
              <div><div class="pos-lbl">SL Risk ₹</div><div class="pos-val r" id="sh-trail-card-slrs">—</div></div>
            </div>
          </div>
          \`}
        </div>"""

# Use regex to handle unicode variations in the search
pat_trail = r'<div id="sh-pos-trail-wrap">.*?</div>\s*</div>\s*</div>\s*</div>\s*</div>\s*</div>'
# Actually just search line by line for the block
lines = content.split('\n')
start_i = None
end_i = None
for i, line in enumerate(lines):
    if 'id="sh-pos-trail-wrap"' in line:
        start_i = i
    if start_i is not None and '</div>' in line and i > start_i + 20:
        # Count divs to find matching close
        pass

# Simpler: find exact text match (handling unicode)
if OLD_TRAIL_POS in content:
    content = content.replace(OLD_TRAIL_POS, NEW_TRAIL_POS, 1)
    print("Fix 2: TRAIL shadow panel server-rendered")
    changes += 1
else:
    # Try to find by key unique substring
    key = 'id="sh-pos-trail-wrap"'
    idx = content.find(key)
    if idx > 0:
        print(f"Fix 2: Found sh-pos-trail-wrap at char {idx}, attempting targeted replacement")
        # Find the div start
        div_start = content.rfind('<div', 0, idx)
        # Find the closing of sh-pos-trail-wrap (4 closing divs: watching div, watch-title, in-trade div, wrap div)
        # Count from idx forward
        depth = 0
        pos = div_start
        while pos < len(content):
            if content[pos:pos+4] == '<div':
                depth += 1
            elif content[pos:pos+6] == '</div>':
                depth -= 1
                if depth == 0:
                    end_pos = pos + 6
                    break
            pos += 1
        old_block = content[div_start:end_pos]
        print(f"  Block length: {len(old_block)} chars")
        print(f"  First 80: {old_block[:80]}")
        print(f"  Last 80: {old_block[-80:]}")
        # Don't replace automatically - report for manual fix
        print("  Manual fix needed - block found but can't auto-replace due to unicode")
    else:
        print("Fix 2 ERROR: sh-pos-trail-wrap not found")

# ─────────────────────────────────────────────────────────────────────────────
# FIX 3: Server-render LOCK50 Old shadow panel with real hb2 data
# ─────────────────────────────────────────────────────────────────────────────

OLD_L50O_POS = """        <div id="sh-pos-l50o-wrap">
          <!-- Flat / watching card -->
          <div class="sh-pos sh-pos-watch" id="sh-pos-l50o-flat">
            <div class="watch-title"><span>🔆</span> LOCK50 Old Shadow — <span id="sh-l50o-status">Watching</span></div>
            <div id="sh-l50o-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Watching for next signal⏳</div>
            <div id="sh-l50o-watch" style="margin-top:10px"></div>
          </div>
          <!-- In-trade card (hidden when flat) -->
          <div class="pos-card pos-ce" id="sh-pos-l50o-card" style="display:none">
            <div class="pos-hdr">
              <span class="pos-live-dot"></span>
              <span class="pos-badge pos-b-ce" id="sh-l50o-card-badge">CE OPTION</span>
              <span class="pos-sym">BANKNIFTY</span>
              <span class="pos-mode">PAPER</span>
            </div>
            <div class="pos-pnl-rs g" id="sh-l50o-card-rs">—</div>
            <div class="pos-pnl-pts g" id="sh-l50o-card-pts">— unrealised</div>
            <div class="pos-grid">
              <div><div class="pos-lbl">Entry Index</div><div class="pos-val mono" id="sh-l50o-card-ep">—</div></div>
              <div><div class="pos-lbl">Live Index</div><div class="pos-val g mono" id="sh-l50o-card-lp">—</div></div>
              <div><div class="pos-lbl">Stop Loss</div><div class="pos-val r mono" id="sh-l50o-card-sl">—</div></div>
              <div><div class="pos-lbl">SL Risk ₹</div><div class="pos-val r" id="sh-l50o-card-slrs">—</div></div>
            </div>
          </div>
        </div>"""

NEW_L50O_POS = """        <div id="sh-pos-l50o-wrap">
          \${hb2.scalp1InTrade && (hb2.scalp1Entry||0) > 0 ? \`
          <!-- In-trade card -->
          <div class="pos-card pos-\${(hb2.scalp1Dir||'ce').toLowerCase()}" id="sh-pos-l50o-card">
            <div class="pos-hdr">
              <span class="pos-live-dot"></span>
              <span class="pos-badge pos-b-\${(hb2.scalp1Dir||'ce').toLowerCase()}" id="sh-l50o-card-badge">\${(hb2.scalp1Dir||'CE').toUpperCase()} OPTION</span>
              <span class="pos-sym">BANKNIFTY</span>
              <span class="pos-mode">PAPER</span>
            </div>
            <div class="pos-pnl-rs g" id="sh-l50o-card-rs">—</div>
            <div class="pos-pnl-pts g" id="sh-l50o-card-pts">— unrealised</div>
            <div class="pos-grid">
              <div><div class="pos-lbl">Entry Index</div><div class="pos-val mono" id="sh-l50o-card-ep">\${(hb2.scalp1Entry||0).toFixed(1)}</div></div>
              <div><div class="pos-lbl">Live Index</div><div class="pos-val g mono" id="sh-l50o-card-lp">\${live2>0?live2.toFixed(1):'—'}</div></div>
              <div><div class="pos-lbl">Stop Loss</div><div class="pos-val r mono" id="sh-l50o-card-sl">\${(hb2.scalp1SL||0)>0?(hb2.scalp1SL).toFixed(1):'—'}</div></div>
              <div><div class="pos-lbl">SL Risk ₹</div><div class="pos-val r" id="sh-l50o-card-slrs">—</div></div>
            </div>
          </div>
          <div class="sh-pos sh-pos-watch" id="sh-pos-l50o-flat" style="display:none">
            <div class="watch-title"><span>🔆</span> LOCK50 Old Shadow — <span id="sh-l50o-status">In Trade</span></div>
            <div id="sh-l50o-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)"></div>
            <div id="sh-l50o-watch" style="margin-top:10px"></div>
          </div>
          \` : \`
          <!-- Flat / watching card -->
          <div class="sh-pos sh-pos-watch" id="sh-pos-l50o-flat">
            <div class="watch-title"><span>🔆</span> LOCK50 Old Shadow — <span id="sh-l50o-status">Watching</span></div>
            <div id="sh-l50o-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Watching for next signal⏳</div>
            <div id="sh-l50o-watch" style="margin-top:10px"></div>
          </div>
          <div class="pos-card pos-ce" id="sh-pos-l50o-card" style="display:none">
            <div class="pos-hdr">
              <span class="pos-live-dot"></span>
              <span class="pos-badge pos-b-ce" id="sh-l50o-card-badge">CE OPTION</span>
              <span class="pos-sym">BANKNIFTY</span>
              <span class="pos-mode">PAPER</span>
            </div>
            <div class="pos-pnl-rs g" id="sh-l50o-card-rs">—</div>
            <div class="pos-pnl-pts g" id="sh-l50o-card-pts">— unrealised</div>
            <div class="pos-grid">
              <div><div class="pos-lbl">Entry Index</div><div class="pos-val mono" id="sh-l50o-card-ep">—</div></div>
              <div><div class="pos-lbl">Live Index</div><div class="pos-val g mono" id="sh-l50o-card-lp">—</div></div>
              <div><div class="pos-lbl">Stop Loss</div><div class="pos-val r mono" id="sh-l50o-card-sl">—</div></div>
              <div><div class="pos-lbl">SL Risk ₹</div><div class="pos-val r" id="sh-l50o-card-slrs">—</div></div>
            </div>
          </div>
          \`}
        </div>"""

if OLD_L50O_POS in content:
    content = content.replace(OLD_L50O_POS, NEW_L50O_POS, 1)
    print("Fix 3: LOCK50 Old shadow panel server-rendered")
    changes += 1
else:
    key2 = 'id="sh-pos-l50o-wrap"'
    if key2 in content:
        print(f"Fix 3: Found sh-pos-l50o-wrap but exact match failed - need unicode check")
    else:
        print("Fix 3 ERROR: sh-pos-l50o-wrap not found")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nTotal changes: {changes}")
