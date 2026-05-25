with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Find _dbRefresh and show its trade/timeline update section
idx = c.find(b'async function _dbRefresh()')
end = c.find(b'async function _vmtRefresh', idx)
block = c[idx:end].decode('utf-8','replace')

# Look for timeline-related code inside _dbRefresh
lines = block.split('\n')
for i,ln in enumerate(lines):
    if any(x in ln for x in ['atl','timeline','tl-row','todayTrades','trade','entry','exit','pnl']):
        print(f"{i}: {ln[:120]}")
