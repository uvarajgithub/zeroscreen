import re
lines = open('/root/zeroscreen/dist/server.js').readlines()
pat = re.compile(r'(?<![_a-zA-Z0-9])hb(?![_a-zA-Z0-9\-])')
for i, l in enumerate(lines[8740:9270], start=8741):
    m = pat.search(l)
    if m:
        before = l[:m.start()]
        if '.hb' not in before[-3:] and 'hb-' not in l[m.start():m.start()+5]:
            print(f'{i}: {l.rstrip()[:120]}')
