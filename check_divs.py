#!/usr/bin/env python3
lines = open('/root/zeroscreen/dist/server.js').readlines()
depth = 0
start = 10947  # 0-indexed = line 10948
end = 11062
for i, l in enumerate(lines[start:end], start + 1):
    opens = l.count('<div') - l.count('</div>')
    if opens != 0:
        depth += opens
        print(f'L{i} depth={depth:+d}  {l.rstrip()[:90]}')
print(f'Final depth: {depth}')
