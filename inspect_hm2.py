with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

# Show more of hm CSS to find its end
idx2 = c.find(b'.sig3-hm-grid{')
print("CSS block (300 bytes from sig3-hm-grid{):")
print(repr(c[idx2:idx2+300]))

print("\n\n--- CSS block end area ---")
# Find sig3-hm-alert-btn (last CSS class) 
idx_end = c.find(b'sig3-hm-alert-btn')
print(repr(c[idx_end:idx_end+200]))

print("\n\n--- HTML grid block ---")
# Find the HTML grid
idx_html = c.find(b'<div class="sig3-hm-grid">')
print("HTML grid at:", idx_html)
if idx_html != -1:
    print(repr(c[idx_html-40:idx_html+1500]))
