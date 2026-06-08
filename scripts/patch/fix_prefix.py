import os
f='/root/zeroscreen/dist/server.js'
raw=open(f,'rb').read()
# Remove the leftover "${!" prefix before the static rows
before = b'\n            ${!<tr><td style="font-weight:600">'
after  = b'\n            <tr><td style="font-weight:600">'
count = raw.count(before)
print('found:', count)
raw = raw.replace(before, after, 1)
tmp = f + '.fix_prefix_tmp'
open(tmp,'wb').write(raw)
os.rename(tmp, f)
print('DONE, size:', os.path.getsize(f))
