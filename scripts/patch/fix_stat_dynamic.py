data = open('/root/zeroscreen/dist/server.js', encoding='utf-8').read()

old = ('        <div class="db-sub" style="margin-top:3px">5yr Backtest (Jan&rsquo;21&ndash;Jun&rsquo;26): '
       '<strong style="color:#10b981">&#8377;42.76L</strong> &middot; 90.4% Win Days'
       ' &middot; &#8377;3,413 avg/day &middot; 66 months</div>')

_bt_rs_lakh = '${backtest.totals?.bodyBreakout ? (backtest.totals.bodyBreakout*15/100000).toFixed(2)+"L" : "\\u2014"}'
_bt_wr      = '${backtest.winRate ?? "\\u2014"}'
_bt_avg     = '${backtest.tradedDays && backtest.totals?.bodyBreakout ? Math.round(backtest.totals.bodyBreakout*15/backtest.tradedDays).toLocaleString("en-IN") : "\\u2014"}'
_bt_mo      = '${Object.keys(backtest.monthly||{}).length}'
_bt_from    = '${backtest.period?.from?.slice(0,4) ?? "2021"}'
_bt_to      = '${backtest.period?.to ? backtest.period.to.slice(0,7).replace("-","/") : "Jun 26"}'

new = (
    '        <div class="db-sub" style="margin-top:3px">5yr Backtest'
    f' ({_bt_from}&ndash;{_bt_to}): '
    f'<strong style="color:#10b981">&#8377;{_bt_rs_lakh}</strong>'
    f' &middot; {_bt_wr}% Win Days'
    f' &middot; &#8377;{_bt_avg} avg/day'
    f' &middot; {_bt_mo} months</div>'
)

if old in data:
    data = data.replace(old, new, 1)
    open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8').write(data)
    print('FIXED — now dynamic')
else:
    lines = data.split('\n')
    print('NOT FOUND. Line 10628:')
    print(repr(lines[10627]))
