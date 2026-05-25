with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Find the strategy cards section
idx = c.find(b'AMINA 100')
print(f"AMINA 100 at: {idx}")
# Show 200 before to 800 after
print(c[max(0,idx-200):idx+800].decode('utf-8','replace'))
