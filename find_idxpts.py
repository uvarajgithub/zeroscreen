#!/usr/bin/env python3
"""Fix Index P&L label: sl_reverse shows '~SL' note, early_exit shows '~c1' note, others show 'idx pts'."""

with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    s = f.read()

# Fix the Index P&L column in the trade table to show proper note
# Find the idx pts rendering in the daily trade table (the closedToday2 table rows)
OLD = (
    "var idxPts = (t.pnl??0);\n"
    "                  var idxPts_disp = (idxPts >= 0 ? '+' : '') + idxPts.toFixed(0) + ' pts';"
)

if OLD not in s:
    # Try alternate — find the indexPL cell rendering
    import re
    # Find and show the surrounding context of where idx pts is rendered in trade table
    idx = s.find('idx pts')
    if idx >= 0:
        print('Found idx pts at:', idx)
        print(s[idx-200:idx+200])
    else:
        print('Not found')
else:
    print('Found old pattern')

# Search for where Index P&L column value is built in the trade table
idx = s.find('idx pts')
print('idx pts occurrences:')
start = 0
count = 0
while True:
    pos = s.find('idx pts', start)
    if pos < 0:
        break
    print(f'  pos {pos}:', repr(s[pos-100:pos+50]))
    start = pos + 1
    count += 1
    if count > 5:
        break
