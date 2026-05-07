import * as KiteConnect from "kiteconnect";
import dotenv from "dotenv";
dotenv.config();

const kite = new (KiteConnect as any).KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const args = process.argv.slice(2);
const getArg = (n: string, fb: string) => { const i = args.indexOf(`--${n}`); return i !== -1 ? args[i+1] : fb; };
const DATE = getArg("date", "2026-05-06");

const SL=100, BUF=25, C1=3, CAP=350, QTY=30;

interface C { date: Date; open: number; high: number; low: number; close: number; }
interface S { inTrade:boolean; dir:"CE"|"PE"|null; entry:number; sl:number; refHigh:number;
  firstDone:boolean; reUsed:boolean; waitReEntry:boolean; isC1:boolean; peakProfit:number; }
const fresh = (): S => ({ inTrade:false, dir:null, entry:0, sl:0, refHigh:0,
  firstDone:false, reUsed:false, waitReEntry:false, isC1:false, peakProfit:0 });

type TrailFn = (sl:number, entry:number, dir:"CE"|"PE", peak:number) => number;

const trailFn: TrailFn = (sl,entry,dir,peak) => {
  let lock = 0;
  if (peak >= 200) lock = 100; else if (peak >= 100) lock = 20;
  return dir === "CE" ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
};
const lock50Fn: TrailFn = (sl,entry,dir,peak) => {
  if (peak <= 100) return sl;
  const lock = peak - 50;
  return dir === "CE" ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
};

