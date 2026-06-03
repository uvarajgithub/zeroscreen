#!/usr/bin/env python3
f = '/root/zeroscreen/dist/server.js'
data = open(f, 'rb').read()
idx = data.find(b'function _sigDrill(')
print(repr(data[idx:idx+1000]))
