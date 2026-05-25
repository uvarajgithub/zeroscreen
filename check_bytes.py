#!/usr/bin/env python3
# Check exact bytes around '100 pts' in index.js
f = open('/home/ubuntu/trading-bot/dist/src/index.js', 'rb').read()
idx = f.find(b'100 pts)')
while idx >= 0:
    snippet = f[max(0,idx-6):idx+12]
    print(f'pos {idx}: hex={snippet.hex()} repr={repr(snippet)}')
    idx = f.find(b'100 pts)', idx+1)

# Also check for just '100 pts' without closing paren
idx2 = f.find(b'100 pts')
while idx2 >= 0:
    snippet2 = f[max(0,idx2-6):idx2+10]
    print(f'bare pos {idx2}: hex={snippet2.hex()} repr={repr(snippet2)}')
    idx2 = f.find(b'100 pts', idx2+1)
    if idx2 > 200000:
        break
