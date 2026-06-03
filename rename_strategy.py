import os
f='/root/zeroscreen/dist/server.js'
raw=open(f,'rb').read()
old=b'DRISHTI_V1 \\xb7 SL=150pts \\xb7 lot=30'
new=b'BankNifty Futures \\xb7 SL=150pts \\xb7 lot=30'
count=raw.count(old)
print('found:', count)
out=raw.replace(old,new)
tmp=f+'.ren_tmp'
open(tmp,'wb').write(out)
os.rename(tmp,f)
print('DONE')
