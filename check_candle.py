import urllib.request, json
d = json.loads(urllib.request.urlopen('http://localhost:4000/api/bot/status').read())
hb = d.get('heartbeat', {})
lc = hb.get('lastCandle')
ch = hb.get('candleHistory')
print('lastCandle:', lc)
print('candleHistory count:', len(ch) if ch else 'MISSING/EMPTY')
# Also check for errors in JS - see if tradeCount line is fixed
print('tradeCount:', hb.get('tradeCount'))
print('shadowTradeLog count:', len(hb.get('shadowTradeLog', [])))
print('scalp1TradeLog count:', len(hb.get('scalp1TradeLog', [])))
