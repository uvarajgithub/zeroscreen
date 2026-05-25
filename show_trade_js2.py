with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

idx = c.find(b"atl-trades');\n")
print(repr(c[idx+1900:idx+3000]))
