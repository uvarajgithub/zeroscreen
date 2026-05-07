/**
 * backtest-v3.ts — Trail variants head-to-head
 * All start from BEST (body-past reverse + recovery + cap 350).
 * Goal: beat TRAIL (+₹23,85,118 over 5yr).
 *
 *  TRAIL    = current live: +100→lock+20, +200→lock+100  (baseline)
 *  T_TIGHT  = aggressive: +50→BE, +100→+50, +200→+150
 *  T_LOCK50 = lock in (peak-50)pts once peak>100  → never give back >50pts
 *  T_RATCHET= +100→+50, +200→+150, +300→+250   (50pt ratchet steps)
 *  T_TARGET = pure take-profit at +250pts (no trail, just exit at target)
 */
import * as KiteConnect from "kiteconnect";
import dotenv from "dotenv";
dotenv.config();

const args = process.argv.slice(2);
const getArg = (n: string, fb: string) => { const i = args.indexOf(`--${n}`); return i !== -1 ? args[i+1] : fb; };
const FROM = getArg("from", "2021-01-01");
const TO   = getArg("to",   "2026-04-30");
const QTY  = 30;

const kite = new (KiteConnect as any).KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

interface Candle { date: Date; open: number; high: number; low: number; close: number; }
interface S {
  inTrade: boolean; dir: "CE"|"PE"|null; entry: number; sl: number; refHigh: number;
  firstDone: boolean; reUsed: boolean; waitReEntry: boolean; isC1: boolean; peakProfit: number;
}
const fresh = (): S => ({ inTrade:false, dir:null, entry:0, sl:0, refHigh:0,
  firstDone:false, reUsed:false, waitReEntry:false, isC1:false, peakProfit:0 });

const BASE_SL=100, BUF=25, C1=3, CAP=350;

// Trail updater — returns updated SL (may be same as before)
type TrailFn = (sl: number, entry: number, dir: "CE"|"PE", peak: number) => number;

const trailNone:    TrailFn = (sl) => sl;  // no trail (used for T_TARGET)

const trailCurrent: TrailFn = (sl, entry, dir, peak) => {
  // +100 → lock +20, +200 → lock +100
  let lock = 0;
  if (peak >= 200) lock = 100;
  else if (peak >= 100) lock = 20;
  if (dir === "CE") return Math.max(sl, entry + lock);
  return Math.min(sl, entry - lock);
};

const trailTight: TrailFn = (sl, entry, dir, peak) => {
  // +50→BE, +100→+50, +200→+150
  let lock = 0;
  if (peak >= 200) lock = 150;
  else if (peak >= 100) lock = 50;
  else if (peak >= 50)  lock = 0;
  if (dir === "CE") return Math.max(sl, entry + lock);
  return Math.min(sl, entry - lock);
};

const trailLock50: TrailFn = (sl, entry, dir, peak) => {
  // Lock in (peak - 50)pts once peak > 100 (never give back more than 50pts)
  if (peak <= 100) return sl;
  const lock = peak - 50;
  if (dir === "CE") return Math.max(sl, entry + lock);
  return Math.min(sl, entry - lock);
};

const trailRatchet: TrailFn = (sl, entry, dir, peak) => {
  // 50pt ratchet steps: +100→+50, +200→+150, +300→+250, etc.
  let lock = 0;
  if (peak >= 300) lock = 250;
  else if (peak >= 200) lock = 150;
  else if (peak >= 100) lock = 50;
  if (dir === "CE") return Math.max(sl, entry + lock);
  return Math.min(sl, entry - lock);
};

