raw=open('/root/zeroscreen/dist/server.js','rb').read()
idx = raw.find(b'<!-- MONTHLY P&L -->')
print(repr(raw[idx+1000:idx+1200]))
