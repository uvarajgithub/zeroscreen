with open('/home/ubuntu/trading-bot/backtest_5yr_correct.js', 'r') as f:
    txt = f.read()

old = """        if (c1pnl < -3) {
          inTrade=false; losses++; pnl-=3; trades++;
          continue;
        }"""

new = """        if (c1pnl < -3) {
          inTrade=false; losses++; pnl+=c1pnl; trades++;
          continue;
        }"""

if old in txt:
    txt = txt.replace(old, new)
    with open('/home/ubuntu/trading-bot/backtest_5yr_correct.js', 'w') as f:
        f.write(txt)
    print('Fixed TICK TRAIL pnl-=3 bug')
else:
    print('ERROR: string not found')
    idx = txt.find('pnl-=3')
    if idx >= 0:
        print('Context:', repr(txt[idx-100:idx+60]))
