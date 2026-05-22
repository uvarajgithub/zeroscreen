import json

d = json.load(open('/home/ubuntu/trading-bot/5year-backtest-result.json'))
print('totals:', json.dumps(d.get('totals',{})))
print('period:', d.get('period'))
print('days:', d.get('tradingDays'))

# sample first month
monthly = d.get('monthly', {})
keys = sorted(monthly.keys())
print('months:', len(keys), 'first:', keys[0] if keys else 'none', 'last:', keys[-1] if keys else 'none')
if keys:
    print('sample month:', json.dumps(monthly[keys[0]]))
    print('latest month:', json.dumps(monthly[keys[-1]]))
    
# compute totals from monthly
bbTotal = sum(monthly[k].get('bbTotal',0) for k in keys)
rcTotal = sum(monthly[k].get('rcTotal',0) for k in keys)
combined = bbTotal + rcTotal
print(f'\nSum from monthly: bb={bbTotal:.0f}, rc={rcTotal:.0f}, combined={combined:.0f}')
print(f'x15 = Rs{combined*15:,.0f}')
print(f'x30 = Rs{combined*30:,.0f}')
