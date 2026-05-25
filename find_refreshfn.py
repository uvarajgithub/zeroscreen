with open('/root/zeroscreen/dist/server.js','rb') as f:
    c = f.read()

# Find the JS section that polls /api/bot/status
idx = c.find(b'/api/bot/status')
while idx != -1:
    chunk = c[max(0,idx-300):idx+100]
    if b'fetch' in chunk or b'function' in chunk:
        print(f"=== at {idx} ===")
        print(chunk.decode('utf-8','replace'))
        break
    idx = c.find(b'/api/bot/status', idx+1)

# Also find hb-age-txt update
idx2 = c.find(b'hb-age-txt')
print(f"\n=== hb-age-txt at {idx2} ===")
print(c[max(0,idx2-100):idx2+300].decode('utf-8','replace'))
