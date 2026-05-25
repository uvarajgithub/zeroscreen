import re

with open('/root/zeroscreen/dist/server.js','r',errors='replace') as f:
    txt=f.read()

idx = txt.find('Live Bot Dashboard')
print("at:", idx)

# Search wider - 20000 chars back
chunk = txt[max(0,idx-20000):idx+50]
matches = list(re.finditer(r"app\.get\(['\"][^'\"]+['\"]", chunk))
print("Routes (last 5):", [m.group() for m in matches[-5:]])
