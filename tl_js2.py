with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Find the JS that marks timeline dots as done/active
idx = c.find(b"atl-dot-0')") 
if idx == -1:
    idx = c.find(b'"atl-dot-0"')
print(f"atl-dot-0 JS at: {idx}")
print(c[max(0,idx-500):idx+1500].decode('utf-8','replace'))
