with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Find _dbRefresh function and what it fetches
idx = c.find(b'_dbRefresh')
while idx != -1:
    ctx = c[idx:idx+300]
    if b'fetch' in ctx:
        print(f'at {idx}:')
        print(repr(ctx[:250]))
        print()
    idx = c.find(b'_dbRefresh', idx+1)
