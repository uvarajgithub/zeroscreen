with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Find exact current db-sub line
idx = c.find(b'class="db-sub">')
print(f"db-sub at: {idx}")
print(repr(c[idx:idx+300]))
