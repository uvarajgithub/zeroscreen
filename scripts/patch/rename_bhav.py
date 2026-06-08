import os
f='/root/zeroscreen/dist/server.js'
raw=open(f,'rb').read()

replacements=[
    (b'BANKNIFTY &middot; BHAV V3 &middot;', b'BANKNIFTY &middot; BankNifty Futures &middot;'),
    (b'<span class="stab-name">&#9679; BHAV V3</span>', b'<span class="stab-name">&#9679; BankNifty Futures</span>'),
]

for old,new in replacements:
    count=raw.count(old)
    print(f'"{old[:40]}" found: {count}')
    raw=raw.replace(old,new)

tmp=f+'.rename_tmp'
open(tmp,'wb').write(raw)
os.rename(tmp,f)
print('DONE')
