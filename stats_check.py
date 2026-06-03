import json
d=json.load(open('/home/ubuntu/trading-bot/futures-monthly-results.json'))
m=d['monthly']
keys=sorted(m.keys())
total_net=sum(v['netRs'] for v in m.values())
total_trades=sum(v['trades'] for v in m.values())
win_days=sum(v['winDays'] for v in m.values())
total_days=sum(v['totalDays'] for v in m.values())
avg_trade=round(total_net/total_trades) if total_trades else 0
wr=round(win_days/total_days*100,1) if total_days else 0
worst=min(v['netRs'] for v in m.values())
print('Total net:', total_net)
print('Months:', len(keys), keys[0], '-', keys[-1])
print('Total trades:', total_trades)
print('Win days %:', wr)
print('Avg per trade:', avg_trade)
print('Worst month:', worst)
print('In lakhs:', round(total_net/100000,2))
