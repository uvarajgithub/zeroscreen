import re
with open('/root/zeroscreen/dist/server.js','r',errors='replace') as f:
    txt=f.read()
# Find any route that serves sig3 content
routes=re.findall(r"app\.get\(['\"][^'\"]+['\"]", txt)
for r in routes:
    print(r)
print('\n--- searching for sig3 route ---')
idx = txt.find('sig3-hdr')
if idx != -1:
    # Look backwards for the route
    chunk = txt[max(0,idx-500):idx+50]
    print(chunk[-300:])
