with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

print("File size:", len(c))

# Show the hm-grid HTML
idx = c.find(b'sig3-hm-grid')
print("\nsig3-hm-grid at:", idx)
if idx != -1:
    # show from 50 before to 1500 after
    print(repr(c[idx-60:idx+800]))

# Show hm CSS start
idx2 = c.find(b'sig3-hm-grid{')
print("\nsig3-hm-grid CSS at:", idx2)
if idx2 != -1:
    print(repr(c[idx2-20:idx2+50]))

# Show hm JS
idx3 = c.find(b'// Health Monitor update')
print("\nhm JS comment at:", idx3)
if idx3 != -1:
    print(repr(c[idx3:idx3+100]))
