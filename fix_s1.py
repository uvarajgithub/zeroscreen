path = '/root/zeroscreen/src/server.ts'
with open(path, encoding='utf-8') as f:
    c = f.read()
old = 'BANKNIFTY &middot; HYBRID_REVERSE &middot; <strong>${mode2.toUpperCase()}</strong>'
new = 'BANKNIFTY &middot; BHAV V3 &middot; <strong>${mode2.toUpperCase()}</strong>'
if old in c:
    c = c.replace(old, new, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(c)
    print('OK')
else:
    print('NOT FOUND')
