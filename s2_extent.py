with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    cur = f.read()

# Find Section 2 start
s2_start = cur.find(b'<div class="gv-status" id="sig3-bot-status"')
print(f"S2 start: {s2_start}")

# Find the end of this div (next major comment)
s2_end_marker = cur.find(b'\n    <!-- ', s2_start + 10)
print(f"S2 end: {s2_end_marker}")
print(repr(cur[s2_end_marker:s2_end_marker+80]))

# Show full Section 2 block
print("\n=== Full Section 2 to replace ===")
print(cur[s2_start:s2_end_marker].decode('utf-8','replace'))
