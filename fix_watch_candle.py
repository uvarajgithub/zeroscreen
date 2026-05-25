#!/usr/bin/env python3
"""Replace old body-based CE/PE trigger levels with BHAV V3 candle status card."""

with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

# Find start line: "// Watching card trigger levels"
start_idx = None
for i, ln in enumerate(lines):
    if '// Watching card trigger levels' in ln:
        start_idx = i
        break

if start_idx is None:
    print("ERROR: could not find '// Watching card trigger levels'")
    exit(1)

# Find end line: the closing "}" of if(!inT){ block
# Count brace depth starting from "if(!inT){"
brace_depth = 0
end_idx = None
for i in range(start_idx, min(start_idx + 50, len(lines))):
    ln = lines[i]
    if 'if(!inT){' in ln:
        brace_depth = 1
        continue
    if brace_depth > 0:
        brace_depth += ln.count('{') - ln.count('}')
        if brace_depth <= 0:
            end_idx = i
            break

if end_idx is None:
    print("ERROR: could not find closing brace of if(!inT) block")
    exit(1)

print(f"Replacing lines {start_idx+1}-{end_idx+1}")

new_block = """\
      // Watching card — BHAV V3 candle status
      if(!inT){
        const noEl=ge('pos-lock50-watch');
        if(noEl){
          const _pdh=parseFloat(hb.bhavPrevDayHigh||0);
          const _pdl=parseFloat(hb.bhavPrevDayLow||0);
          const _cn=parseInt(hb.bhavCandles||0);
          const _ctx=_pdh>0?(lp>_pdh?'ABOVE PDH':((_pdl>0&&lp<_pdl)?'BELOW PDL':'INSIDE')):'';
          const _ctxCol=_ctx==='ABOVE PDH'?'#c084fc':(_ctx==='BELOW PDL'?'#38bdf8':'#64748b');
          const _now=new Date();
          const _rm=_now.getMinutes();const _rs=_now.getSeconds();
          const _rem=(15-(_rm%15))*60-_rs;
          const _remFix=_rem<=0?_rem+900:_rem;
          const _remStr=Math.floor(_remFix/60)+':'+(_remFix%60<10?'0':'')+(_remFix%60);
          let _wh='';
          if(_pdh>0){
            _wh+='<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:7px">';
            _wh+='<span style="font-size:.7rem;color:#64748b">PDH&nbsp;<b style="color:#e2e8f0">'+_pdh.toFixed(0)+'</b></span>';
            _wh+='<span style="font-size:.7rem;color:#64748b">PDL&nbsp;<b style="color:#e2e8f0">'+_pdl.toFixed(0)+'</b></span>';
            if(_ctx) _wh+='<span style="font-size:.68rem;font-weight:700;color:'+_ctxCol+';background:'+_ctxCol+'22;padding:1px 7px;border-radius:4px">'+_ctx+'</span>';
            _wh+='</div>';
            _wh+='<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;font-size:.72rem;color:#64748b;flex-wrap:wrap">';
            if(lp>0) _wh+='<span>Spot&nbsp;<b style="color:#e2e8f0">'+lp.toFixed(0)+'</b></span><span style="color:#334155">&middot;</span>';
            _wh+='<span>Candle&nbsp;<b style="color:#e2e8f0">#'+(_cn+1)+'</b></span><span style="color:#334155">&middot;</span>';
            _wh+='<span>Next close&nbsp;<b style="color:#fbbf24">'+_remStr+'</b></span>';
            _wh+='</div>';
            const _stTxt=_ctx==='ABOVE PDH'?'PE fade if next candle closes above PDH':(_ctx==='BELOW PDL'?'CE fade if next candle closes below PDL':'No signal &#8212; price inside range');
            _wh+='<div style="font-size:.7rem;color:'+_ctxCol+';font-style:italic">&#8594;&nbsp;'+_stTxt+'</div>';
          } else {
            _wh='<span style="opacity:.4">Waiting for first 15-min candle&#8230;</span>';
          }
          noEl.innerHTML=_wh;
          _appendClosedTrades(noEl,d);
        }
      }
"""

lines[start_idx:end_idx+1] = [new_block]

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8', errors='replace') as f:
    f.writelines(lines)

print("server.js saved — watch card updated with BHAV V3 candle status")
