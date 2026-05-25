with open('/root/zeroscreen/src/server.ts','rb') as f:
    cur = f.read()

# Find the stop button (end of bot-ctl-menu) and show what follows
idx = cur.find(b'&#9632; Stop</div>')
print("Stop button at:", idx)
if idx != -1:
    print(cur[idx:idx+600].decode('utf-8','replace'))
