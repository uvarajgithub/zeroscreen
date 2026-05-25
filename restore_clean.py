import shutil

# Restore the good backup — it already has hb-pill Section 2
shutil.copy('/root/zeroscreen/dist/server.js.bak.may25-good', '/root/zeroscreen/dist/server.js')

with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()
print(f"Restored. Size: {len(c)}")

# Only change: BODY_BREAKOUT -> BHAV V3 in the db-sub subtitle
# Find the exact bytes
idx = c.find(b'BODY_BREAKOUT')
print(f"BODY_BREAKOUT at: {idx}")
print(repr(c[idx-60:idx+100]))
