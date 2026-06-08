const path = require('path');
const d=require(path.join(process.cwd(), '5year-backtest-result.json')).daily;
let peak=0, cum=0, maxDD=0;
for(const r of d){
  cum += r.bbPnL;
  if(cum > peak) peak = cum;
  const dd = peak - cum;
  if(dd > maxDD) maxDD = dd;
}
console.log('MaxDD pts:', maxDD.toFixed(0), '  Rs: Rs.' + Math.round(maxDD*15));
