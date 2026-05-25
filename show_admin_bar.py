with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

# Find admin page status bar - the compact pill style (Bot Online, Token Valid, Heartbeat)
idx = c.find(b'Bot &bull; Online')
if idx == -1:
    idx = c.find(b'Bot \xe2\x80\xa2 Online')
if idx == -1:
    idx = c.find(b'hm-status-bar')
if idx == -1:
    # search for the heartbeat pill
    idx = c.find(b'Heartbeat')
    
print("Found at:", idx)
if idx != -1:
    print(c[max(0,idx-300):idx+1000].decode('utf-8','replace'))
