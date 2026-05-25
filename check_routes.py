import re
with open('/root/zeroscreen/dist/server.js','r',errors='replace') as f:
    txt=f.read()
routes=re.findall(r"app\.get\(['\"][^'\"]+['\"]", txt)
print('\n'.join(routes[:40]))
