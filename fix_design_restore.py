#!/usr/bin/env python3
"""Restore better card design + use watch-lvl-row pattern for BHAV V3 content."""

with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

changes = 0

for i, ln in enumerate(lines):

    # 1. Revert .watch-card to solid dark card (was changed to rgba purple)
    if '.watch-card{padding:18px 22px;background:rgba(124,58,237,0.07);border:1.5px solid rgba(124,58,237,0.22);border-radius:14px}' in ln:
        lines[i] = ln.replace(
            '.watch-card{padding:18px 22px;background:rgba(124,58,237,0.07);border:1.5px solid rgba(124,58,237,0.22);border-radius:14px}',
            '.watch-card{padding:18px 22px;background:var(--card);border:1.5px solid var(--border-c);border-radius:14px}'
        )
        print(f"  [1] .watch-card reverted at line {i+1}")
        changes += 1

    # 2. Fix .watch-title — softer, muted color (not bold bright white)
    if '.watch-title{font-size:.72rem;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:7px;color:#a78bfa;text-transform:uppercase;letter-spacing:.07em}' in ln:
        lines[i] = ln.replace(
            '.watch-title{font-size:.72rem;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:7px;color:#a78bfa;text-transform:uppercase;letter-spacing:.07em}',
            '.watch-title{font-size:.82rem;font-weight:600;margin-bottom:10px;display:flex;align-items:center;gap:8px;color:var(--muted)}'
        )
        print(f"  [2] .watch-title softened at line {i+1}")
        changes += 1

    # 3. Revert .pos-flat to solid dark card
    if '.pos-flat{background:rgba(124,58,237,0.07);border-color:rgba(124,58,237,0.22)}' in ln:
        lines[i] = ln.replace(
            '.pos-flat{background:rgba(124,58,237,0.07);border-color:rgba(124,58,237,0.22)}',
            '.pos-flat{background:var(--card);border-color:var(--border-c)}'
        )
        print(f"  [3] .pos-flat reverted at line {i+1}")
        changes += 1

    # 4. Add .watch-cnd-row (amber candle info row) after .watch-pe-row line
    if '.watch-pe-row{background:rgba(185,28,28,.08);border:1px solid rgba(239,68,68,.2)}' in ln:
        lines[i] = ln.rstrip('\n') + '\n    .watch-cnd-row{background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.18)}\n'
        print(f"  [4] .watch-cnd-row added after line {i+1}")
        changes += 1

    # 5. Revert .kpi-m to solid dark card
    if '.kpi-m{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:11px 13px}' in ln:
        lines[i] = ln.replace(
            '.kpi-m{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:11px 13px}',
            '.kpi-m{background:var(--card);border:1px solid var(--border-c);border-radius:10px;padding:11px 13px}'
        )
        print(f"  [5] .kpi-m reverted at line {i+1}")
        changes += 1

    # 6. Keep pos-ce darker (was original washed-out light blue — keep my darker version)
    # .pos-ce already updated to rgba(56,189,248,.12) — keep it, looks better

    # 7. Keep pos-pe darker (was original washed-out light red — keep my darker version)
    # .pos-pe already updated to rgba(192,132,252,.12) — keep it, looks better

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8', errors='replace') as f:
    f.writelines(lines)

print(f"\nDone — {changes} CSS rules updated\n--- Now updating watch card JS content to use row pattern ---")

# --- Now update the JS content in pos-lock50-watch to use row-based layout ---
with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

# Find the "Watching card — BHAV V3 candle status" block
start_idx = None
for i, ln in enumerate(lines):
    if '// Watching card' in ln and 'BHAV V3' in ln:
        start_idx = i
        break

if start_idx is None:
    print("ERROR: could not find BHAV V3 watch card block")
    exit(1)

# Find end of if(!inT){ block
brace_depth = 0
end_idx = None
for i in range(start_idx, min(start_idx + 60, len(lines))):
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
    print("ERROR: could not find closing brace")
    exit(1)

print(f"Replacing watch card JS block: lines {start_idx+1}-{end_idx+1}")

new_block = """\
      // Watching card — BHAV V3 candle status
      if(!inT){
        const noEl=ge('pos-lock50-watch');
        if(noEl){
          const _pdh=parseFloat(hb.bhavPrevDayHigh||0);
          const _pdl=parseFloat(hb.bhavPrevDayLow||0);
          const _cn=parseInt(hb.bhavCandles||0);
          const _ctx=_pdh>0?(lp>_pdh?'ABOVE PDH':((_pdl>0&&lp<_pdl)?'BELOW PDL':'INSIDE')):'';
          const _now=new Date();
          const _rm=_now.getMinutes();const _rs=_now.getSeconds();
          const _rem=(15-(_rm%15))*60-_rs;
          const _remFix=_rem<=0?_rem+900:_rem;
          const _remStr=Math.floor(_remFix/60)+':'+(_remFix%60<10?'0':'')+(_remFix%60);
          let _wh='';
          if(_pdh>0){
            // PDH row — pe-row style (above PDH → PE fade)
            const _pdhDist=lp>0?Math.abs(lp-_pdh).toFixed(0):'';
            const _pdhAbove=lp>_pdh;
            const _pdhCol=_pdhAbove?'#fca5a5':'#94a3b8';
            const _pdhNote=lp>0?(' <span style="color:'+_pdhCol+'">'+(_pdhAbove?'&#8593; '+_pdhDist+' above &rarr; PE fade':''+_pdhDist+' pts below')+'</span>'):'';
            _wh+='<div class="watch-lvl-row watch-pe-row"><span class="watch-lvl-dir" style="color:#fca5a5">PDH &#9660;</span><span class="watch-lvl-val">'+_pdh.toFixed(0)+'</span><span class="watch-lvl-dist">'+(_pdl>0?'PDL '+_pdl.toFixed(0):'')+''+_pdhNote+'</span></div>';
            // Candle row — amber style
            _wh+='<div class="watch-lvl-row watch-cnd-row"><span class="watch-lvl-dir" style="color:#fbbf24;min-width:28px">&#8987;</span><span class="watch-lvl-val" style="font-size:.85rem">Candle #'+(_cn+1)+'</span><span class="watch-lvl-dist" style="color:#94a3b8">next close <b style="color:#fbbf24">'+_remStr+'</b>'+(lp>0?' &middot; spot <b style="color:#e2e8f0">'+lp.toFixed(0)+'</b>':'')+'</span></div>';
          } else {
            _wh='<span style="opacity:.4;font-size:.78rem">Waiting for first 15-min candle&#8230;</span>';
          }
          noEl.innerHTML=_wh;
          _appendClosedTrades(noEl,d);
        }
      }
"""

lines[start_idx:end_idx+1] = [new_block]

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8', errors='replace') as f:
    f.writelines(lines)

print("Watch card JS updated with row-based layout")
print("Done!")
