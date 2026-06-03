#!/usr/bin/env python3
f = '/root/zeroscreen/dist/server.js'
data = open(f, 'rb').read()

# The _thYr function is inside the IIFE but buttons call it as global onclick
# Fix: make it window._thYr
old = b'function _thYr(btn,yr){'
new = b'window._thYr=function _thYr(btn,yr){'

if old in data:
    data = data.replace(old, new, 1)
    open(f, 'wb').write(data)
    print('FIXED, size:', len(data))
else:
    print('NOT FOUND')
    idx = data.find(b'_thYr')
    print(repr(data[idx:idx+100]))
