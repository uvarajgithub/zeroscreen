import os
f='/root/zeroscreen/dist/server.js'
raw=open(f,'rb').read()

# Fix line 2: remove options-specific "idx pts x 15 · prem pts x 30", replace with futures P&L note
old2=(b'&middot; &#8377; P&amp;L: idx pts &times; 15 &middot; prem pts &times; 30</div>')
new2=(b'&middot; &#8377; P&amp;L: lot 30 &times; pts</div>')

# Fix line 3: update backtest stats to futures numbers
old3=(b'5yr Backtest (Jan&rsquo;21&ndash;May&rsquo;26): <strong style="color:#10b981">&#8377;31.07L</strong> &middot; 74.6% WR &middot; &#8377;2,583 avg/trade &middot; MaxDD &#8377;11,027</div>')
new3=(b'5yr Backtest (Jan&rsquo;21&ndash;Jun&rsquo;26): <strong style="color:#10b981">&#8377;56.89L</strong> &middot; 82.9% Win Days &middot; &#8377;927 avg/trade &middot; 66 months</div>')

for old,new in [(old2,new2),(old3,new3)]:
    count=raw.count(old)
    print(f'found {count}x: {old[:50]}')
    raw=raw.replace(old,new)

tmp=f+'.hdr_tmp'
open(tmp,'wb').write(raw)
os.rename(tmp,f)
print('DONE')
