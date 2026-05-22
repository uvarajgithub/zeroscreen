import json

# Check optimizer result
d = json.load(open('/home/ubuntu/trading-bot/optimizer-result.json'))
print('=== optimizer-result.json ===')
print(json.dumps(d, indent=2)[:3000])
