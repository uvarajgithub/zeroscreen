data=open('/root/zeroscreen/dist/server.js').read()
idx=data.find('.d-b{')
if idx>=0:
    print(data[idx:idx+200])
else:
    idx2=data.find('d-b ')
    print('no .d-b{, trying d-b :', data[idx2:idx2+200] if idx2>=0 else 'NOT FOUND')
