path = '/root/zeroscreen/src/server.ts'
with open(path, encoding='utf-8') as f:
    c = f.read()

# Patch 1: fix P&L formula and add 5yr backtest row
old = ('&middot; &#8377; P&amp;L = pts &times; 15</div>\n'
       '        <div class="sig3-sub" style="margin-top:3px">')

if old in c:
    # Already has a 3rd row - update it
    import re
    # Replace old 2nd row ending and the existing 3rd row
    old2 = ('&middot; &#8377; P&amp;L = pts &times; 15</div>\n'
            '        <div class="sig3-sub" style="margin-top:3px">')
    # Find what comes after
    idx = c.find(old2)
    end_idx = c.find('</div>', idx + len(old2))
    old_full = c[idx:end_idx+6]
    new_full = ('&middot; &#8377; P&amp;L: idx pts &times; 15 &middot; prem pts &times; 30</div>\n'
                '        <div class="sig3-sub" style="margin-top:3px">'
                '5yr Backtest (Jan&rsquo;21&ndash;May&rsquo;26): <strong style="color:#10b981">&#8377;31.07L</strong> '
                '&middot; 74.6% WR &middot; &#8377;2,583 avg/trade &middot; MaxDD &#8377;11,027</div>')
    c = c.replace(old_full, new_full, 1)
    print('Patch OK (updated existing row)')
else:
    # No 3rd row yet — patch the 2nd row and add 3rd
    old_simple = '&middot; &#8377; P&amp;L = pts &times; 15</div>'
    if old_simple in c:
        new_simple = ('&middot; &#8377; P&amp;L: idx pts &times; 15 &middot; prem pts &times; 30</div>\n'
                      '        <div class="sig3-sub" style="margin-top:3px">'
                      '5yr Backtest (Jan&rsquo;21&ndash;May&rsquo;26): <strong style="color:#10b981">&#8377;31.07L</strong> '
                      '&middot; 74.6% WR &middot; &#8377;2,583 avg/trade &middot; MaxDD &#8377;11,027</div>')
        c = c.replace(old_simple, new_simple, 1)
        print('Patch OK (added new row)')
    else:
        print('NOT FOUND')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('DONE')
