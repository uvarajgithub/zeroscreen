with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    cur = f.read()

# Find Live Bot Dashboard in current JS and show body
idx = cur.find(b'</head>', cur.find(b'Live Bot Dashboard'))
print(f"</head> at: {idx}")
print(cur[idx:idx+3000].decode('utf-8','replace'))
