#!/usr/bin/env python3
# fix_quotes.py — fix bare ₹ in JS expression context (missing single quotes)
path = '/root/zeroscreen/dist/server.js'
INR   = b'\xe2\x82\xb9'
MINUS = b'\xe2\x88\x92'

with open(path,'rb') as f:
    data = f.read()

# Fix 1: pos-lock50-rs IIFE — :−') and ₹ both unquoted
old1 = b"return (_r>=0?'+':"+MINUS+b"')+" + INR + b"+Math.abs(_r)"
new1 = b"return (_r>=0?'+':'" + MINUS + b"')+'" + INR + b"'+Math.abs(_r)"

# Fix 2: JS live update — ₹ unquoted after '−')+ 
old2 = b"premRsLive>=0?'+':'" + MINUS + b"')+" + INR + b"+Math.abs(premRsLive)"
new2 = b"premRsLive>=0?'+':'" + MINUS + b"')+'" + INR + b"'+Math.abs(premRsLive)"

for name,old,new in [('fix1-pos-rs',old1,new1),('fix2-js-live',old2,new2)]:
    c = data.count(old)
    print(f'{name}: {c} match(es)')
    if c != 1:
        print('ERROR')
        exit(1)
    data = data.replace(old, new, 1)

with open(path,'wb') as f:
    f.write(data)
print('FIXED OK')
