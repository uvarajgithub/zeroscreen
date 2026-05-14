#!/usr/bin/env python3
"""
Fix TRAIL and LOCK50 Old panels:
Remove backslashes from escaped \${...} and \` in the conditional blocks
so Node.js evaluates them as template expressions.
"""

path = '/root/zeroscreen/dist/server.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

orig_len = len(content)

# --- Fix TRAIL panel ---
# The block starts with \${hb2.shadowInTrade and ends with \`}
# We need to fix the outer ternary delimiters only (not inner ${} which are fine)

import re

# Fix 1: TRAIL ternary opener: \${hb2.shadowInTrade && (hb2.shadowEntry||0) > 0 ? \`
old1 = r'          \${hb2.shadowInTrade && (hb2.shadowEntry||0) > 0 ? \`'
new1 = r'          ${hb2.shadowInTrade && (hb2.shadowEntry||0) > 0 ? `'
if old1 in content:
    content = content.replace(old1, new1, 1)
    print("Fixed TRAIL ternary opener")
else:
    print("WARN: TRAIL opener not found, trying variant")
    # Try without the leading spaces
    old1b = r'\${hb2.shadowInTrade && (hb2.shadowEntry||0) > 0 ? \`'
    new1b = r'${hb2.shadowInTrade && (hb2.shadowEntry||0) > 0 ? `'
    if old1b in content:
        content = content.replace(old1b, new1b, 1)
        print("Fixed TRAIL ternary opener (variant)")
    else:
        print("ERROR: TRAIL opener not found at all")

# Fix 2: TRAIL ternary middle/closer: \` : \`  and  \`}
# There may be multiple of these so we need to be targeted
# Find the TRAIL block and fix within it
trail_start = content.find('id="sh-pos-trail-wrap"')
trail_end = content.find('id="sh-pos-trail-wrap"') 
# Find the end of the ternary: look for `}` after the trail block
# Find the second occurrence after sh-pos-trail-wrap
idx = content.find('id="sh-pos-trail-wrap"')
if idx != -1:
    # Find the ternary separator and closer within next 3000 chars
    segment = content[idx:idx+3000]
    
    # Fix \` : \`  (ternary separator)
    if r'\` : \`' in segment:
        # Replace first occurrence after trail_wrap
        old_sep = r'\` : \`'
        new_sep = r'` : `'
        pos = content.find(old_sep, idx)
        if pos != -1 and pos < idx + 3000:
            content = content[:pos] + new_sep + content[pos+len(old_sep):]
            print("Fixed TRAIL ternary separator")
    
    # Fix \`}  (ternary closer) - find after separator
    segment2 = content[idx:idx+3000]
    # \`} at end of ternary
    old_close = '          `}\n'
    # We need the escaped version
    old_close_esc = '          \\`}\n'
    pos2 = content.find(old_close_esc, idx)
    if pos2 != -1 and pos2 < idx + 3000:
        content = content[:pos2] + old_close + content[pos2+len(old_close_esc):]
        print("Fixed TRAIL ternary closer")
    else:
        print("WARN: TRAIL closer not found, trying bare")
        old_close2 = r'          \`}'
        pos3 = content.find(old_close2, idx)
        if pos3 != -1 and pos3 < idx + 3000:
            content = content[:pos3] + '          `}' + content[pos3+len(old_close2):]
            print("Fixed TRAIL ternary closer (variant)")

# --- Fix LOCK50 Old panel ---
idx2 = content.find('id="sh-pos-l50o-wrap"')
if idx2 != -1:
    # Fix opener
    old_l50o_open = r'\${hb2.scalp1InTrade && (hb2.scalp1Entry||0) > 0 ? \`'
    new_l50o_open = r'${hb2.scalp1InTrade && (hb2.scalp1Entry||0) > 0 ? `'
    pos_o = content.find(old_l50o_open, idx2)
    if pos_o != -1 and pos_o < idx2 + 3000:
        content = content[:pos_o] + new_l50o_open + content[pos_o+len(old_l50o_open):]
        print("Fixed L50O ternary opener")
    else:
        # Try without backslash (maybe already fixed)
        check = content.find('${hb2.scalp1InTrade && (hb2.scalp1Entry||0) > 0 ?', idx2)
        if check != -1 and check < idx2 + 3000:
            print("L50O opener already correct")
        else:
            print("ERROR: L50O opener not found")
    
    # Fix separator
    old_sep2 = r'\` : \`'
    pos_s = content.find(old_sep2, idx2)
    if pos_s != -1 and pos_s < idx2 + 3000:
        content = content[:pos_s] + '` : `' + content[pos_s+len(old_sep2):]
        print("Fixed L50O ternary separator")
    else:
        print("L50O separator already correct or not found")
    
    # Fix closer
    old_close_esc2 = '          \\`}\n'
    pos_c = content.find(old_close_esc2, idx2)
    if pos_c != -1 and pos_c < idx2 + 3000:
        content = content[:pos_c] + '          `}\n' + content[pos_c+len(old_close_esc2):]
        print("Fixed L50O ternary closer")
    else:
        old_close3 = r'          \`}'
        pos_c2 = content.find(old_close3, idx2)
        if pos_c2 != -1 and pos_c2 < idx2 + 3000:
            content = content[:pos_c2] + '          `}' + content[pos_c2+len(old_close3):]
            print("Fixed L50O ternary closer (variant)")
        else:
            print("L50O closer already correct or not found")

print(f"\nFile size: {orig_len} -> {len(content)}")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done.")
