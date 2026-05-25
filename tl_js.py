with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Find the JS that updates atl-dot states
idx = c.find(b'atl-dot-0')
# Find the function that controls dot states
fn_start = c.rfind(b'function', 0, idx)
print(c[fn_start:fn_start+2000].decode('utf-8','replace'))
