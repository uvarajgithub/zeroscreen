raw=open('/root/zeroscreen/dist/server.js','rb').read()
# Find the MONTHLY P&L section and get full context
idx = raw.find(b'<!-- MONTHLY P&L -->')
print('--- MONTHLY SECTION ---')
print(repr(raw[idx:idx+300]))
print()
# Also find what comes after the monthly table
end = raw.find(b'</table>', idx)
print('--- AFTER TABLE ---')
print(repr(raw[end:end+300]))
