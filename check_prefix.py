raw=open('/root/zeroscreen/dist/server.js','rb').read()
# Find the leftover "${!" right before the first static row
idx = raw.find(b'${!<tr>')
print('found at:', idx)
if idx >= 0:
    print(repr(raw[idx-5:idx+30]))
