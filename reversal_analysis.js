const C = [
  {t:'09:15',o:53600.4,h:53930,l:53447.75,c:53447.75},
  {t:'09:30',o:53454,h:53495.25,l:53194.25,c:53338.95},
  {t:'09:45',o:53341.2,h:53485.3,l:53255.65,c:53406.7},
  {t:'10:00',o:53408.05,h:53589.35,l:53380.05,c:53510.2},
  {t:'10:15',o:53510.45,h:53778.45,l:53496.8,c:53699.95},
  {t:'10:30',o:53692.45,h:53800.45,l:53657.9,c:53764.9},
  {t:'10:45',o:53762.05,h:53789.5,l:53502,c:53510.2},
  {t:'11:00',o:53507.65,h:53599.85,l:53492.1,c:53598.5},
  {t:'11:15',o:53596.1,h:53639.4,l:53564.6,c:53591},
  {t:'11:30',o:53588.9,h:53962.8,l:53575.15,c:53935.3},
  {t:'11:45',o:53939.9,h:54018.45,l:53844.6,c:53875.95},
  {t:'12:00',o:53874.65,h:54029.8,l:53874.65,c:54027.75},
  {t:'12:15',o:54025,h:54065.25,l:53943.05,c:53992.9},
  {t:'12:30',o:53988.9,h:53993,l:53697.25,c:53755.65},
  {t:'12:45',o:53754.75,h:54103.9,l:53742.6,c:54092.9},
  {t:'13:00',o:54088.5,h:54097.55,l:53933.55,c:53945.1},
  {t:'13:15',o:53944.6,h:53952.25,l:53791.35,c:53817.15},
  {t:'13:30',o:53807.1,h:53932.15,l:53806.55,c:53858.15},
  {t:'13:45',o:53856.15,h:53889.65,l:53755.35,c:53798.1},
  {t:'14:00',o:53797.05,h:53893.8,l:53755.2,c:53872.5},
  {t:'14:15',o:53868.3,h:53888.45,l:53743.05,c:53801.05},
  {t:'14:30',o:53801.2,h:53839.75,l:53703.75,c:53712.7},
  {t:'14:45',o:53713.25,h:53750.8,l:53646.8,c:53663.6},
  {t:'15:00',o:53664.3,h:53670.2,l:53404.75,c:53511.4},
  {t:'15:15',o:53511.4,h:53512.45,l:53385.45,c:53475.8},
];

// T2: CE at 53699.9
const t2e=53699.9, pk2=C[5];
console.log('=== T2 CE @ 53699.9 ===');
console.log('Peak candle 10:30: O:'+pk2.o+' H:'+pk2.h+' L:'+pk2.l+' C:'+pk2.c);
console.log('  Upper wick (H-C): '+(pk2.h-pk2.c).toFixed(1)+' pts  <- rejection at high');
console.log('  Body (C-O):       '+(pk2.c-pk2.o).toFixed(1)+' pts  <- still bullish body');
console.log('  Peak profit (H):  +'+(pk2.h-t2e).toFixed(0)+' pts');
console.log('  Candle close pnl: +'+(pk2.c-t2e).toFixed(0)+' pts');
console.log('Next candle 10:45: O:'+C[6].o+' H:'+C[6].h+' L:'+C[6].l+' C:'+C[6].c);
console.log('  Opened gap DOWN from 53764 to 53762 (only 2pts) - no warning');
console.log('  Then DUMPED to '+C[6].l+' = lost all gains in ONE candle');
console.log('  *** No visible reversal signal before the dump ***');
console.log();

// T7: PE at 53858.2
const t7e=53858.2;
console.log('=== T7 PE @ 53858.2 ===');
console.log('Entry candle 13:30: O:'+C[17].o+' H:'+C[17].h+' L:'+C[17].l+' C:'+C[17].c);
console.log('Peak candle 12:30:  O:'+C[13].o+' H:'+C[13].h+' L:'+C[13].l+' C:'+C[13].c);
console.log('  Peak profit (L):  +'+(t7e-C[13].l).toFixed(0)+' pts');
console.log('Reversal 12:45: O:'+C[14].o+' H:'+C[14].h+' L:'+C[14].l+' C:'+C[14].c);
console.log('  Range: '+(C[14].h-C[14].l).toFixed(0)+' pts!! Went BOTH ways in one candle');
console.log('  Body: closed at '+C[14].c+' vs entry '+t7e+' = '+(t7e-C[14].c).toFixed(0)+' pts against');
console.log();

// T9: PE at 53712.7
const t9e=53712.7;
console.log('=== T9 PE @ 53712.7 ===');
console.log('Candle | O        H        L        C        | closeP  lowerWick upperWick');
[C[21],C[22],C[23],C[24]].forEach(c=>{
  const cp=(t9e-c.c).toFixed(0).padStart(4);
  const lw=(c.c-c.l).toFixed(0).padStart(3);
  const uw=(c.h-c.c).toFixed(0).padStart(3);
  console.log(c.t+'  '+String(c.o).padEnd(8)+String(c.h).padEnd(8)+String(c.l).padEnd(8)+String(c.c).padEnd(8)+' | +'+cp+'  lWick:'+lw+'  uWick:'+uw);
});
console.log();
console.log('=== CONCLUSION ===');
console.log('T2: Reversal was INSTANT (1 candle, 260pt dump). Only live tick trailing could catch it.');
console.log('T7: Reversal was INSTANT (same candle went both ways 360pt range). Same - tick trailing only.');
console.log('T9: Trend was SUSTAINED across 3 candles. Candle-based trailing works here.');
console.log();
console.log('=== TWO DIFFERENT TRADE TYPES ===');
console.log('TYPE A - Flash reversal (T2, T7): peak reached + reverses in ONE candle');
console.log('  Solution: LIVE TICK TRAILING STOP (peak - 25)');
console.log('  T2: exit +76 instead of -100 (+176 pts saved)');
console.log('  T7: exit +78 instead of -100 (+178 pts saved)');
console.log();
console.log('TYPE B - Sustained trend (T9): move continues for multiple candles');  
console.log('  Solution: CANDLE CLOSE TRAILING (exit when candle close reverses 30pts from peak close)');
console.log('  T9: 15:00 candle closed at 53511 = +202 pts, 15:15 closed at 53475 = +237 pts');
console.log('  EOD is already optimal here');
console.log();
console.log('COMBINED STRATEGY: TICK TRAILING (peak-25) with EOD override');
console.log('  If tick trailing fires before 3:00 PM → exit');
console.log('  If still in trade at 3:00 PM → hold to EOD candle close');
