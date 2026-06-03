data = open('/root/zeroscreen/dist/server.js', encoding='utf-8').read()

old = ('        <div class="db-sub" style="margin-top:3px">5yr Backtest (Jan&rsquo;21&ndash;Jun&rsquo;26): '
       '<strong style="color:#10b981">&#8377;56.89L</strong> &middot; 82.9% Win Days &middot; &#8377;927 avg/trade'
       ' &middot; 66 months#8377;42.76L &middot; 90.4% Win Days &middot; &#8377;56.89L</strong>'
       ' &middot; 82.9% Win Days &middot; &#8377;927 avg/trade &middot; 66 months#8377;3,413 avg/day'
       ' &middot; 66 months</div>')

new = ('        <div class="db-sub" style="margin-top:3px">5yr Backtest (Jan&rsquo;21&ndash;Jun&rsquo;26): '
       '<strong style="color:#10b981">&#8377;42.76L</strong> &middot; 90.4% Win Days'
       ' &middot; &#8377;3,413 avg/day &middot; 66 months</div>')

if old in data:
    data = data.replace(old, new, 1)
    open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8').write(data)
    print('FIXED')
else:
    # fallback: show what line 10628 actually contains
    lines = data.split('\n')
    print('NOT FOUND. Line 10628:')
    print(repr(lines[10627]))
