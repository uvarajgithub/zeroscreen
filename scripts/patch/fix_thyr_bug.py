#!/usr/bin/env python3
f = '/root/zeroscreen/dist/server.js'
data = open(f, 'rb').read()

# Fix the ' none' bug (space before none breaks CSS display)
old = b"r.style.display=(yr==='all'||r.dataset.year===yr)?'':' none';"
new = b"r.style.display=(yr==='all'||r.dataset.year===yr)?'':'none';"

if old in data:
    data = data.replace(old, new, 1)
    open(f, 'wb').write(data)
    print('FIXED, size:', len(data))
else:
    print('NOT FOUND, checking...')
    idx = data.find(b'_thYr')
    if idx >= 0:
        print(repr(data[idx:idx+300]))
