f = '/home/ubuntu/trading-bot/dist/src/vmt-shadow.js'
c = open(f).read()
idx = c.find('const BASE')
print(repr(c[idx:idx+60]))

# Fix: replace whatever is there with correct path (../.. = trading-bot root)
import re
c2 = re.sub(r"const BASE\s*=\s*path\.join\(__dirname[^;]*\);",
            "const BASE = path.join(__dirname, '../..');",
            c, count=1)
if c2 == c:
    print('NO CHANGE - pattern not matched')
else:
    open(f, 'w').write(c2)
    idx2 = c2.find('const BASE')
    print('FIXED:', repr(c2[idx2:idx2+60]))
