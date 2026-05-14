src = open('/root/zeroscreen/dist/server.js', 'rb').read()
marker = b"sh-trail-today-count').textContent"
idx = src.find(marker)
line_end = src.find(b'\n', idx)
line = src[idx:line_end]
print('Last 50 bytes of line:', repr(line[-50:]))
# Count single quotes in the assignment part
assign = line[line.find(b'=')+1:]
sq = assign.count(b"'")
print(f"Single quotes in assignment: {sq} ({'even' if sq%2==0 else 'ODD - UNCLOSED'})")
