raw=open('/root/zeroscreen/dist/server.js','rb').read()
idx = raw.find(b'th-panel-m')
# Search backwards for app.get or res.send
for search_term in [b"app.get('", b'app.get("', b"res.send(`", b"res.send('", b'/signals', b'/dashboard']:
    pos = raw.rfind(search_term, 0, idx)
    if pos >= 0:
        print(f'{search_term}: pos={pos}, dist={idx-pos}')
        print(repr(raw[pos:pos+60]))
        print()
