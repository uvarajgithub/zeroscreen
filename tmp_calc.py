import json, math
d = json.load(open('/tmp/p.json'))
inpos = [p for p in d['picks'] if p.get('result') == 'entry_triggered']
for p in inpos:
    ep = p.get('entry_price') or ((p['entry_low']+p['entry_high'])/2)
    sl = p.get('stop_loss') or 0
    sl_dist = abs(ep-sl) if sl else ep*0.05
    sl_dist = max(sl_dist, 0.5)
    qty_sl  = math.floor(5000/sl_dist)
    qty_cap = math.floor(25000/ep)
    qty = max(1, min(qty_sl, qty_cap))
    print(p['stock_symbol'], 'entry:', round(ep,2), 'sl:', sl, 'sl_dist:', round(sl_dist,2), '=> qty:', qty, '| deployed: Rs'+str(round(qty*ep)))
