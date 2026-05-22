const candles = [
  {t:'10:15',c:52976.7 },
  {t:'10:30',c:52960.8 },
  {t:'10:45',c:53016.35},
  {t:'11:00',c:53037.2 },
  {t:'11:15',c:53221.3 },
  {t:'11:30',c:53291.7 },
  {t:'11:45',c:53274.05},
  {t:'12:00',c:53321.7 },
  {t:'12:15',c:53255.85},
  {t:'12:30',c:53251.15},
  {t:'12:45',c:53257.25},
  {t:'13:00',c:53259.05},
  {t:'13:15',c:53213.5 },
  {t:'13:30',c:53100.15},
  {t:'13:45',c:53159.2 },
  {t:'14:00',c:53215.7 },
  {t:'14:15',c:53399.75},
];
const ENTRY = 53053.75;
const SL    = 52913.35; // C2 low

console.log('Strategy : CE @ 53054 | SL = C2 low 52913 | No Trail | Exit EOD');
console.log('-'.repeat(55));
for (const c of candles) {
  const pts = (c.c - ENTRY).toFixed(0);
  const hit = c.c <= SL;
  const eod = c.t === '14:15';
  const note = hit ? '  <-- SL HIT' : (eod ? '  <-- EOD EXIT' : '');
  console.log(' ' + c.t + ' | close=' + c.c.toFixed(0) + ' | pts=' + (parseFloat(pts)>=0?'+':'') + pts + note);
  if (hit || eod) {
    const rs = Math.round((c.c - ENTRY) * 15);
    console.log('');
    console.log(' EXIT : ' + c.t);
    console.log(' Pts  : ' + (parseFloat(pts)>=0?'+':'') + pts);
    console.log(' Rs   : ' + (rs>=0?'+':'') + rs.toLocaleString('en-IN'));
    break;
  }
}
