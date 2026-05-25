import re, subprocess

with open('/root/zeroscreen/dist/server.js','r',errors='replace') as f:
    txt=f.read()

# Find "Live Bot Dashboard"
idx = txt.find('Live Bot Dashboard')
print("Live Bot Dashboard at:", idx)
if idx != -1:
    # Find the route handler it's in - look backwards for app.get
    chunk = txt[max(0,idx-800):idx+50]
    matches = list(re.finditer(r"app\.get\(['\"][^'\"]+['\"]", chunk))
    print("Closest route:", matches[-1].group() if matches else "not found")
    print("Context before:", txt[max(0,idx-100):idx+50])
