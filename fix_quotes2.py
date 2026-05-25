#!/usr/bin/env python3
# fix_quotes2.py — fix bare ₹ at start of pos-lock50-pts expression
path = '/root/zeroscreen/dist/server.js'
INR   = b'\xe2\x82\xb9'

with open(path,'rb') as f:
    data = f.read()

# Fix 3: pos-lock50-pts IIFE — opening ₹ not quoted: (_ep>0&&_lp>0)?(₹'  →  ('₹'
old3 = b"(_ep>0&&_lp>0)?(" + INR + b"'+_ep.toFixed(0)"
new3 = b"(_ep>0&&_lp>0)+('" + INR + b"'+_ep.toFixed(0)"

# Actually test if that's the exact pattern first
c = data.count(old3)
if c == 1:
    data = data.replace(old3, new3, 1)
    print(f'fix3: replaced OK')
else:
    # try alternate — maybe it's ?( without the &&
    old3b = b")>0)?("+INR+b"'+"
    new3b = b")>0)?('"+INR+b"'+"
    c2 = data.count(old3b)
    print(f'fix3b: {c2} match(es)')
    if c2 == 1:
        data = data.replace(old3b, new3b, 1)
        print('fix3b: replaced OK')
    else:
        # Scan all occurrences of INR to see context
        idx = 0
        while True:
            idx = data.find(INR, idx)
            if idx == -1: break
            print(f'INR at {idx}: ...{repr(data[idx-20:idx+20])}...')
            idx += 1
        exit(1)

with open(path,'wb') as f:
    f.write(data)
print('FIXED OK')
