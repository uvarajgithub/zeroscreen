// patch_trade_history.js — replace 3 separate trade sections with 1 filtered table
const fs = require('fs');
const path = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(path, 'utf8');

// ── Find the block to replace ──────────────────────────────────────────────
// The Today sec div containing tt-body-lock50 + Recent History + Monthly Performance
// End: </div><!-- /panel-lock50 -->

// Find start: look for the sec div right before tt-body-lock50
const ttBodyIdx = s.indexOf('"tt-body-lock50"');
if (ttBodyIdx === -1) { console.error('ERROR: tt-body-lock50 not found'); process.exit(1); }
// Walk back to find the <div class="sec"> before it
const startIdx = s.lastIndexOf('\n      <!-- ──', ttBodyIdx);
const endMarker = '    </div><!-- /panel-lock50 -->';
const endIdx = s.indexOf(endMarker);

if (startIdx === -1) { console.error('ERROR: start marker not found'); process.exit(1); }
if (endIdx   === -1) { console.error('ERROR: end marker not found'); process.exit(1); }
console.log('Block:', s.slice(0,startIdx).split('\n').length, '->', s.slice(0,endIdx).split('\n').length);

// ── Replacement string ──────────────────────────────────────────────────────
// ALL ${ ... } inside backtick strings are ESCAPED as \${ so they stay literal
// and get evaluated at serve-time inside server.js (not at patch-run time here)
const replacement = `
      <!-- \u2500\u2500 Trade History (Daily / Weekly / Monthly) \u2500\u2500 -->
      <div style="display:flex;align-items:center;gap:8px;margin-top:1.5rem;margin-bottom:.6rem;flex-wrap:wrap">
        <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:1px;color:#8b949e;font-weight:700">Trade History</span>
        <div style="display:flex;gap:4px;margin-left:auto">
          <button id="th-btn-d" onclick="_thFilter('d')" style="padding:3px 12px;border-radius:5px;font-size:.72rem;font-weight:700;cursor:pointer;border:1px solid #7c3aed;background:rgba(124,58,237,.2);color:#a78bfa">Daily</button>
          <button id="th-btn-w" onclick="_thFilter('w')" style="padding:3px 12px;border-radius:5px;font-size:.72rem;font-weight:700;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-muted)">Weekly</button>
          <button id="th-btn-m" onclick="_thFilter('m')" style="padding:3px 12px;border-radius:5px;font-size:.72rem;font-weight:700;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-muted)">Monthly</button>
        </div>
        <span class="sec-count" id="th-count" style="margin:0"></span>
      </div>

      <!-- DAILY panel (default visible) -->
      <div id="th-panel-d">
        <div class="tw"><table class="tt">
          <thead><tr><th>Time</th><th>Dir</th><th>Buy Index</th><th>Symbol</th><th>Sell Index</th><th>Index P&amp;L</th><th>&#8377; P&amp;L</th><th>Reason</th><th>Dur</th></tr></thead>
          <tbody id="tt-body-lock50">
            \${closedToday2.length===0&&!inTrade2
              ? \`<tr><td colspan="9" class="tt-e">No closed trades today</td></tr>\`
              : [...closedToday2].reverse().map(t=>{
                  const d3=(t.direction||'').toLowerCase();
                  const pts=t.pnl??0; const rs=Math.round(pts*QTY_MULT2);
                  const reason=t.reasonExit||'\u2014';
                  const rTag=reason.toLowerCase().includes('sl')||reason.toLowerCase().includes('stop')?'rc-sl':reason.toLowerCase().includes('trail')||reason.toLowerCase().includes('early')?'rc-trail':'rc-eod';
                  const dur=t.duration?(t.duration<60?t.duration+'s':Math.round(t.duration/60)+'m'):'\u2014';
                  return \`<tr>
                    <td class="tc">\${fmtTime2(t.date)}</td>
                    <td><span class="db-badge \${d3}">\${t.direction||'\u2014'}</span></td>
                    <td class="mono">\${(t.entryPrice??0)>0?(t.entryPrice??0).toFixed(1):'\u2014'}</td>
                    <td class="tc mono">\${t.symbol||'\u2014'}</td>
                    <td class="mono">\${(t.exitPrice??0)>0?(t.exitPrice??0).toFixed(1):'\u2014'}</td>
                    <td class="\${pts>=0?'g':'r'}" style="font-weight:800">\${pts>=0?'+':''}\${pts.toFixed(0)} pts</td>
                    <td><span class="pnl-rs \${pts>=0?'g':'r'}">\${rs>=0?'+':'&#8722;'}&#8377;\${Math.abs(rs).toLocaleString('en-IN')}</span></td>
                    <td>\${reason!=='\u2014'?\`<span class="rc-b \${rTag}">\${reason}</span>\`:'\u2014'}</td>
                    <td class="tc">\${dur}</td>
                  </tr>\`;
                }).join('')
            }
          </tbody>
        </table></div>
      </div>

      <!-- WEEKLY panel -->
      <div id="th-panel-w" style="display:none">
        <div class="tw"><table class="tt">
          <thead><tr><th>Date</th><th>Dir</th><th>Buy Index</th><th>Sell Index</th><th>Index P&amp;L</th><th>&#8377; P&amp;L</th><th>Reason</th></tr></thead>
          <tbody id="tt-body-weekly">
            \${(()=>{
              const _7d=new Date(); _7d.setDate(_7d.getDate()-7);
              const wkT=an2.recentTrades.filter(t=>t.date&&new Date(t.date)>=_7d&&(t.exitPrice??0)>0);
              if(!wkT.length) return '<tr><td colspan="7" class="tt-e">No trades in last 7 days</td></tr>';
              return wkT.map(t=>{
                const d3=(t.direction||'').toLowerCase();
                const pts=t.pnl??0; const rs=Math.round(pts*QTY_MULT2);
                const reason=t.reasonExit||'\u2014';
                const rTag=reason.toLowerCase().includes('sl')?'rc-sl':reason.toLowerCase().includes('trail')||reason.toLowerCase().includes('early')?'rc-trail':'rc-eod';
                return \`<tr>
                  <td class="tc">\${t.date?fmtDate2(t.date):'\u2014'}</td>
                  <td><span class="db-badge \${d3}">\${t.direction||'\u2014'}</span></td>
                  <td class="mono">\${(t.entryPrice??0)>0?(t.entryPrice??0).toFixed(1):'\u2014'}</td>
                  <td class="mono">\${(t.exitPrice??0)>0?(t.exitPrice??0).toFixed(1):'\u2014'}</td>
                  <td class="\${pts>=0?'g':'r'}" style="font-weight:800">\${pts>=0?'+':''}\${pts.toFixed(0)} pts</td>
                  <td><span class="pnl-rs \${pts>=0?'g':'r'}">\${rs>=0?'+':'&#8722;'}&#8377;\${Math.abs(rs).toLocaleString('en-IN')}</span></td>
                  <td>\${reason!=='\u2014'?\`<span class="rc-b \${rTag}">\${reason}</span>\`:'\u2014'}</td>
                </tr>\`;
              }).join('');
            })()}
          </tbody>
        </table></div>
      </div>

      <!-- MONTHLY panel -->
      <div id="th-panel-m" style="display:none">
        <div class="tw"><table class="tt">
          <thead><tr><th>Month</th><th>&#8377; P&amp;L</th><th>Index P&amp;L</th><th>Trades</th><th>W/L</th><th>Win%</th></tr></thead>
          <tbody>
            \${!an2.monthly.length
              ? '<tr><td colspan="6" class="tt-e">No monthly data yet</td></tr>'
              : an2.monthly.map(m=>{
                  const [y,mo]=m.month.split('-');
                  const ml=new Date(parseInt(y),parseInt(mo)-1,1).toLocaleString('en-IN',{month:'long',year:'numeric'});
                  const rs=Math.round(m.pnl*QTY_MULT2);
                  return \`<tr>
                    <td style="font-weight:600">\${ml}</td>
                    <td class="\${m.pnl>=0?'g':'r'}" style="font-weight:800">\${rs>=0?'+':'&#8722;'}&#8377;\${Math.abs(rs).toLocaleString('en-IN')}</td>
                    <td class="\${m.pnl>=0?'g':'r'}">\${m.pnl>=0?'+':''}\${m.pnl.toFixed(0)} pts</td>
                    <td>\${m.trades}</td>
                    <td><span class="g">\${m.wins}W</span> / <span class="r">\${m.losses}L</span></td>
                    <td>\${m.trades>0?m.winRate+'%':'\u2014'}</td>
                  </tr>\`;
                }).join('')
            }
          </tbody>
        </table></div>
      </div>

      <script>
      (function(){
        function _thFilter(f){
          ['d','w','m'].forEach(function(x){
            var p=document.getElementById('th-panel-'+x);
            var b=document.getElementById('th-btn-'+x);
            if(p) p.style.display=(x===f)?'':'none';
            if(b){
              if(x===f){b.style.background='rgba(124,58,237,.2)';b.style.borderColor='#7c3aed';b.style.color='#a78bfa';}
              else{b.style.background='transparent';b.style.borderColor='';b.style.color='';}
            }
          });
          var rows=document.querySelectorAll('#th-panel-'+f+' tbody tr:not(.tt-e)');
          var cnt=document.getElementById('th-count');
          if(cnt) cnt.textContent=rows.length?'('+rows.length+' trades)':'';
        }
        window._thFilter=_thFilter;
        _thFilter('d');
      })();
      </script>

    </div><!-- /panel-lock50 -->`;

// ── Replace ────────────────────────────────────────────────────────────────
const old = s.slice(startIdx, endIdx + endMarker.length);
s = s.slice(0, startIdx) + replacement + s.slice(endIdx + endMarker.length);
fs.writeFileSync(path, s);
console.log('Done. Removed', old.length, 'chars, inserted', replacement.length, 'chars');
