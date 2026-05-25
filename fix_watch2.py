with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    c = f.read()

# Find the noEl.innerHTML assignment and append the call after it
# Use line-based approach to avoid unicode issues
lines = c.split('\n')
patched = False
i = 0
while i < len(lines):
    ln = lines[i]
    # Find the noEl.innerHTML= assignment (the big one with watch-ce-row)
    if 'noEl.innerHTML=' in ln and 'watch-lvl-row' not in ln and 'watch-ce-row' not in ln:
        # This is a short single-line or starts multi-line
        pass
    if "noEl.innerHTML=" in ln and 'watch-ce-row' in lines[i] if i < len(lines) else False:
        pass
    # Find: lines[i] starts the noEl.innerHTML block with watch-ce-row
    if 'noEl.innerHTML=' in ln and i+2 < len(lines) and 'watch-ce-row' in lines[i+1]:
        # Found it - it's a multiline assignment: line i is `noEl.innerHTML=`, i+1 has ce-row, i+2 has pe-row, i+3 has lp conditional
        # Find the end of the assignment (line ending with ;)
        j = i
        while j < len(lines) and not lines[j].rstrip().endswith(';'):
            j += 1
        # j is the last line of assignment, insert _appendClosedTrades after it
        lines.insert(j+1, "          _appendClosedTrades(noEl,d);")
        print(f'OK: inserted _appendClosedTrades after line {j+1}')
        patched = True
        break
    i += 1

if not patched:
    # Try another approach: find noEl.innerHTML= line and the assignment end
    for i, ln in enumerate(lines):
        if 'noEl.innerHTML=' in ln and i+1 < len(lines) and 'watch-ce-row' in lines[i+1]:
            print(f'Found at line {i}: {repr(ln[:60])}')
            print(f'Next line: {repr(lines[i+1][:60])}')
            break
    else:
        print('Could not find the block')

# Also fix: after the else-if branch `noEl.innerHTML='<span...Waiting...'`
for i, ln in enumerate(lines):
    if 'Waiting for first 15-min candle' in ln and 'noEl.innerHTML=' in ln:
        lines.insert(i+1, "          _appendClosedTrades(noEl,d);")
        print(f'OK: inserted _appendClosedTrades after waiting-for-candle line {i+1}')
        break

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print('server.js saved')
