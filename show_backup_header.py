with open('/root/zeroscreen/dist/server.js.bak.may25-good','rb') as f:
    d = f.read()

# Find the header HTML
idx = d.find(b'db-hdr')
# Find the HTML instance (not CSS)
while idx != -1:
    chunk = d[idx:idx+10]
    if b'<div' in d[max(0,idx-5):idx+5]:
        break
    idx = d.find(b'db-hdr', idx+1)

# Find actual HTML div
idx2 = d.find(b'<div class="db-hdr">')
print(f"Header HTML at: {idx2}")
if idx2 != -1:
    print(d[idx2:idx2+1000].decode('utf-8','replace'))

# Also find the health bar HTML
idx3 = d.find(b'<div class="hb"')
print(f"\nHealth bar at: {idx3}")
if idx3 != -1:
    print(d[idx3:idx3+1000].decode('utf-8','replace'))
