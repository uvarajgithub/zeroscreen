#!/usr/bin/env python3
# Remove the duplicate 'const dir' that causes SyntaxError in _dbRefresh
FILE = '/root/zeroscreen/dist/server.js'
with open(FILE, 'r', encoding='utf-8') as f:
    src = f.read()

# The bad line inserted by fix_tabs_pnl_live.py:
# adds "const dir=hb.direction||'';" right after _rawUnr, but dir is already declared above
BAD  = "const _rawUnr=parseFloat(hb.unrealisedPnL||0);const dir=hb.direction||'';const unr=(_rawUnr===0&&inT&&lp>0&&ep>0)?(dir===\"CE\"?lp-ep:ep-lp):_rawUnr;"
GOOD = "const _rawUnr=parseFloat(hb.unrealisedPnL||0);const unr=(_rawUnr===0&&inT&&lp>0&&ep>0)?(dir===\"CE\"?lp-ep:ep-lp):_rawUnr;"

if BAD in src:
    src = src.replace(BAD, GOOD, 1)
    print("FIXED: removed duplicate const dir")
else:
    print("NOT FOUND — checking what's there:")
    idx = src.find('_rawUnr=parseFloat(hb.unrealisedPnL')
    if idx >= 0:
        print(repr(src[idx:idx+200]))

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(src)
