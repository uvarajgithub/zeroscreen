import re

with open('/root/zeroscreen/dist/server.js','r',errors='replace') as f:
    txt=f.read()

idx = txt.find('Live Bot Dashboard')
print("at:", idx)

# Search wider range
chunk = txt[max(0,idx-3000):idx+50]
matches = list(re.finditer(r"app\.get\(['\"][^'\"]+['\"]", chunk))
print("All routes in range:", [m.group() for m in matches])

# Also check what the route string is right before this chunk start
# find res.send( or res.render( before title
send_idx = txt.rfind('res.send', 0, idx)
print("\nres.send before title at:", send_idx, "(dist:", idx-send_idx, ")")
# Look for the route right before res.send
chunk2 = txt[max(0,send_idx-500):send_idx+10]
matches2 = list(re.finditer(r"app\.get\(['\"][^'\"]+['\"]", chunk2))
print("Routes before res.send:", [m.group() for m in matches2])
