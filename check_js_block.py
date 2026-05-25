data = open('/root/zeroscreen/dist/server.js', 'rb').read()
# Find the todayTrades JS block
idx = data.find(b"if(d.todayTrades){")
if idx >= 0:
    end = data.find(b'\n      }', idx)
    print(repr(data[idx:end+8]))
