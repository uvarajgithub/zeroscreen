import urllib.request, json
r = urllib.request.urlopen('http://localhost:4000/api/bot/status')
d = json.loads(r.read())
hb = d.get('heartbeat', {})
print('unrealisedPnL:', hb.get('unrealisedPnL'))
print('livePrice:', hb.get('livePrice'))
print('inTrade:', hb.get('inTrade'))
print('entryPrice:', hb.get('entryPrice'))
print('direction:', hb.get('direction'))
