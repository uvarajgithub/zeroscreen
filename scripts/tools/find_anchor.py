src = open('/root/zeroscreen/dist/server.js','r', encoding='utf-8', errors='surrogateescape').read()
print('size:', len(src))
idx = src.find('PANEL: AI INSIGHTS')
print('idx:', idx)
if idx >= 0:
    print(repr(src[idx-100:idx+30]))
else:
    # try bytes
    raw = open('/root/zeroscreen/dist/server.js','rb').read()
    idx2 = raw.find(b'PANEL: AI')
    print('bytes idx:', idx2, repr(raw[idx2-80:idx2+30]))
