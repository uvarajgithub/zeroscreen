import shutil

# Restore template
shutil.copy('/root/zeroscreen/dist/server.js.template-live-dashboard', '/root/zeroscreen/dist/server.js')
with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()
print(f"Restored. Size: {len(c)}")

# Verify _dbRefresh exists
idx = c.find(b'async function _dbRefresh()')
print(f"_dbRefresh at: {idx}")
# Find the todayTrades handling
idx2 = c.find(b'if(d.todayTrades){', idx)
print(f"todayTrades block at: {idx2}")
# Find end of that block (closing })
block_end = c.find(b'\n      }', idx2 + 10) + len(b'\n      }')
print(f"Block end at: {block_end}")
print(repr(c[block_end:block_end+60]))
