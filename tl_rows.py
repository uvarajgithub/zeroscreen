with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Find full timeline HTML rows
tl_start = c.find(b'<div class="pm-tl" id="atl-tl">')
tl_end = c.find(b'</div>\n</div>\n', tl_start)
tl_end2 = c.find(b'\n      </div>\n\n      <!-- RIGHT', tl_start)
print(f"tl_start:{tl_start} tl_end:{tl_end2}")
print(c[tl_start:tl_end2+30].decode('utf-8','replace'))