function sim(candles: C[], tfn: TrailFn, name: string) {
  let s = fresh(), prev: C|null = null, pts = 0, dayLoss = 0;
  const trades: string[] = [];

  for (const cur of candles) {
    if (!prev) { prev = cur; continue; }
    const ist = new Date(cur.date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const h = ist.getHours(), m = ist.getMinutes();
    const eod = h > 15 || (h === 15 && m >= 15);
    const bH = Math.max(prev.open, prev.close), bL = Math.min(prev.open, prev.close);
    const time = ist.toTimeString().slice(0, 5);
    if (dayLoss <= -CAP) { prev = cur; continue; }

    if (s.inTrade) {
      if (s.isC1) {
        s.isC1 = false;
        const p = s.dir === "CE" ? cur.close - s.entry : s.entry - cur.close;
        if (p < -C1) {
          pts -= C1; dayLoss -= C1;
          trades.push(`${time}  EXIT_C1   ${s.dir} | entry ${s.entry.toFixed(0)} → exit ${cur.close.toFixed(0)} | pts: -3 | running: ${pts.toFixed(0)}`);
          s = fresh(); prev = cur; continue;
        }
      }

      const slHit = s.dir === "CE" ? cur.low <= s.sl : cur.high >= s.sl;
      if (slHit) {
        const slPts = s.dir === "CE" ? s.sl - s.entry : s.entry - s.sl;
        pts += slPts; dayLoss += slPts;
        const bodyPast = s.dir === "CE" ? cur.close < s.sl : cur.close > s.sl;
        trades.push(`${time}  EXIT_SL   ${s.dir} | entry ${s.entry.toFixed(0)} sl ${s.sl.toFixed(0)} | pts: ${slPts.toFixed(0)} | running: ${pts.toFixed(0)}`);
        if (bodyPast && !s.reUsed) {
          const revDir: "CE"|"PE" = s.dir === "CE" ? "PE" : "CE";
          const revSL = revDir === "CE" ? cur.close - SL : cur.close + SL;
          trades.push(`${time}  REVERSE   ${revDir} | entry ${cur.close.toFixed(0)} sl ${revSL.toFixed(0)}`);
          s = { ...fresh(), dir:revDir, entry:cur.close, sl:revSL,
                refHigh:revDir==="CE"?cur.high:cur.low,
                inTrade:true, firstDone:true, reUsed:true, isC1:true, peakProfit:0 };
        } else {
          if (!s.reUsed) { s.inTrade = false; s.waitReEntry = true; }
          else { s.inTrade = false; s.firstDone = false; }
          s.peakProfit = 0;
        }
        prev = cur; continue;
      }

      // Update trail AFTER SL check
      const hp = s.dir === "CE" ? cur.high - s.entry : s.entry - cur.low;
      if (hp > s.peakProfit) {
        s.peakProfit = hp;
        const newSL = tfn(s.sl, s.entry, s.dir!, s.peakProfit);
        if (newSL !== s.sl) {
          trades.push(`${time}  SL_MOVED  ${s.dir} | peak ${s.peakProfit.toFixed(0)}pts → SL ${s.sl.toFixed(0)} → ${newSL.toFixed(0)}`);
          s.sl = newSL;
        }
      }

      if (eod) {
        const p = s.dir === "CE" ? cur.close - s.entry : s.entry - cur.close;
        pts += p; dayLoss += p;
        const rs = Math.round(p * QTY * 0.5);
        trades.push(`${time}  EXIT_EOD  ${s.dir} | entry ${s.entry.toFixed(0)} → exit ${cur.close.toFixed(0)} | pts: ${p.toFixed(0)} (Rs${rs>=0?"+":""}${rs}) | peak: ${s.peakProfit.toFixed(0)} sl_was: ${s.sl.toFixed(0)} | running: ${pts.toFixed(0)}`);
        s = fresh();
      }

    } else if (s.waitReEntry) {
      const hit = (s.dir==="CE" && cur.close > s.refHigh) || (s.dir==="PE" && cur.close < s.refHigh);
      if (hit) {
        const e = cur.close, sl = s.dir==="CE" ? e-SL : e+SL;
        s.entry=e; s.sl=sl; s.inTrade=true; s.waitReEntry=false; s.reUsed=true; s.isC1=true; s.peakProfit=0;
        trades.push(`${time}  RE-ENTRY  ${s.dir} | entry ${e.toFixed(0)} sl ${sl.toFixed(0)}`);
      }
    } else if (!s.firstDone && !eod) {
      if (cur.close > bH + BUF) {
        const e=cur.close, sl=e-SL;
        s={...fresh(),dir:"CE",entry:e,sl,refHigh:cur.high,inTrade:true,firstDone:true,isC1:true,reUsed:s.reUsed,peakProfit:0};
        trades.push(`${time}  ENTER     CE | entry ${e.toFixed(0)} sl ${sl.toFixed(0)}`);
      } else if (cur.close < bL - BUF) {
        const e=cur.close, sl=e+SL;
        s={...fresh(),dir:"PE",entry:e,sl,refHigh:cur.low,inTrade:true,firstDone:true,isC1:true,reUsed:s.reUsed,peakProfit:0};
        trades.push(`${time}  ENTER     PE | entry ${e.toFixed(0)} sl ${sl.toFixed(0)}`);
      }
    }
    prev = cur;
  }

  const rs = Math.round(pts * QTY * 0.5);
  const LINE = "─".repeat(70);
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${name}`);
  console.log(`${"═".repeat(70)}`);
  if (trades.length === 0) { console.log("  No trades today"); }
  else trades.forEach(t => console.log("  " + t));
  console.log(`  ${LINE}`);
  console.log(`  TOTAL: ${pts.toFixed(0)} pts  =  Rs ${rs >= 0 ? "+" : ""}${rs.toLocaleString("en-IN")}`);
}

(async () => {
  const data: any[] = await kite.getHistoricalData(260105, "15minute", DATE, DATE, false) as any[];
  const cs: C[] = data.map((c:any) => {
    const raw = c.date ?? c[0];
    const d = raw instanceof Date ? raw : new Date(String(raw).replace(" ", "T"));
    return { date:d, open:c.open??c[1], high:c.high??c[2], low:c.low??c[3], close:c.close??c[4] };
  });
  console.log(`\nBankNifty ${DATE} — ${cs.length} candles`);
  sim(cs, trailFn,  "TRAIL   — +100→lock+20,  +200→lock+100");
  sim(cs, lock50Fn, "LOCK50  — peak>100 → lock(peak−50) always");
})();
