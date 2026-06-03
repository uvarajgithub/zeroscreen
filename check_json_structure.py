import json
d = json.load(open('/home/ubuntu/trading-bot/futures-monthly-results.json'))
# Check if daily data is available
print('Keys in JSON:', list(d.keys())[:5])
monthly = d.get('monthly', {})
print('Monthly keys sample:', list(monthly.keys())[:3])
# Check one month for daily breakdown
mo = list(monthly.keys())[0]
print(f'Keys in month {mo}:', list(monthly[mo].keys()))
# Look for daily/days data
daily = d.get('daily', d.get('days', d.get('trades', None)))
if daily:
    print('Daily data found, sample keys:', list(daily.keys())[:3])
else:
    print('No daily key found at top level')
    print('All top-level keys:', list(d.keys()))
