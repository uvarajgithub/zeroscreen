with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Find the atl-trades div and JS injection
idx = c.find(b'atl-trades')
while idx != -1:
    ctx = c[idx:idx+200]
    print(f'atl-trades at {idx}: {repr(ctx[:150])}')
    idx = c.find(b'atl-trades', idx+1)

print('---')
# Find the trade injection JS
for kw in [b'todayTrades.length', b'atlHtml', b'atl-trade', b'_trd', b'trades.length', b'trades.forEach']:
    idx2 = c.find(kw)
    if idx2 != -1:
        print(f'{kw}: at {idx2}')
        print(repr(c[idx2:idx2+300]))
        print()
