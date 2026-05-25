with open('/home/ubuntu/trading-bot/dist/src/index.js', 'r') as f:
    code = f.read()

old = "            setTimeout(() => {\n                kite.getProfile().then(() => {"
new = "            setTimeout(() => {\n                const _d = new Date(); const _dIst = new Date(_d.toLocaleString('en-US',{timeZone:'Asia/Kolkata'})); if (_dIst.getDay()===0||_dIst.getDay()===6) return;\n                kite.getProfile().then(() => {"

if old in code:
    code = code.replace(old, new, 1)
    print('Fix3: applied')
else:
    print('Fix3: NOT FOUND')

with open('/home/ubuntu/trading-bot/dist/src/index.js', 'w') as f:
    f.write(code)
print('DONE')
