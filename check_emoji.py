c = open('/home/ubuntu/trading-bot/dist/src/amina-live.js', 'r', encoding='utf-8').read()
idx = c.find('const _colour')
print(repr(c[idx:idx+80]))
