c = open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8').read()
old = '<span class="stab-sub">LIVE strategy</span>'
new = '<span class="stab-sub">LIVE v2.0</span>'
if old in c:
    open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8').write(c.replace(old, new, 1))
    print('PATCHED')
else:
    print('NOT FOUND')
