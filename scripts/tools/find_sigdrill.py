#!/usr/bin/env python3
f = '/root/zeroscreen/dist/server.js'
data = open(f, 'rb').read()

# Find _sigDrill function definition
idx = data.find(b'function _sigDrill(')
if idx >= 0:
    print('Found at', idx)
    print(repr(data[idx:idx+600]))
else:
    # try arrow function style
    idx = data.find(b'_sigDrill=function(')
    if idx >= 0:
        print('Arrow at', idx)
        print(repr(data[idx:idx+600]))
    else:
        # find all occurrences
        import re
        for m in re.finditer(rb'_sigDrill\s*[=\(]', data):
            print('At', m.start(), repr(data[m.start():m.start()+80]))
