#!/usr/bin/env python3
# Surgical fix: remove section B (12-space, single-quoted) that's stuck inside section A after its return
# Keep section A (6-space, double-quoted, fcards/frows) intact

import os

f = '/root/zeroscreen/dist/server.js'
raw = open(f, 'rb').read()
print('size before:', len(raw))

# Section B starts AFTER section A's return statement (after the `; at end of return line)
# Section A return ends with: </table></div>`;  then newline then 12-space ${isAdmin
# Section B close is: \n      })() : ""}\n  (6-space, the ONLY 6-space close in this area)

# Find start of section B: the `;` at end of section A's return + newline + 12-space ${isAdmin
B_START = b'`;\n            ${isAdmin ? (() => {'
# Find end of section B: the 6-space close + newline (right before the 0-space section A close)
B_END   = b'      })() : ""}\n'

i_start = raw.find(B_START)
print('section B start at:', i_start)
if i_start < 0:
    print('ERROR: B_START not found')
    raise SystemExit(1)

# Find B_END AFTER i_start
i_end = raw.find(B_END, i_start)
print('section B end at:', i_end)
if i_end < 0:
    print('ERROR: B_END not found after B_START')
    raise SystemExit(1)

# Verify next bytes after B_END are the 0-space section A close
after = raw[i_end + len(B_END):i_end + len(B_END) + 30]
print('bytes after B_END:', repr(after))
if b'})() : ""}' not in after[:15]:
    print('WARNING: unexpected content after B_END, proceeding anyway')

# Remove section B: keep ` and ; (the ending backtick-semicolon of section A's return)
# i_start points to the backtick that's the last char of section A return's template literal
# We keep everything up to and including i_start+1 (the `;`)
# Then skip to i_end + len(B_END) (past section B close)

new_raw = raw[:i_start + 2] + b'\n' + raw[i_end + len(B_END):]
print('size after:', len(new_raw))

# Verify the patch area looks right
check_start = i_start - 20
check_end = i_start + 2 + 1 + 30
# In new_raw, the bytes around the fix
print('context around fix:')
print(repr(new_raw[check_start:check_start + 80]))

tmp = f + '.fix2_tmp'
open(tmp, 'wb').write(new_raw)
os.rename(tmp, f)
print('DONE')
