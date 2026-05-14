import re

lines = open('/root/zeroscreen/dist/server.js').readlines()
depth = 0
for i, line in enumerate(lines[10150:10243], start=10151):
    opens = len(re.findall(r'<div[\s>]', line))
    closes = len(re.findall(r'</div>', line))
    depth += opens - closes
    if abs(opens-closes) > 0 or depth <= 2:
        print(f'L{i} d={depth} o={opens} c={closes}: {line.rstrip()[:110]}')
