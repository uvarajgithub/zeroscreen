import urllib.request, json
r = urllib.request.urlopen('http://localhost:4000/api/bot/status')
d = json.loads(r.read())
hb = d.get('heartbeat', {})
stl = hb.get('shadowTradeLog')
s1tl = hb.get('scalp1TradeLog')
print('shadowTradeLog:', len(stl) if stl else 'MISSING/EMPTY', stl)
print('scalp1TradeLog:', len(s1tl) if s1tl else 'MISSING/EMPTY', s1tl)
