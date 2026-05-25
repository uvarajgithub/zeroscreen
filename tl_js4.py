with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Find _ATLPH and _atlUpd function
idx = c.find(b'_ATLPH')
print(c[max(0,idx-200):idx+2000].decode('utf-8','replace'))
