c = open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8').read()

old = '<div class="pm-tl-time">9:15 AM &mdash; Market Opens &mdash; Bot Starts</div>\n              <div class="pm-tl-label">Bot resets daily state. First 15-min candle (C1) begins forming</div>'
new = '<div class="pm-tl-time">9:15 AM &mdash; Market Opens &mdash; Bot Active</div>\n              <div class="pm-tl-label">Bot begins scanning. First 15-min candle (C1) starts forming</div>'

if old in c:
    c = c.replace(old, new, 1)
    open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8').write(c)
    print('PATCHED')
else:
    print('NOT FOUND - checking actual text:')
    idx = c.find('9:15 AM')
    while idx != -1:
        print(repr(c[idx:idx+120]))
        idx = c.find('9:15 AM', idx+1)
