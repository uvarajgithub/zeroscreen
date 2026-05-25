with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Show the full trade injection JS block to see current code
idx = c.find(b"atl-trades');\n")
print(repr(c[idx:idx+2000]))
