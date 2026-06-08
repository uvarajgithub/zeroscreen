raw=open('/root/zeroscreen/dist/server.js','rb').read()
# Find res.send in the signals route and see where the backtick closes
send_idx = 611705
# Find the next res.send or closing ) after this
# Count backticks from send_idx to find the template end
chunk = raw[send_idx:send_idx+200000]
# Find first backtick (opens template)
bt1 = chunk.find(b'`')
# Now find the matching closing backtick (not inside ${})
depth = 0
pos = bt1 + 1
while pos < len(chunk):
    ch = chunk[pos:pos+1]
    if ch == b'$' and chunk[pos+1:pos+2] == b'{':
        depth += 1
        pos += 2
        continue
    if depth > 0:
        if ch == b'{': depth += 1
        elif ch == b'}': depth -= 1
        pos += 1
        continue
    if ch == b'`':
        print(f'Template closes at offset {pos} from res.send')
        print(f'Total template size: {pos-bt1} bytes')
        print(f'Absolute end position: {send_idx+pos}')
        break
    pos += 1
