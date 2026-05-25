#!/usr/bin/env python3
# fix_quotes3.py — correct the ternary operator broken by fix_quotes2
path = '/root/zeroscreen/dist/server.js'
INR   = b'\xe2\x82\xb9'

with open(path,'rb') as f:
    data = f.read()

# Revert the bad +(' back to ?(' (ternary was accidentally changed to +)
old = b"(_ep>0&&_lp>0)+('"+INR+b"'+_ep.toFixed(0)"
new = b"(_ep>0&&_lp>0)?('"+INR+b"'+_ep.toFixed(0)"

c = data.count(old)
print(f'ternary-fix: {c} match(es)')
if c != 1:
    print('ERROR')
    exit(1)
data = data.replace(old, new, 1)

with open(path,'wb') as f:
    f.write(data)
print('FIXED OK')
