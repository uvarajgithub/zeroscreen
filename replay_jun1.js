const { createDrishtiState, findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail } = require('./dist/src/drishti_strategy');
// June 1 2026 candles — C0=9:30close, C1=9:45close...
// highs/lows are approximate from context (open~prev_close, high=max seen, low=min seen)
const candles = [
  {open:53495.1,high:53775.6,low:53494.8,close:53671},     // C0 9:30
  {open:54036.75,high:54496.75,low:53966.05,close:54273},   // C1 9:45
  {open:54273,high:54365.6,low:54055.7,close:54099.55},     // C2 10:00
  {open:54099.55,high:54236.65,low:54017.5,close:54061.25}, // C3 10:15
  {open:54061.25,high:54130.3,low:53849.05,close:53905.3},  // C4 10:30 (LIVE ENTRY)
  {open:53905.3,high:54000.5,low:53880.5,close:53936.1},    // C5 10:45
  {open:53936.1,high:54200,low:53900,close:54059.55},       // C6 11:00
  {open:54059.55,high:54200,low:53950,close:54142.8},       // C7 11:15
  {open:54142.8,high:54200,low:53950,close:54142.8},        // C8 11:30
  {open:54142.8,high:54200,low:53800,close:54059.55},       // C9 11:45 (from candle log idx:9)
  {open:54059.55,high:54100,low:53800,close:54046.55},      // C10 12:00
  {open:54046.55,high:54100,low:53750,close:53935.55},      // C11 12:15 (idx:11)
  {open:53935.55,high:53990,low:53800,close:53936.3},       // C12 12:30 (idx:12)
  {open:53936.3,high:53990,low:53750,close:53869.65},       // C13 12:45 (idx:13)
  {open:53869.65,high:53900,low:53750,close:53848.4},       // C14 13:00 (idx:14)
  {open:53848.4,high:53880,low:53700,close:53812.75},       // C15 13:15 (idx:15)
  {open:53812.75,high:53850,low:53580,close:53666.2},       // C16 13:30 (idx:16)
  {open:53666.2,high:53800,low:53600,close:53733.7},        // C17 13:45 (idx:17)
  {open:53733.7,high:53800,low:53600,close:53726.2},        // C18 14:00 (idx:18)
  {open:53726.2,high:53780,low:53600,close:53682.2},        // C19 14:15 (idx:19)
  {open:53682.2,high:53700,low:53500,close:53586.8},        // C20 14:30 (idx:20)
  {open:53586.8,high:53620,low:53400,close:53525.9},        // C21 14:45 (idx:21)
  {open:53525.9,high:53680,low:53400,close:53596.8},        // C22 15:00 (idx:22)
  {open:53596.8,high:53700,low:53550,close:53671}           // C23 15:15 (idx:23)
];
// prevDay with PDH=55184.45, PDL=54116.15
const prevDay=[{open:55000,high:55184.45,low:54116.15,close:55100}];

let state=createDrishtiState(), dayPts=0, trades=[];
for(let i=0;i<candles.length;i++){
  const today=candles.slice(0,i+1);
  const c=candles[i];
  if(state.inTrade){
    const isEOD=(i===candles.length-1);
    const t=updateDrishtiTrail(state,c,isEOD);
    state.peakPts=t.peakPts; state.trailStop=t.trailStop;
    const favLow=(state.dir==='PE'?state.entry-c.low:c.high-state.entry).toFixed(1);
    console.log('  C'+i+' close='+c.close+' closePts='+((state.dir==='PE'?state.entry-c.close:c.close-state.entry)).toFixed(1)+' peak='+t.peakPts.toFixed(1)+' trail='+t.trailStop.toFixed(1)+' favLow='+favLow);
    if(t.action!=='HOLD'){
      dayPts+=t.pts;
      trades.push({C:i,dir:state.dir,entry:+state.entry.toFixed(1),exitClose:+c.close.toFixed(1),pts:+t.pts.toFixed(1),reason:t.action});
      state.lastExitPts=t.pts; state.lastExitDir=state.dir; state.lastExitIdx=i;
      state.inTrade=false; state.dir=null; state.peakPts=0; state.trailStop=-150;
      console.log('EXIT  C'+i+' '+t.action+' pts='+t.pts.toFixed(1));
    }
  } else {
    let sig=null;
    if(!state.firstDone){
      sig=findDrishtiEntry(today,prevDay);
      if(sig) console.log('  C'+i+' firstEntry check: idx='+sig.idx+' side='+sig.side+' reason='+sig.reason);
    } else {
      sig=findDrishtiReEntry(today,state.lastExitIdx,state.lastExitDir,true);
      if(sig) console.log('  C'+i+' reEntry check: idx='+sig.idx+' side='+sig.side+' reason='+sig.reason);
    }
    if(sig && sig.idx===i){
      state.inTrade=true; state.dir=sig.side; state.entry=c.close;
      state.entryIdx=i; state.peakPts=0; state.trailStop=-150;
      state.firstDone=true;
      console.log('ENTRY C'+i+' '+sig.side+' @'+c.close+' reason='+sig.reason);
    }
  }
}
if(state.inTrade){
  const t=updateDrishtiTrail(state,candles[candles.length-1],true);
  dayPts+=t.pts;
  trades.push({C:'EOD',pts:+t.pts.toFixed(1)});
  console.log('EXIT EOD pts='+t.pts.toFixed(1));
}
console.log('\n=== RESULT ===');
console.log('Total: '+dayPts.toFixed(1)+' pts');
trades.forEach(t=>console.log('Trade:',JSON.stringify(t)));
