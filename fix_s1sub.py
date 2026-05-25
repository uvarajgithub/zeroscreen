with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

idx = c.find(b'BODY_BREAKOUT')
if idx != -1:
    print("Found BODY_BREAKOUT:")
    print(repr(c[idx-60:idx+120]))
else:
    # Already patched?
    idx2 = c.find(b'BHAV V3')
    print(f"BHAV V3 at: {idx2}")
    idx3 = c.find(b'class="db-sub"')
    print(repr(c[idx3:idx3+200]))
