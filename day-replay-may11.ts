/**
 * day-replay-may11.ts — per-trade detail for May 11 all 3 strategies
 */
import * as KiteConnect from "kiteconnect";
import dotenv from "dotenv";
dotenv.config();

const kite = new (KiteConnect as any).KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

interface Candle { date: Date; open: number; high: number; low: number; close: number; }
interface S {
  inTrade: boolean; dir: "CE"|"PE"|null; entry: number; sl: number; refHigh: number;
  firstDone: boolean; reUsed: boolean; waitReEntry: boolean; isC1: boolean; peakProfit: number;
}
const fresh = (): S => ({ inTrade:false,dir:null,entry:0,sl:0,refHigh:0,
  firstDone:false,reUsed:false,waitReEntry:false,isC1:false,peakProfit:0 });

const BASE_SL=100, BUF=25, C1=3, CAP=350;
type TFn = (sl:number,e:number,d:"CE"|"PE",p:number)=>number;

const trailDefault: TFn = (sl,e,d,p) => {
  let l=0; if(p>=200)l=100; else if(p>=100)l=20;
  return d==="CE"?Math.max(sl,e+l):Math.min(sl,e-l);
};
const trailLock50: TFn = (sl,e,d,p) => {
  if(p<=100)return sl;
  return d==="CE"?Math.max(sl,e+(p-50)):Math.min(sl,e-(p-50));
};

