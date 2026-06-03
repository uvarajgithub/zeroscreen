import json
d = json.load(open('/home/ubuntu/trading-bot/5year-backtest-result.json'))
# Check daily structure more carefully
daily = d['daily']
print('Daily sample (first 3):')
for item in daily[:3]:
    print(item)
print()
# Check if it covers our futures period (2021-2026)
dates = [item['date'] for item in daily]
print('Date range:', dates[0], 'to', dates[-1])
print('Total days:', len(daily))
