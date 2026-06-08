raw=open('/root/zeroscreen/dist/server.js','rb').read()
idx = raw.find(b'<!-- MONTHLY P&L -->')
print('MONTHLY P&L at:', idx)
print(repr(raw[idx:idx+600]))
