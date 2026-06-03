#!/usr/bin/env python3
# Recovery script: remove section 1 (wrong position inside bot-monthly IIFE)
# Keep section 2 (correct position, after bot-monthly IIFE closes)

import os

f = '/root/zeroscreen/dist/server.js'
raw = open(f, 'rb').read()
print('size before:', len(raw))

# Section 1 was inserted INSIDE the bot-monthly IIFE (after return statement but before IIFE close)
# It starts with '\n              ${isAdmin ? (() => {' (14 spaces - wrong indentation)
# It ends just before the original 0-space bot-monthly IIFE close: '})() : ""}'
# Then section 2 (correct, 6-space) follows: '      ${isAdmin ? (() => {'

REMOVE_FROM = b'\n              ${isAdmin ? (() => {'
KEEP_FROM   = b'})() : ""}\n      ${isAdmin ? (() => {'

i1 = raw.find(REMOVE_FROM)
i2 = raw.find(KEEP_FROM)

print('bad section 1 start offset:', i1)
print('original IIFE close + section 2 start offset:', i2)

if i1 < 0:
    print('ERROR: REMOVE_FROM pattern not found')
    raise SystemExit(1)
if i2 < 0:
    print('ERROR: KEEP_FROM pattern not found')
    raise SystemExit(1)
if i2 < i1:
    print('ERROR: KEEP_FROM found before REMOVE_FROM - wrong order')
    raise SystemExit(1)

# Stitch: everything up to i1, then newline, then from i2 (the original IIFE close + section2)
new_raw = raw[:i1] + b'\n' + raw[i2:]

print('size after:', len(new_raw))

tmp = f + '.fix_tmp'
open(tmp, 'wb').write(new_raw)
os.rename(tmp, f)
print('DONE - section 1 removed, section 2 preserved in correct position')
