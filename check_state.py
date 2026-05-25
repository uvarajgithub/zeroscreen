with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

print("File size:", len(c))

# Check subtitle state
idx = c.find(b'BHAV V3')
print("BHAV V3 at:", idx)
if idx != -1:
    print(repr(c[idx:idx+400]))

# Check sig3-dot CSS context
idx2 = c.find(b'sig3-dot{')
print("\nsig3-dot CSS at:", idx2)
if idx2 != -1:
    print(repr(c[idx2-10:idx2+150]))

# Check health monitor grid
idx3 = c.find(b's3hm-bot')
print("\ns3hm-bot at:", idx3)
