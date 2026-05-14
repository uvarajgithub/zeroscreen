import urllib.request, json, datetime

API_KEY = '7an6kfp8opzq0zai'
ACCESS_TOKEN = '6Gtk2KesOsWEqt05grL7J2YG2BuolbZS'

# Fetch today's BANKNIFTY 15-min candles
today = '2026-05-14'
url = f'https://api.kite.trade/instruments/historical/260105/15minute?from={today}+09:00:00&to={today}+15:30:00'
req = urllib.request.Request(url, headers={
    'X-Kite-Version': '3',
    'Authorization': f'token {API_KEY}:{ACCESS_TOKEN}'
})
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read())
    candles = data.get('data', {}).get('candles', [])
    print(f'Got {len(candles)} candles')
    print('time,open,high,low,close,volume')
    for c in candles:
        print(','.join(str(x) for x in c[:6]))
    # Save to file
    json.dump(candles, open('/tmp/today_candles.json', 'w'))
    print('Saved to /tmp/today_candles.json')
except Exception as e:
    print('Error:', e)
