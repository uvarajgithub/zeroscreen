with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

idx = c.find(b'Session Timeline')
end = c.find(b'CURRENT POSITION', idx)
# Show full timeline
print(c[max(0,idx-200):end].decode('utf-8','replace'))
