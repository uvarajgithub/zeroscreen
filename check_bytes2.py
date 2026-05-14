src = open('/root/zeroscreen/dist/server.js', 'rb').read()
# Find the today-count line
idx = src.find(b'sh-trail-today-count'))
line_end = src.find(b'\n', idx)
line = src[idx:line_end]
print('TRAIL today-count line hex:')
print(repr(line[-30:]))
# Check if it has unclosed string
js_part = line[line.rfind(b"textContent"):]
print('JS part:', repr(js_part))
