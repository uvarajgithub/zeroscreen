with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    cur = f.read()

# Find ALL occurrences of .hb{ 
import re
for m in re.finditer(b'\\.hb[{\\s]', cur):
    print(f"  .hb at {m.start()}: {cur[m.start():m.start()+80].decode('utf-8','replace')}")

# Find where the signals page style block is
lbd_idx = cur.find(b'Live Bot Dashboard')
style_start = cur.rfind(b'<style>', 0, lbd_idx)
style_end = cur.find(b'</style>', style_start)
print(f"\nSignals <style>: {style_start}..{style_end}")
print(f"Live Bot Dashboard: {lbd_idx}")
