raw=open('/root/zeroscreen/dist/server.js','rb').read()
# Find th-panel-m in the source
idx = raw.find(b'th-panel-m')
if idx >= 0:
    # Look back 500 chars for the route
    start = max(0, idx-500)
    print('Context before panel:', raw[start:idx+100])
