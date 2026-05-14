#!/usr/bin/env python3
"""
Add standalone watch widget divs before Stats sections in TRAIL and LOCK50 Old panels.
Update JS to populate them always (even when in trade).
"""
path = '/root/zeroscreen/dist/server.js'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# ─── 1. Find both <!-- Stats --> comment lines (after the shadow wrap divs) ───
trail_stats_line = None
l50o_stats_line = None

in_trail = False
in_l50o = False

for i, l in enumerate(lines):
    if 'sh-pos-trail-wrap' in l:
        in_trail = True
    if 'sh-pos-l50o-wrap' in l:
        in_l50o = True
    if in_trail and not trail_stats_line and '<!-- Stats -->' in l:
        trail_stats_line = i
        in_trail = False
    if in_l50o and not l50o_stats_line and '<!-- Stats -->' in l:
        l50o_stats_line = i
        in_l50o = False

print(f"TRAIL stats at line {trail_stats_line+1 if trail_stats_line else 'NOT FOUND'}")
print(f"L50O stats at line {l50o_stats_line+1 if l50o_stats_line else 'NOT FOUND'}")

insert_line = '        <div id="__ID__" class="watch-card" style="margin-top:8px;display:none"></div>\n'

if trail_stats_line:
    lines.insert(trail_stats_line, insert_line.replace('__ID__', 'sh-trail-signal'))
    print("Inserted sh-trail-signal div")
    # l50o line shifted by 1
    if l50o_stats_line:
        l50o_stats_line += 1

if l50o_stats_line:
    lines.insert(l50o_stats_line, insert_line.replace('__ID__', 'sh-l50o-signal'))
    print("Inserted sh-l50o-signal div")

content = ''.join(lines)

# ─── 2. Update JS: TRAIL watch widget ───
OLD_T = "var shWE=ge('sh-trail-watch');if(shWE){if(!shInT&&hb.lastCandle&&lp>0){"
NEW_T = "var shWE=ge('sh-trail-signal');if(shWE){shWE.style.display='';if(hb.lastCandle&&lp>0){"
if OLD_T in content:
    content = content.replace(OLD_T, NEW_T, 1)
    print("Fixed TRAIL JS")
else:
    print("WARN: TRAIL JS not found")
    if "sh-trail-signal" in content:
        print("sh-trail-signal already in JS")

# ─── 3. Update JS: LOCK50 watch widget ───
OLD_L = "var s1WE=ge('sh-l50o-watch');if(s1WE){if(!s1InT&&hb.lastCandle&&lp>0){"
NEW_L = "var s1WE=ge('sh-l50o-signal');if(s1WE){s1WE.style.display='';if(hb.lastCandle&&lp>0){"
if OLD_L in content:
    content = content.replace(OLD_L, NEW_L, 1)
    print("Fixed LOCK50 JS")
else:
    print("WARN: LOCK50 JS not found")
    if "sh-l50o-signal" in content:
        print("sh-l50o-signal already in JS")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done.")

# Also add _sTab('lock50') call on init to properly initialize panel visibility
OLD_INIT = "  setInterval(_dbRefresh,3000);\n  _dbRefresh();"
NEW_INIT = "  setInterval(_dbRefresh,3000);\n  _dbRefresh();\n  _sTab('lock50'); // ensure correct initial tab state"
if OLD_INIT in content:
    content = content.replace(OLD_INIT, NEW_INIT, 1)
    print("Added _sTab init call")
