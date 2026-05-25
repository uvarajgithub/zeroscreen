data = open('/root/zeroscreen/dist/server.js', 'rb').read()
idx = data.find(b"reason=t.reasonExit||'")
if idx >= 0:
    print(repr(data[idx:idx+30]))
idx2 = data.find(b"t.direction||'")
if idx2 >= 0:
    print(repr(data[idx2:idx2+25]))