function simDay(dayCandles: Candle[], trailFn: TrailFn, targetPts: number): number {
  let s = fresh(), prev: Candle|null = null, pts = 0, dayLoss = 0;

  for (const cur of dayCandles) {
    if (!prev) { prev = cur; continue; }
    const ist = new Date(cur.date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const h = ist.getHours(), m = ist.getMinutes();
    const eod = h > 15 || (h === 15 && m >= 15);
    const bH = Math.max(prev.open, prev.close), bL = Math.min(prev.open, prev.close);
    if (dayLoss <= -CAP) { prev = cur; continue; }

    if (s.inTrade) {
      // C1 early exit
      if (s.isC1) {
        s.isC1 = false;
        const p = s.dir === "CE" ? cur.close - s.entry : s.entry - cur.close;
        if (p < -C1) { pts -= C1; dayLoss -= C1; s = fresh(); prev = cur; continue; }
      }

      // Take profit target check (using candle high/low for intrabar)
      if (targetPts > 0) {
        const peakNow = s.dir === "CE" ? cur.high - s.entry : s.entry - cur.low;
        if (peakNow >= targetPts) {
          pts += targetPts; dayLoss += targetPts; s = fresh(); prev = cur; continue;
        }
      }

      // SL check FIRST — uses SL as set at end of previous candle (correct order)
      const slHit = s.dir === "CE" ? cur.low <= s.sl : cur.high >= s.sl;
      if (slHit) {
        const slPts = s.dir === "CE" ? s.sl - s.entry : s.entry - s.sl;
        pts += slPts; dayLoss += slPts;

        const bodyPast = s.dir === "CE" ? cur.close < s.sl : cur.close > s.sl;
        if (bodyPast && !s.reUsed) {
          const revDir: "CE"|"PE" = s.dir === "CE" ? "PE" : "CE";
          const revSL = revDir === "CE" ? cur.close - BASE_SL : cur.close + BASE_SL;
          s = { ...fresh(), dir:revDir, entry:cur.close, sl:revSL,
                refHigh: revDir === "CE" ? cur.high : cur.low,
                inTrade:true, firstDone:true, reUsed:true, isC1:true, peakProfit:0 };
        } else {
          if (!s.reUsed) { s.inTrade = false; s.waitReEntry = true; }
          else { s.inTrade = false; s.firstDone = false; }
          s.peakProfit = 0;
        }
        prev = cur; continue;
      }

      // Trail SL update AFTER SL check — effective next candle (matches strategy.ts)
      const hp = s.dir === "CE" ? cur.high - s.entry : s.entry - cur.low;
      if (hp > s.peakProfit) {
        s.peakProfit = hp;
        s.sl = trailFn(s.sl, s.entry, s.dir!, s.peakProfit);
      }

      // EOD exit
      if (eod) {
        const p = s.dir === "CE" ? cur.close - s.entry : s.entry - cur.close;
        pts += p; dayLoss += p; s = fresh();
      }

    } else if (s.waitReEntry) {
      const hit = (s.dir === "CE" && cur.close > s.refHigh) || (s.dir === "PE" && cur.close < s.refHigh);
      if (hit) {
        const e = cur.close, sl = s.dir === "CE" ? e - BASE_SL : e + BASE_SL;
        s.entry=e; s.sl=sl; s.inTrade=true; s.waitReEntry=false; s.reUsed=true; s.isC1=true; s.peakProfit=0;
      } else {
        const distAway = s.dir === "CE" ? s.refHigh - cur.close : cur.close - s.refHigh;
        if (distAway > 150) {
          s.waitReEntry = false;
          if (!eod) {
            if (cur.close > bH + BUF) {
              const e=cur.close, sl=e-BASE_SL;
              s={...fresh(),dir:"CE",entry:e,sl,refHigh:cur.high,inTrade:true,reUsed:true,firstDone:true,isC1:true,peakProfit:0};
            } else if (cur.close < bL - BUF) {
              const e=cur.close, sl=e+BASE_SL;
              s={...fresh(),dir:"PE",entry:e,sl,refHigh:cur.low,inTrade:true,reUsed:true,firstDone:true,isC1:true,peakProfit:0};
            } else { s.firstDone=false; s.reUsed=true; }
          }
        }
      }
    } else if (!s.firstDone && !eod) {
      if (cur.close > bH + BUF) {
        const e=cur.close, sl=e-BASE_SL;
        s={...fresh(),dir:"CE",entry:e,sl,refHigh:cur.high,inTrade:true,firstDone:true,isC1:true,reUsed:s.reUsed,peakProfit:0};
      } else if (cur.close < bL - BUF) {
        const e=cur.close, sl=e+BASE_SL;
        s={...fresh(),dir:"PE",entry:e,sl,refHigh:cur.low,inTrade:true,firstDone:true,isC1:true,reUsed:s.reUsed,peakProfit:0};
      }
    }
    prev = cur;
  }
  return pts;
}

async function fetchCandles(from: string, to: string): Promise<Candle[]> {
  const data: any[] = await kite.getHistoricalData(260105, "15minute", from, to, false) as any[];
  return data.map((c: any) => {
    const raw = c.date ?? c[0];
    const d = raw instanceof Date ? raw : new Date(String(raw).replace(" ", "T"));
    return { date:d, open:c.open??c[1], high:c.high??c[2], low:c.low??c[3], close:c.close??c[4] };
  });
}
function groupByDay(cs: Candle[]) {
  const m = new Map<string, Candle[]>();
  for (const c of cs) {
    const k = c.date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    if (!m.has(k)) m.set(k, []); m.get(k)!.push(c);
  }
  return m;
}
const inr = (pts: number) => { const r=Math.round(pts*QTY*0.5); return (r>=0?"+":"")+"\u20b9"+Math.abs(r).toLocaleString("en-IN"); };
const dif = (d: number)   => { const r=Math.round(d*QTY*0.5);  return (r>=0?"++":"--")+"\u20b9"+Math.abs(r).toLocaleString("en-IN"); };

(async () => {
  console.log("\nFetching 5yr BANKNIFTY 15min data...");
  const all: Candle[] = [];
  let cursor = new Date(FROM+"T00:00:00Z"); const end = new Date(TO+"T23:59:59Z");
  while (cursor <= end) {
    const ce = new Date(cursor); ce.setDate(ce.getDate()+59);
    if (ce > end) ce.setTime(end.getTime());
    const f=cursor.toISOString().slice(0,10), t=ce.toISOString().slice(0,10);
    process.stdout.write(`  ${f} -> ${t} ...`);
    try { const chunk=await fetchCandles(f,t); all.push(...chunk); console.log(` ${chunk.length} candles`); }
    catch (e:any) { console.log(` ERROR: ${e.message}`); }
    await new Promise(r=>setTimeout(r,350));
    cursor.setDate(cursor.getDate()+60);
  }
  if (!all.length) { console.error("\nNo candles."); process.exit(1); }

  const days = groupByDay(all);
  interface Row { trail:number; tight:number; lock50:number; ratchet:number; target:number; }
  const months = new Map<string,Row>();
  const years  = new Map<string,Row>();
  let tot: Row = { trail:0, tight:0, lock50:0, ratchet:0, target:0 };

  for (const [d, cs] of [...days.entries()].sort()) {
    if (cs.length < 3) continue;
    const r: Row = {
      trail:   simDay(cs, trailCurrent, 0),
      tight:   simDay(cs, trailTight,   0),
      lock50:  simDay(cs, trailLock50,  0),
      ratchet: simDay(cs, trailRatchet, 0),
      target:  simDay(cs, trailNone,    250),
    };
    tot.trail+=r.trail; tot.tight+=r.tight; tot.lock50+=r.lock50; tot.ratchet+=r.ratchet; tot.target+=r.target;
    const mo=d.slice(0,7), yr=d.slice(0,4);
    const me=months.get(mo)??{trail:0,tight:0,lock50:0,ratchet:0,target:0};
    me.trail+=r.trail; me.tight+=r.tight; me.lock50+=r.lock50; me.ratchet+=r.ratchet; me.target+=r.target;
    months.set(mo,me);
    const ye=years.get(yr)??{trail:0,tight:0,lock50:0,ratchet:0,target:0};
    ye.trail+=r.trail; ye.tight+=r.tight; ye.lock50+=r.lock50; ye.ratchet+=r.ratchet; ye.target+=r.target;
    years.set(yr,ye);
  }

  const LINE=  "=".repeat(110);
  const LINE2= "-".repeat(98);
  console.log("\n"+LINE);
  console.log("  TRAIL VARIANTS — head-to-head (all start from BEST: body-past reverse + recovery + cap 350)");
  console.log("  TRAIL    = current live:  +100→lock+20,  +200→lock+100");
  console.log("  T_TIGHT  = aggressive:    +50→BE,        +100→+50,    +200→+150");
  console.log("  T_LOCK50 = smart trail:   peak>100 → lock(peak-50)pts  (never lose >50pts of peak)");
  console.log("  T_RATCHET= 50pt ratchet:  +100→+50,      +200→+150,   +300→+250");
  console.log("  T_TARGET = pure target:   exit at +250pts (no trail)");
  console.log("  Qty: 30 · Rs15/pt · Entry: bodyBreak+25 · SL ±100pts");
  console.log(LINE);
  console.log("  "+"Month".padEnd(10)+
    "TRAIL Rs".padStart(12)+"TIGHT Rs".padStart(12)+"LOCK50 Rs".padStart(12)+
    "RATCHET Rs".padStart(12)+"TARGET Rs".padStart(12)+"BEST(of5)".padStart(12));
  console.log("  "+LINE2);

  const variants = ["trail","tight","lock50","ratchet","target"] as const;
  const monthWins: Record<string,number> = {trail:0,tight:0,lock50:0,ratchet:0,target:0};

  for (const [m, v] of [...months.entries()].sort()) {
    const winner = variants.reduce((a,b)=>v[a]>=v[b]?a:b);
    monthWins[winner]++;
    console.log("  "+m.padEnd(10)+
      inr(v.trail).padStart(12)+inr(v.tight).padStart(12)+inr(v.lock50).padStart(12)+
      inr(v.ratchet).padStart(12)+inr(v.target).padStart(12)+
      (" ← "+winner.toUpperCase()).padStart(14));
  }
  console.log("  "+LINE2);
  const tw=variants.reduce((a,b)=>tot[a]>=tot[b]?a:b);
  console.log("  "+"TOTAL".padEnd(10)+
    inr(tot.trail).padStart(12)+inr(tot.tight).padStart(12)+inr(tot.lock50).padStart(12)+
    inr(tot.ratchet).padStart(12)+inr(tot.target).padStart(12)+
    (" ← "+tw.toUpperCase()).padStart(14));

  console.log("\n"+LINE);
  console.log("  YEARLY SUMMARY");
  console.log(LINE);
  console.log("  "+"Year".padEnd(8)+
    "TRAIL Rs".padStart(14)+"TIGHT Rs".padStart(14)+"LOCK50 Rs".padStart(14)+
    "RATCHET Rs".padStart(14)+"TARGET Rs".padStart(14)+"WINNER".padStart(12));
  console.log("  "+LINE2);
  const yearWins: Record<string,number> = {trail:0,tight:0,lock50:0,ratchet:0,target:0};
  for (const [y, v] of [...years.entries()].sort()) {
    const winner = variants.reduce((a,b)=>v[a]>=v[b]?a:b);
    yearWins[winner]++;
    console.log("  "+y.padEnd(8)+
      inr(v.trail).padStart(14)+inr(v.tight).padStart(14)+inr(v.lock50).padStart(14)+
      inr(v.ratchet).padStart(14)+inr(v.target).padStart(14)+
      (" "+winner.toUpperCase()).padStart(12));
  }
  console.log("  "+LINE2);
  console.log("  "+"5-YR TOTAL".padEnd(8)+
    inr(tot.trail).padStart(14)+inr(tot.tight).padStart(14)+inr(tot.lock50).padStart(14)+
    inr(tot.ratchet).padStart(14)+inr(tot.target).padStart(14)+
    (" "+tw.toUpperCase()).padStart(12));

  console.log("\n"+LINE);
  console.log("  WIN COUNT (months):", Object.entries(monthWins).map(([k,n])=>`${k.toUpperCase()}:${n}`).join("  "));
  console.log("  WIN COUNT (years): ", Object.entries(yearWins).map(([k,n])=>`${k.toUpperCase()}:${n}`).join("  "));
  const overall = variants.reduce((a,b)=>tot[a]>=tot[b]?a:b);
  console.log(`\n  ★ WINNER: ${overall.toUpperCase()} = ${inr(tot[overall])}`);
  console.log(`  ★ vs TRAIL baseline: ${dif(tot[overall]-tot.trail)}`);
  console.log("");
})();
