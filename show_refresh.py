with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

# Find _sig3Refresh function
idx = c.find(b'function _sig3Refresh(')
if idx == -1:
    idx = c.find(b'_sig3Refresh')
print("_sig3Refresh at:", idx)

# Show the full function (first 3000 bytes)
print(c[idx:idx+3000].decode('utf-8','replace'))
