with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Find JS that updates timeline (look for atl-phase or _updateTimeline)
for marker in [b'_updateTimeline', b'atl-phase', b'atl-dot', b'pm-tl-dot']:
    idx = c.rfind(marker)  # last occurrence (JS not HTML)
    if idx != -1:
        chunk = c[max(0,idx-100):idx+500]
        if b'function' in chunk or b'className' in chunk or b'textContent' in chunk:
            print(f"=== {marker} JS at {idx} ===")
            print(chunk.decode('utf-8','replace'))
            print()
            break
