d = open('/root/zeroscreen/dist/server.js').read()
idx = d.find('window._futDly')
chunk = d[idx:idx+200000]
print('2026-05 in _futDly block:', '"2026-05"' in chunk)
print('2026-04 in _futDly block:', '"2026-04"' in chunk)
print('first 200 chars of _futDly:', chunk[:200])
