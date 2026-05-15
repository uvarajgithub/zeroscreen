with open('/home/ubuntu/trading-bot/dist/src/strategy.js', 'r') as f:
    txt = f.read()

old = 'return { action: "EXIT_EARLY", pts: -HR_EARLY_EXIT };'
new = 'return { action: "EXIT_EARLY", pts: pnl };'

if old in txt:
    txt = txt.replace(old, new)
    with open('/home/ubuntu/trading-bot/dist/src/strategy.js', 'w') as f:
        f.write(txt)
    print('strategy.js fixed')
else:
    print('ERROR: string not found')
