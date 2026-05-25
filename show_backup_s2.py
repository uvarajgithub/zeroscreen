with open('/root/zeroscreen/dist/server.js.bak.may25-good','rb') as f:
    d = f.read()

# Find the Live Bot Dashboard area  
idx = d.find(b'Live Bot Dashboard')
print("Live Bot Dashboard at:", idx)
if idx != -1:
    print(d[idx:idx+3000].decode('utf-8','replace'))
