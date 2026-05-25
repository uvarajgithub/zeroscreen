data = open('/root/zeroscreen/dist/server.js', 'rb').read()
idx = data.find(b'Loading trigger levels')
if idx >= 0:
    print(repr(data[idx:idx+60]))
    end = data.find(b'</div>\n          </div>', idx)
    print('end offset:', end)
    print(repr(data[idx:end+22]))
