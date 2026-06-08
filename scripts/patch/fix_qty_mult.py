import os
f='/root/zeroscreen/dist/server.js'
raw=open(f,'rb').read()
old=b'const QTY_MULT2 = 15; // 30 qty \xe2\x94\xbc\xc3\x99 0.5 delta \xce\x93\xc3\xb6 option premium \xce\x93\xc3\xa9\xc2\xa3 per index pt'
new=b'const QTY_MULT2 = 30; // BankNifty Futures lot size'
count=raw.count(old)
print('found:', count)
if count==0:
    # try simpler match
    old2=b'const QTY_MULT2 = 15;'
    count2=raw.count(old2)
    print('simple match found:', count2)
    if count2:
        raw=raw.replace(old2,b'const QTY_MULT2 = 30; // BankNifty Futures lot size',1)
else:
    raw=raw.replace(old,new,1)
tmp=f+'.mult_tmp'
open(tmp,'wb').write(raw)
os.rename(tmp,f)
print('DONE')
