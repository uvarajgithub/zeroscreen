#!/usr/bin/env python3
# Writes patch_premium_pnl.py to disk then runs it

import os, sys

script = r'''
path = '/root/zeroscreen/dist/server.js'
DASH  = b'\xe2\x80\x94'
INR   = b'\xe2\x82\xb9'
MINUS = b'\xe2\x88\x92'
ARROW = b'\xe2\x86\x92'

with open(path,'rb') as f:
    data = f.read()

changes = []

# 1. Remove duplicate Last 15-min Candle card
dup = (
    b'\n        <!-- Last 15-min Candle Card -->\n'
    b'        <div id="last-candle-card" style="margin-top:10px;border-radius:10px;border:1.5px solid var(--border);padding:12px 14px;background:var(--card-bg)">\n'
    b'          <div style="font-size:.68rem;text-transform:uppercase;letter-spacing:1px;color:#8b949e;font-weight:700;margin-bottom:8px">&#128200; Last 15-min Candle</div>\n'
    b'          <div id="lc-content" style="font-size:.78rem;color:var(--muted)"><span style="opacity:.4">Waiting for first candle&#8230;</span></div>\n'
    b'        </div>\n'
    b'      </div>'
)
changes.append(('1-dup-candle', dup, b'\n      </div>'))

# 2a. In-position P&L big Rs number
old2a = b'<div class="pos-pnl-rs ${unreal2>=0?\'g\':\'r\'}" id="pos-lock50-rs">${fmtRs2(unreal2)}</div>'
new2a = (b'<div class="pos-pnl-rs ${(()=>{const _ep=hb2.entryPremium||0,_lp=hb2.livePremium||0,_q=qty2>0?qty2:30;'
         b'const _r=(_ep>0&&_lp>0)?Math.round((_lp-_ep)*_q):Math.round(unreal2*QTY_MULT2);return _r>=0?\'g\':\'r\';})()} " id="pos-lock50-rs">'
         b'${(()=>{const _ep=hb2.entryPremium||0,_lp=hb2.livePremium||0,_q=qty2>0?qty2:30;'
         b'const _r=(_ep>0&&_lp>0)?Math.round((_lp-_ep)*_q):Math.round(unreal2*QTY_MULT2);'
         b"return (_r>=0?'+':" + MINUS + b"')+" + INR + b"+Math.abs(_r).toLocaleString('en-IN');})()} </div>")
changes.append(('2a-pos-rs', old2a, new2a))

# 2b. In-position P&L subtitle
old2b = (b"<div class=\"pos-pnl-pts ${unreal2>=0?'g':'r'}\" id=\"pos-lock50-pts\">"
         b"${unreal2>=0?'+':''}${unreal2.toFixed(0)} index pts unrealised</div>")
new2b = (b'<div class="pos-pnl-pts ${(()=>{const _ep=hb2.entryPremium||0,_lp=hb2.livePremium||0,_q=qty2>0?qty2:30;'
         b'const _r=(_ep>0&&_lp>0)?Math.round((_lp-_ep)*_q):Math.round(unreal2*QTY_MULT2);return _r>=0?\'g\':\'r\';})()} " id="pos-lock50-pts">'
         b'${(()=>{const _ep=hb2.entryPremium||0,_lp=hb2.livePremium||0;'
         b"return (_ep>0&&_lp>0)?(" + INR + b"'+_ep.toFixed(0)+' " + ARROW + b' ' + INR + b"'+_lp.toFixed(0)+' (option premium)'):"
         b"(unreal2>=0?'+':'')+unreal2.toFixed(0)+' index pts';})()} </div>")
changes.append(('2b-pos-pts', old2b, new2b))

# 3. Daily table header
old3 = (b'<thead><tr><th>Time</th><th>Dir</th><th>Buy Index</th><th>Symbol</th>'
        b'<th>Sell Index</th><th>Index P&amp;L</th><th>&#8377; P&amp;L</th>'
        b'<th>Reason</th><th>Dur</th></tr></thead>')
new3 = (b'<thead><tr><th>Time</th><th>Dir</th><th>Symbol</th>'
        b'<th>Buy ' + INR + b'</th><th>Sell ' + INR + b'</th>'
        b'<th>P&amp;L</th><th>Reason</th><th>Dur</th></tr></thead>')
changes.append(('3-daily-hdr', old3, new3))

# 4. Daily table rows
old4 = (
    b"                  const d3=(t.direction||'').toLowerCase();\n"
    b"                  const pts=t.pnl??0; const rs=Math.round(pts*QTY_MULT2);\n"
    b"                  const reason=t.reasonExit||'" + DASH + b"';\n"
    b"                  const rTag=reason.toLowerCase().includes('sl')||reason.toLowerCase().includes('stop')?'rc-sl':reason.toLowerCase().includes('trail')||reason.toLowerCase().includes('early')?'rc-trail':'rc-eod';\n"
    b"                  const dur=t.duration?(t.duration<60?t.duration+'s':Math.round(t.duration/60)+'m'):'" + DASH + b"';\n"
    b"                  return `<tr>\n"
    b'                    <td class="tc">${fmtTime2(t.date)}</td>\n'
    b"                    <td><span class=\"db-badge ${d3}\">${t.direction||'" + DASH + b"'}</span></td>\n"
    b"                    <td class=\"mono\">${(t.entryPrice??0)>0?(t.entryPrice??0).toFixed(1):'" + DASH + b"'}</td>\n"
    b"                    <td class=\"tc mono\">${t.symbol||'" + DASH + b"'}</td>\n"
    b"                    <td class=\"mono\">${(t.exitPrice??0)>0?(t.exitPrice??0).toFixed(1):'" + DASH + b"'}</td>\n"
    b"                    <td class=\"${pts>=0?'g':'r'}\" style=\"font-weight:800\">${pts>=0?'+':''}${pts.toFixed(0)} pts</td>\n"
    b"                    <td><span class=\"pnl-rs ${pts>=0?'g':'r'}\">${rs>=0?'+':'&#8722;'}&#8377;${Math.abs(rs).toLocaleString('en-IN')}</span></td>\n"
    b"                    <td>${reason!=='" + DASH + b"'?`<span class=\"rc-b ${rTag}\">${reason}</span>`:'" + DASH + b"'}</td>\n"
    b"                    <td class=\"tc\">${dur}</td>\n"
    b"                  </tr>`;\n"
    b"                }).join('')"
)
new4 = (
    b"                  const d3=(t.direction||'').toLowerCase();\n"
    b"                  const buyPrem=t.premiumEntry??0,sellPrem=t.premiumExit??0;\n"
    b"                  const hasPrem=buyPrem>0&&sellPrem>0;\n"
    b"                  const premRs=hasPrem?Math.round((sellPrem-buyPrem)*30):Math.round((t.pnl??0)*QTY_MULT2);\n"
    b"                  const reason=t.reasonExit||'" + DASH + b"';\n"
    b"                  const rTag=reason.toLowerCase().includes('sl')||reason.toLowerCase().includes('stop')?'rc-sl':reason.toLowerCase().includes('trail')||reason.toLowerCase().includes('early')?'rc-trail':'rc-eod';\n"
    b"                  const dur=t.duration?(t.duration<60?t.duration+'s':Math.round(t.duration/60)+'m'):'" + DASH + b"';\n"
    b"                  return `<tr>\n"
    b'                    <td class="tc">${fmtTime2(t.date)}</td>\n'
    b"                    <td><span class=\"db-badge ${d3}\">${t.direction||'" + DASH + b"'}</span></td>\n"
    b"                    <td class=\"tc mono\" style=\"font-size:.71rem\">${t.symbol||'" + DASH + b"'}</td>\n"
    b"                    <td class=\"mono\" style=\"color:#60a5fa\">${buyPrem>0?'" + INR + b"'+buyPrem.toFixed(0):'" + DASH + b"'}</td>\n"
    b"                    <td class=\"mono\" style=\"color:#fbbf24\">${sellPrem>0?'" + INR + b"'+sellPrem.toFixed(0):'" + DASH + b"'}</td>\n"
    b"                    <td class=\"${premRs>=0?'g':'r'}\" style=\"font-weight:800\">${premRs>=0?'+':'" + MINUS + b"'}" + INR + b"${Math.abs(premRs).toLocaleString('en-IN')}</td>\n"
    b"                    <td>${reason!=='" + DASH + b"'?`<span class=\"rc-b ${rTag}\">${reason}</span>`:'" + DASH + b"'}</td>\n"
    b"                    <td class=\"tc\">${dur}</td>\n"
    b"                  </tr>`;\n"
    b"                }).join('')"
)
changes.append(('4-daily-rows', old4, new4))

# 5. Weekly table header
old5 = (b'<thead><tr><th>Date</th><th>Dir</th><th>Buy Index</th><th>Sell Index</th>'
        b'<th>Index P&amp;L</th><th>&#8377; P&amp;L</th><th>Reason</th></tr></thead>')
new5 = (b'<thead><tr><th>Date</th><th>Dir</th><th>Symbol</th>'
        b'<th>Buy ' + INR + b'</th><th>Sell ' + INR + b'</th>'
        b'<th>P&amp;L</th><th>Reason</th></tr></thead>')
changes.append(('5-weekly-hdr', old5, new5))

# 6. Weekly table rows
old6 = (
    b"                const d3=(t.direction||'').toLowerCase();\n"
    b"                const pts=t.pnl??0; const rs=Math.round(pts*QTY_MULT2);\n"
    b"                const reason=t.reasonExit||'" + DASH + b"';\n"
    b"                const rTag=reason.toLowerCase().includes('sl')?'rc-sl':reason.toLowerCase().includes('trail')||reason.toLowerCase().includes('early')?'rc-trail':'rc-eod';\n"
    b"                return `<tr>\n"
    b"                  <td class=\"tc\">${t.date?fmtDate2(t.date):'" + DASH + b"'}</td>\n"
    b"                  <td><span class=\"db-badge ${d3}\">${t.direction||'" + DASH + b"'}</span></td>\n"
    b"                  <td class=\"mono\">${(t.entryPrice??0)>0?(t.entryPrice??0).toFixed(1):'" + DASH + b"'}</td>\n"
    b"                  <td class=\"mono\">${(t.exitPrice??0)>0?(t.exitPrice??0).toFixed(1):'" + DASH + b"'}</td>\n"
    b"                  <td class=\"${pts>=0?'g':'r'}\" style=\"font-weight:800\">${pts>=0?'+':''}${pts.toFixed(0)} pts</td>\n"
    b"                  <td><span class=\"pnl-rs ${pts>=0?'g':'r'}\">${rs>=0?'+':'&#8722;'}&#8377;${Math.abs(rs).toLocaleString('en-IN')}</span></td>\n"
    b"                  <td>${reason!=='" + DASH + b"'?`<span class=\"rc-b ${rTag}\">${reason}</span>`:'" + DASH + b"'}</td>\n"
    b"                </tr>`;\n"
    b"              }).join('');"
)
new6 = (
    b"                const d3=(t.direction||'').toLowerCase();\n"
    b"                const buyPremW=t.premiumEntry??0,sellPremW=t.premiumExit??0;\n"
    b"                const hasPremW=buyPremW>0&&sellPremW>0;\n"
    b"                const premRsW=hasPremW?Math.round((sellPremW-buyPremW)*30):Math.round((t.pnl??0)*QTY_MULT2);\n"
    b"                const reason=t.reasonExit||'" + DASH + b"';\n"
    b"                const rTag=reason.toLowerCase().includes('sl')?'rc-sl':reason.toLowerCase().includes('trail')||reason.toLowerCase().includes('early')?'rc-trail':'rc-eod';\n"
    b"                return `<tr>\n"
    b"                  <td class=\"tc\">${t.date?fmtDate2(t.date):'" + DASH + b"'}</td>\n"
    b"                  <td><span class=\"db-badge ${d3}\">${t.direction||'" + DASH + b"'}</span></td>\n"
    b"                  <td class=\"tc mono\" style=\"font-size:.71rem\">${t.symbol||'" + DASH + b"'}</td>\n"
    b"                  <td class=\"mono\" style=\"color:#60a5fa\">${buyPremW>0?'" + INR + b"'+buyPremW.toFixed(0):'" + DASH + b"'}</td>\n"
    b"                  <td class=\"mono\" style=\"color:#fbbf24\">${sellPremW>0?'" + INR + b"'+sellPremW.toFixed(0):'" + DASH + b"'}</td>\n"
    b"                  <td class=\"${premRsW>=0?'g':'r'}\" style=\"font-weight:800\">${premRsW>=0?'+':'" + MINUS + b"'}" + INR + b"${Math.abs(premRsW).toLocaleString('en-IN')}</td>\n"
    b"                  <td>${reason!=='" + DASH + b"'?`<span class=\"rc-b ${rTag}\">${reason}</span>`:'" + DASH + b"'}</td>\n"
    b"                </tr>`;\n"
    b"              }).join('');"
)
changes.append(('6-weekly-rows', old6, new6))

# 7. JS live update — position card premium P&L
old7 = (
    b"      if(inT&&ep>0){\n"
    b"        const g=ge('pos-lock50-rs');if(g){g.textContent=fR(unr);g.style.color=gc(unr);}\n"
    b"        const gp=ge('pos-lock50-pts');if(gp){gp.textContent=(unr>=0?'+':'')+unr.toFixed(0)+' index pts unrealised';gp.style.color=gc(unr);}\n"
    b"        if(ge('pos-lock50-lp')&&lp)ge('pos-lock50-lp').textContent=lp.toFixed(1);\n"
    b"        // P&L gauge: 0% at SL, 50% at entry, 100% at +slPts target\n"
    b"        const gf=ge('pos-lock50-gauge');\n"
    b"        if(gf){\n"
    b"          const range=slPts*2;\n"
    b"          const pct=Math.min(100,Math.max(0,Math.round(((unr+slPts)/range)*100)));\n"
    b"          gf.style.width=pct+'%';\n"
    b"          gf.style.background=unr>=0?'#10b981':'#ef4444';\n"
    b"        }\n"
    b"      }"
)
new7 = (
    b"      if(inT&&ep>0){\n"
    b"        const ePrem=parseFloat(hb.entryPremium||0),lPrem=parseFloat(hb.livePremium||0);\n"
    b"        const hasPremLive=ePrem>0&&lPrem>0;\n"
    b"        const premRsLive=hasPremLive?Math.round((lPrem-ePrem)*qty):Math.round(unr*QM);\n"
    b"        const g=ge('pos-lock50-rs');\n"
    b"        if(g){g.textContent=(premRsLive>=0?'+':'" + MINUS + b"')+" + INR + b"+Math.abs(premRsLive).toLocaleString('en-IN');g.style.color=gc(premRsLive);}\n"
    b"        const gp=ge('pos-lock50-pts');\n"
    b"        if(gp){gp.textContent=hasPremLive?('" + INR + b"'+ePrem.toFixed(0)+' " + ARROW + b" " + INR + b"'+lPrem.toFixed(0)+' (option premium)'):(unr>=0?'+':'')+unr.toFixed(0)+' index pts';gp.style.color=gc(premRsLive);}\n"
    b"        if(ge('pos-lock50-lp')&&lp)ge('pos-lock50-lp').textContent=lp.toFixed(1);\n"
    b"        if(ge('pos-lock50-liveprem')&&lPrem>0)ge('pos-lock50-liveprem').textContent='" + INR + b"'+lPrem.toFixed(1);\n"
    b"        // P&L gauge: 0% at SL, 50% at entry, 100% at +slPts target\n"
    b"        const gf=ge('pos-lock50-gauge');\n"
    b"        if(gf){\n"
    b"          const range=slPts*2;\n"
    b"          const pct=Math.min(100,Math.max(0,Math.round(((unr+slPts)/range)*100)));\n"
    b"          gf.style.width=pct+'%';\n"
    b"          gf.style.background=premRsLive>=0?'#10b981':'#ef4444';\n"
    b"        }\n"
    b"      }"
)
changes.append(('7-js-live', old7, new7))

ok = True
for name,old,new in changes:
    c=data.count(old)
    print(f'{name}: {c} match(es)')
    if c!=1: ok=False

if not ok:
    print('ERROR: aborting')
    exit(1)

for name,old,new in changes:
    data=data.replace(old,new,1)

with open(path,'wb') as f:
    f.write(data)
print('PATCHED OK')
'''

with open('/tmp/do_patch.py', 'w', encoding='utf-8') as f:
    f.write(script)

import subprocess
r = subprocess.run(['python3', '/tmp/do_patch.py'], capture_output=True)
print(r.stdout.decode())
print(r.stderr.decode())
