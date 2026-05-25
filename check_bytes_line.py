import sys
data = open('/home/ubuntu/trading-bot/dist/src/index.js', 'rb').read()
idx = data.find(b'7,04,406')
if idx < 0:
    print("NOT FOUND")
else:
    start = data.rfind(b'\n', 0, idx) + 1
    end = data.find(b'\n', idx)
    print(repr(data[start:end]))
