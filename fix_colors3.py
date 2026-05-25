with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find _appendClosedTrades function and replace it entirely
start = None
end = None
for i, ln in enumerate(lines):
    if 'function _appendClosedTrades(el,d){' in ln:
        start = i
    if start is not None and i > start and ln.strip() == '}':
        end = i
        break

if start is None or end is None:
    print(f'Not found: start={start} end={end}')
    exit()

print(f'Replacing _appendClosedTrades: lines {start+1}-{end+1}')

NEW_FUNC = [
    "      function _appendClosedTrades(el,d){\n",
    "        var _td3=new Date().toISOString().slice(0,10);\n",
    "        var _ctds=(d.recentTrades||[]).filter(function(t){return t.exitPrice&&t.exitPrice>0&&(t.date||'').startsWith(_td3);});\n",
    "        if(!_ctds.length)return;\n",
    "        var _ch='<div style=\"margin-top:10px;border-top:1px solid rgba(255,255,255,.06);padding-top:8px\">';\n",
    "        _ch+='<div style=\"font-size:.58rem;text-transform:uppercase;letter-spacing:.8px;color:#475569;margin-bottom:5px\">Closed Today</div>';\n",
    "        _ctds.slice().reverse().forEach(function(t,i){\n",
    "          var _ti=(t.premiumEntry>0&&t.premiumExit>0)?Math.round((t.premiumExit-t.premiumEntry)*(t.qty||30)):Math.round((t.pnl||0)*15);\n",
    "          var _tc=_ti>=0?'#4ade80':'#fb923c';\n",
    "          var _dc=t.direction==='CE'?'#38bdf8':'#c084fc';\n",
    "          var _tm=t.date?new Date(t.date).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}):'';\n",
    "          var _re=t.reasonExit?'<span style=\"color:#475569;font-size:.6rem\"> '+t.reasonExit+'</span>':'';\n",
    "          _ch+='<div style=\"display:flex;align-items:center;gap:8px;padding:3px 0;font-size:.68rem\">'\n",
    "            +'<span style=\"color:#64748b\">'+_tm+'</span>'\n",
    "            +(t.direction?'<span style=\"color:'+_dc+';font-weight:700\">'+t.direction+'</span>':'')\n",
    "            +'<b style=\"color:'+_tc+'\">'+(_ti>=0?'+':'-')+'&#8377;'+Math.abs(_ti)+'</b>'\n",
    "            +_re\n",
    "            +'</div>';\n",
    "        });\n",
    "        _ch+='</div>';\n",
    "        el.innerHTML+=_ch;\n",
    "      }\n",
]

lines[start:end+1] = NEW_FUNC
print(f'Replaced with {len(NEW_FUNC)} lines')

# Fix ss-trade-breakdown forEach line
for i, ln in enumerate(lines):
    if "_bdHtml+=" in ln and "Trade '" in ln and 'i+1' in ln:
        print(f'Found breakdown forEach at line {i+1}')
        lines[i] = (
            "              _bdHtml+='<div style=\"display:flex;align-items:center;gap:6px;padding:2px 0\">'\n"
            "                +'<span style=\"color:#64748b;font-size:.6rem\">T'+(i+1)+'</span>'\n"
            "                +_td\n"
            "                +'<b style=\"color:'+_tc+'\">'+(_ti>=0?'+':'-')+'&#8377;'+Math.abs(_ti)+'</b>'\n"
            "                +(_tp?'<span style=\"color:#475569;font-size:.6rem\">'+_tp+'</span>':'')\n"
            "                +'<span style=\"color:#64748b;font-size:.6rem\">'+_tm+'</span>'\n"
            "                +'</div>';\n"
        )
        print('Updated breakdown forEach')
        break

# Fix live trade line in breakdown
for i, ln in enumerate(lines):
    if "_bdHtml+=" in ln and 'live</div>' in ln and '_todayTds.length+1' in ln:
        print(f'Found live line at {i+1}')
        lines[i] = (
            "              _bdHtml+='<div style=\"display:flex;align-items:center;gap:6px;padding:2px 0\">'\n"
            "                +'<span style=\"color:#64748b;font-size:.6rem\">T'+(_todayTds.length+1)+'</span>'\n"
            "                +_ldirHtml\n"
            "                +'<b style=\"color:'+_ltc+'\">'+(_lti>=0?'+':'-')+'&#8377;'+Math.abs(_lti)+'</b>'\n"
            "                +'<span style=\"color:#f59e0b;font-size:.6rem\">&#9679; live</span>'\n"
            "                +'</div>';\n"
        )
        print('Updated live trade line')
        break

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('server.js saved')
