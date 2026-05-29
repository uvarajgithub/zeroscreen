'use strict';
const { KiteConnect } = require('kiteconnect');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

function bp(c){ return (c.high-c.low)>0?Math.round((c.close-c.open)/(c.high-c.low)*100):0; }

async function showDay(date, label) {
  const data = await kite.getHistoricalData(260105,'15minute',date,date,false);
  const candles = [];
  for(const c of data){
    const ist = new Date(new Date(c.date).getTime()+5.5*3600*1000);
    const tm  = ist.getUTCHours()*60+ist.getUTCMinutes();
    if(tm<9*60+15||tm>10*60+30) continue;
    candles.push({ t: ist.getUTCHours()+':'+String(ist.getUTCMinutes()).padStart(2,'0'),
      open:c.open, high:c.high, low:c.low, close:c.close, bp:bp(c) });
  }
  console.log('\n'+label);
  console.log('─'.repeat(70));
  candles.forEach((c,i) => {
    const dir = c.bp > 0 ? 'BULL' : c.bp < 0 ? 'BEAR' : 'DOJI';
    const tag = i===0?'  <-- BUGGY C0 (9:15 candle)':i===1?'  <-- CORRECT C0 (9:30 candle, live sees)':'';
    console.log(`  [${c.t}] O:${c.open} H:${c.high} L:${c.low} C:${c.close}  body:${c.bp}%  ${dir}${tag}`);
  });
}

async function main(){
  await showDay('2026-05-13','May 13 — Buggy:+620pts  Fixed:FLAT');
  await showDay('2026-05-26','May 26 — Buggy:+354pts  Fixed:-150pts SL');
}
main().catch(e=>console.error(e.message));
