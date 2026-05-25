with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

# Find admin page health monitor section
idx = c.find(b'hm-grid')
print("hm-grid at:", idx)
if idx != -1:
    # show surrounding context
    print(c[max(0,idx-200):idx+2000].decode('utf-8','replace'))
