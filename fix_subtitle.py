with open('/root/zeroscreen/dist/server.js','r',encoding='utf-8') as f:
    s=f.read()
idx = s.find('BODY_BREAKOUT')
if idx == -1:
    print('BODY_BREAKOUT not found')
else:
    # Find start of the db-sub line containing BODY_BREAKOUT
    start = s.rfind('<div class="db-sub">', 0, idx)
    end = s.find('</div>', idx) + 6
    old_chunk = s[start:end]
    print('OLD:', repr(old_chunk[:120]))
    # Build new subtitle from heartbeat strategy field
    new_chunk = '<div class="db-sub">BANKNIFTY &middot; AMINA 100 &middot; Variant B &middot; <strong>${mode2}</strong> &middot; 30 qty &middot; SL:60 Trail:100 Buf:25</div>'
    s = s[:start] + new_chunk + s[end:]
    with open('/root/zeroscreen/dist/server.js','w',encoding='utf-8') as f:
        f.write(s)
    print('Fixed subtitle to AMINA 100 Variant B')
