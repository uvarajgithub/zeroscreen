with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

idx = c.find(b"Today's Session Timeline")
print(f"at: {idx}")
end = c.find(b'CURRENT POSITION', idx)
print(c[max(0,idx-200):end].decode('utf-8','replace'))
