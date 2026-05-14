src = open('/root/zeroscreen/dist/server.js').read()
keys = ['id="panel-lock50"', 'id="panel-trail"', 'id="panel-lock50old"']
for k in keys:
    i = src.find(k)
    if i >= 0:
        print(k, '->', repr(src[max(0,i-5):i+90]))
    else:
        print(k, '-> NOT FOUND')
