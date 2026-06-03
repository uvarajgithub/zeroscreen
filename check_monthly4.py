raw=open('/root/zeroscreen/dist/server.js','rb').read()
idx=raw.find(b'an2.monthly.length')
print(repr(raw[idx-20:idx+100]))
