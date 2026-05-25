with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Show full trade injection JS block
idx = c.find(b"atl-trades');\n")
print(f"JS block at: {idx}")
print(repr(c[idx:idx+1500]))
