const d = require('./5year-backtest-result.json');
const months = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'];
months.forEach(function(m) {
  var days = d.daily.filter(function(x) { return x.date.indexOf(m) === 0; });
  var total = days.reduce(function(s,x) { return s + x.bbPnL; }, 0);
  var wins = days.filter(function(x) { return x.bbPnL > 0; }).length;
  var loss = days.filter(function(x) { return x.bbPnL < 0; }).length;
  var nt = days.filter(function(x) { return x.bbPnL === 0; }).length;
  console.log(m + ': ' + days.length + ' days | PnL=' + total.toFixed(1) + ' pts | W:' + wins + ' L:' + loss + ' NT:' + nt);
});
console.log('\n--- All 5yr totals ---');
var all = d.daily;
var tot = all.reduce(function(s,x){return s+x.bbPnL;},0);
var w = all.filter(function(x){return x.bbPnL>0;}).length;
var l = all.filter(function(x){return x.bbPnL<0;}).length;
console.log('Total: '+all.length+' days | PnL='+tot.toFixed(1)+' pts | W:'+w+' L:'+l+' WR='+(w/(w+l)*100).toFixed(1)+'%');
