import re
lines = open('/root/zeroscreen/dist/server.js').readlines()
for i, l in enumerate(lines[9199:9449], start=9200):
    if re.search(r'(?<![_a-zA-Z])hb(?![_\-a-zA-Z0-9])', l):
        print(f'{i}: {l.rstrip()[:120]}')
