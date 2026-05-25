with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    c = f.read()
idx = c.find('watch-lvl-row watch-ce-row')
print(repr(c[idx-50:idx+250]))
