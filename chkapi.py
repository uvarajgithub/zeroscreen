import urllib.request, json
d = json.loads(urllib.request.urlopen('http://localhost:4000/api/bot/status').read())
a = d.get('activeState', {})
print('activeState.inTrade:', a.get('inTrade'))
print('activeState.activeTrade:', a.get('activeTrade'))
print('activeState.unrealisedPnL:', a.get('unrealisedPnL'))
print('activeState.livePrice:', a.get('livePrice'))
print('today.pnl:', d.get('today', {}).get('pnl'))
