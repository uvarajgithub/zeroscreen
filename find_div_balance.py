import re

lines = open('/root/zeroscreen/dist/server.js').readlines()
depth = 0
extras = []
for i, line in enumerate(lines[10150:10337], start=10151):
    opens = len(re.findall(r'<div[\s>]', line))
    closes = len(re.findall(r'</div>', line))
    depth += opens - closes
    if depth < 0:
        extras.append((i, depth, line.rstrip()))
        depth = 0

print('Extra closes found:', len(extras))
for e in extras:
    print(f'  Line {e[0]} depth={e[1]}: {e[2][:120]}')
print('Final depth (should be 1 for panel-lock50 itself):', depth)
