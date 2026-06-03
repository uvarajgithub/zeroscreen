import json, re

d = open('/root/zeroscreen/dist/server.js').read()
# Find the _futDly assignment
idx = d.find('window._futDly={')
if idx < 0:
    print('NOT FOUND')
    exit()

# Find end of the JSON (the semicolon after the object)
# Extract just the JSON object
start = idx + len('window._futDly=')
# find the closing }; on that line
chunk = d[start:start+500000]
# The JSON ends with }; or };\n or }; followed by \nfunction
semi = chunk.find(';\n')
json_str = chunk[:semi]
print('JSON length:', len(json_str))

try:
    obj = json.loads(json_str)
    print('Keys count:', len(obj))
    print('2026-05 present:', '2026-05' in obj)
    if '2026-05' in obj:
        days = obj['2026-05']
        print('2026-05 days:', len(days), list(days.keys())[:5])
    print('Last 3 keys:', list(obj.keys())[-3:])
except Exception as e:
    print('JSON PARSE ERROR:', e)
    print('Last 200 chars of json_str:', json_str[-200:])
