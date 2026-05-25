with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. _appendClosedTrades: soften colors
# Loss: #ef4444 -> #fca5a5 (soft rose), Win: #10b981 -> #6ee7b7 (soft mint)
# Direction CE: #60a5fa (keep), PE: #fca5a5 (keep)
# Container style: make text lighter

OLD_APPEND = (
    "        var _ch='<div style=\"margin-top:10px;border-top:1px solid #1e293b;padding-top:8px;font-size:.7rem\">';\n"
    "        _ctds.slice().reverse().forEach(function(t,i){\n"
    "          var _ti=(t.premiumEntry>0&&t.premiumExit>0)?Math.round((t.premiumExit-t.premiumEntry)*(t.qty||30)):Math.round((t.pnl||0)*15);\n"
    "          var _tc=_ti>=0?'#10b981':'#ef4444';\n"
)
NEW_APPEND = (
    "        var _ch='<div style=\"margin-top:10px;border-top:1px solid #1e293b;padding-top:8px;font-size:.7rem;color:#94a3b8\">';\n"
    "        _ctds.slice().reverse().forEach(function(t,i){\n"
    "          var _ti=(t.premiumEntry>0&&t.premiumExit>0)?Math.round((t.premiumExit-t.premiumEntry)*(t.qty||30)):Math.round((t.pnl||0)*15);\n"
    "          var _tc=_ti>=0?'#6ee7b7':'#fca5a5';\n"
)

if OLD_APPEND in c:
    c = c.replace(OLD_APPEND, NEW_APPEND, 1)
    print('OK: _appendClosedTrades colors softened')
else:
    print('FAIL: _appendClosedTrades block not found')

# 2. ss-trade-breakdown: soften colors
OLD_BD = (
    "              var _tc=_ti>=0?'#10b981':'#ef4444';\n"
    "              var _td=t.direction?'<span style=\"color:'+(t.direction==='CE'?'#60a5fa':'#fca5a5')+'\">'+"
)
NEW_BD = (
    "              var _tc=_ti>=0?'#6ee7b7':'#fca5a5';\n"
    "              var _td=t.direction?'<span style=\"color:'+(t.direction==='CE'?'#93c5fd':'#fda4af')+'\">'+"
)

if OLD_BD in c:
    c = c.replace(OLD_BD, NEW_BD, 1)
    print('OK: breakdown colors softened')
else:
    print('FAIL: breakdown color line not found')

# 3. live trade color in breakdown
OLD_LTC = "              var _ltc=_lti>=0?'#10b981':'#ef4444';\n"
NEW_LTC = "              var _ltc=_lti>=0?'#6ee7b7':'#fca5a5';\n"
if OLD_LTC in c:
    c = c.replace(OLD_LTC, NEW_LTC, 1)
    print('OK: live trade color softened')
else:
    print('FAIL: live trade color not found')

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8') as f:
    f.write(c)
print('server.js saved')
