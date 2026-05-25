with open('/root/zeroscreen/dist/server.js.bak.may25-good','rb') as f:
    d = f.read()

idx = d.find(b'Live Bot Dashboard')
# Show header + health bar + more (first 5000 bytes of the page)
print("=== BACKUP: Header + Section 1 + Section 2 ===")
print(d[idx+50:idx+5000].decode('utf-8','replace'))