function simDay(cs: Candle[], tfn: TFn, useWick: boolean, label: string) {
  let s=fresh(), prev:Candle|null=null, pts=0, dayLoss=0, trade=0;
  console.log("\n" + "─".repeat(70));
  console.log("  " + label);
  console.log("─".repeat(70));
  console.log(`  ${"Time".padEnd(6)} ${"Action".padEnd(10)} ${"Dir".padEnd(4)} ${"Entry".padStart(7)} ${"Exit/SL".padStart(8)} ${"Trade".padStart(8)} ${"Running".padStart(9)}`);
  console.log("  " + "─".repeat(66));

  for (const cur of cs) {
    if (!prev) { prev=cur; continue; }
    const ist = new Date(cur.date.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
    const h=ist.getHours(), m=ist.getMinutes();
    const t = `${h}:${String(m).padStart(2,"0")}`;
    const eod = h>15||(h===15&&m>=15);
    const bH = Math.max(prev.open,prev.close), bL = Math.min(prev.open,prev.close);
    if (dayLoss<=-CAP) { prev=cur; continue; }

    if (s.inTrade) {
      if (s.isC1) {
        s.isC1 = false;
        const p = s.dir==="CE" ? cur.close-s.entry : s.entry-cur.close;
        if (p < -C1) {
          pts -= C1; dayLoss -= C1; trade++;
          console.log(`  ${t.padEnd(6)} ${"C1-EXIT".padEnd(10)} ${(s.dir||"").padEnd(4)} ${s.entry.toFixed(0).padStart(7)} ${cur.close.toFixed(0).padStart(8)} ${("-"+C1+"pts").padStart(8)} ${(pts>=0?"+":"")+pts.toFixed(0)+"pts".padStart(9)}`);
          s=fresh(); prev=cur; continue;
        }
      }
      const slHit = useWick
        ? (s.dir==="CE" ? cur.low<=s.sl  : cur.high>=s.sl)
        : (s.dir==="CE" ? cur.close<=s.sl : cur.close>=s.sl);

      if (slHit) {
        const slPts = s.dir==="CE" ? s.sl-s.entry : s.entry-s.sl;
        pts += slPts; dayLoss += slPts; trade++;
        const pStr = (slPts>=0?"+":"")+slPts.toFixed(0)+"pts";
        const rStr = (pts>=0?"+":"")+pts.toFixed(0)+"pts";
        console.log(`  ${t.padEnd(6)} ${"SL-HIT".padEnd(10)} ${(s.dir||"").padEnd(4)} ${s.entry.toFixed(0).padStart(7)} ${s.sl.toFixed(0).padStart(8)} ${pStr.padStart(8)} ${rStr.padStart(9)}`);
        const bodyPast = s.dir==="CE" ? cur.close<s.sl : cur.close>s.sl;
        if (bodyPast && !s.reUsed) {
          const rev:"CE"|"PE" = s.dir==="CE"?"PE":"CE";
          const revSL = rev==="CE" ? cur.close-BASE_SL : cur.close+BASE_SL;
          console.log(`  ${t.padEnd(6)} ${"REVERSE".padEnd(10)} ${rev.padEnd(4)} ${cur.close.toFixed(0).padStart(7)} ${revSL.toFixed(0).padStart(8)} ${"".padStart(8)} ${"".padStart(9)}`);
          s={...fresh(),dir:rev,entry:cur.close,sl:revSL,refHigh:rev==="CE"?cur.high:cur.low,
             inTrade:true,firstDone:true,reUsed:true,isC1:true,peakProfit:0};
        } else {
          if (!s.reUsed) { s.inTrade=false; s.waitReEntry=true; }
          else { s.inTrade=false; s.firstDone=false; }
          s.peakProfit=0;
        }
        prev=cur; continue;
      }

      const hp = s.dir==="CE" ? cur.high-s.entry : s.entry-cur.low;
      if (hp > s.peakProfit) {
        s.peakProfit = hp;
        const newSL = tfn(s.sl, s.entry, s.dir!, s.peakProfit);
        if (newSL !== s.sl) {
          console.log(`  ${t.padEnd(6)} ${"TRAIL-SL".padEnd(10)} ${(s.dir||"").padEnd(4)} ${"peak:"+hp.toFixed(0).padStart(7)} ${"SL:"+s.sl.toFixed(0)+"→"+newSL.toFixed(0)}`);
          s.sl = newSL;
        }
      }
      if (eod) {
        const p = s.dir==="CE" ? cur.close-s.entry : s.entry-cur.close;
        pts+=p; trade++;
        const pStr = (p>=0?"+":"")+p.toFixed(0)+"pts";
        const rStr = (pts>=0?"+":"")+pts.toFixed(0)+"pts";
        console.log(`  ${t.padEnd(6)} ${"EOD-EXIT".padEnd(10)} ${(s.dir||"").padEnd(4)} ${s.entry.toFixed(0).padStart(7)} ${cur.close.toFixed(0).padStart(8)} ${pStr.padStart(8)} ${rStr.padStart(9)}`);
        s=fresh();
      }
    } else if (s.waitReEntry) {
      const hit = (s.dir==="CE"&&cur.close>s.refHigh)||(s.dir==="PE"&&cur.close<s.refHigh);
      if (hit) {
        const sl2 = s.dir==="CE" ? cur.close-BASE_SL : cur.close+BASE_SL;
        console.log(`  ${t.padEnd(6)} ${"RE-ENTRY".padEnd(10)} ${(s.dir||"").padEnd(4)} ${cur.close.toFixed(0).padStart(7)} ${"SL:"+sl2.toFixed(0).padStart(8)}`);
        s.entry=cur.close; s.sl=sl2; s.inTrade=true; s.waitReEntry=false; s.reUsed=true; s.isC1=true; s.peakProfit=0;
      }
    } else if (!s.firstDone && !eod) {
      if (cur.close > bH+BUF) {
        const sl2 = cur.close-BASE_SL;
        console.log(`  ${t.padEnd(6)} ${"ENTRY".padEnd(10)} ${"CE".padEnd(4)} ${cur.close.toFixed(0).padStart(7)} ${"SL:"+sl2.toFixed(0).padStart(8)}`);
        s={...fresh(),dir:"CE",entry:cur.close,sl:sl2,refHigh:cur.high,inTrade:true,firstDone:true,isC1:true,reUsed:false,peakProfit:0};
      } else if (cur.close < bL-BUF) {
        const sl2 = cur.close+BASE_SL;
        console.log(`  ${t.padEnd(6)} ${"ENTRY".padEnd(10)} ${"PE".padEnd(4)} ${cur.close.toFixed(0).padStart(7)} ${"SL:"+sl2.toFixed(0).padStart(8)}`);
        s={...fresh(),dir:"PE",entry:cur.close,sl:sl2,refHigh:cur.low,inTrade:true,firstDone:true,isC1:true,reUsed:false,peakProfit:0};
      }
    }
    prev=cur;
  }
  console.log("  " + "─".repeat(66));
  const rs = Math.round(pts*30*0.5);
  console.log(`  TOTAL: ${trade} trades | ${pts>=0?"+":""}${pts.toFixed(0)} pts | ₹${(rs>=0?"+":"")+Math.abs(rs).toLocaleString("en-IN")}`);
}

(async () => {
  const data: any[] = await kite.getHistoricalData(260105,"15minute","2026-05-11","2026-05-11",false) as any[];
  const cs = data.map((c:any) => {
    const raw = c.date??c[0];
    const d = raw instanceof Date ? raw : new Date(String(raw).replace(" ","T"));
    return { date:d, open:c.open??c[1], high:c.high??c[2], low:c.low??c[3], close:c.close??c[4] };
  });
  console.log(`\nBANKNIFTY May 11, 2026 — ${cs.length} candles (9:15 AM – 3:30 PM)`);
  simDay(cs, trailLock50,  true,  "A — LOCK50 INTRABAR  (old strategy)");
  simDay(cs, trailLock50,  false, "B — LOCK50 CANDLE-SL (new/live from today)");
  simDay(cs, trailDefault, false, "C — TRAIL");
})();
