/**
 * nse.ts — NSE data fetcher for ZeroScreen
 * Fetches latest bhavcopy for price + volume of all EQ series stocks
 */

import https from "https";
import http from "http";

export interface BhavRow {
  symbol:    string;
  price:     number;
  volume:    number;
  dayHigh:   number;
  dayLow:    number;
  prevClose: number;
  changePct: number;
}

function fetchUrl(url: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "*/*",
        ...headers,
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
        return;
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    });
    req.setTimeout(25000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", reject);
  });
}

function lastTradingDay(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function bhavDate(iso: string): string {
  const [y, m, dd] = iso.split("-");
  return `${dd}${m}${y}`; // DDMMYYYY
}

export async function fetchLatestBhavcopy(): Promise<BhavRow[]> {
  const rows: BhavRow[] = [];

  // Try last 3 trading days in case today is holiday
  for (let offset = 0; offset < 5; offset++) {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    d.setDate(d.getDate() - offset - 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    const iso = d.toLocaleDateString("en-CA");
    const bd  = bhavDate(iso);

    const url = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${bd}.csv`;
    try {
      const csv = await fetchUrl(url);
      if (!csv || csv.trim().length < 500) continue;

      const lines  = csv.trim().split("\n");
      const header = lines[0].split(",").map(h => h.trim().toUpperCase());
      const idx = {
        sym:  header.indexOf("SYMBOL"),
        ser:  header.indexOf("SERIES"),
        cls:  header.findIndex(h => h === "CLOSE_PRICE" || h === "CLOSE"),
        hi:   header.findIndex(h => h === "HIGH_PRICE"  || h === "HIGH"),
        lo:   header.findIndex(h => h === "LOW_PRICE"   || h === "LOW"),
        prev: header.findIndex(h => h === "PREV_CLOSE"  || h === "PREVCLOSE"),
        vol:  header.findIndex(h => h === "TTL_TRD_QNTY"|| h === "VOLUME" || h === "TOTTRDQTY"),
      };
      if (idx.sym < 0 || idx.cls < 0 || idx.vol < 0) continue;

      for (let i = 1; i < lines.length; i++) {
        const cols   = lines[i].split(",");
        if (!cols[idx.sym]) continue;
        const series = idx.ser >= 0 ? cols[idx.ser].trim() : "EQ";
        if (series !== "EQ") continue;

        const price    = parseFloat(cols[idx.cls]);
        const volume   = parseInt(cols[idx.vol], 10);
        const dayHigh  = idx.hi   >= 0 ? parseFloat(cols[idx.hi])   : price;
        const dayLow   = idx.lo   >= 0 ? parseFloat(cols[idx.lo])   : price;
        const prevClose= idx.prev >= 0 ? parseFloat(cols[idx.prev]) : price;

        if (isNaN(price) || isNaN(volume)) continue;

        const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

        rows.push({
          symbol:    cols[idx.sym].trim(),
          price, volume, dayHigh, dayLow, prevClose,
          changePct: Math.round(changePct * 100) / 100,
        });
      }

      if (rows.length > 100) {
        console.log(`[NSE] Loaded ${rows.length} stocks from bhavcopy ${iso}`);
        return rows;
      }
    } catch (e: any) {
      console.warn(`[NSE] Failed bhavcopy ${iso}: ${e.message}`);
    }
  }

  console.warn("[NSE] Could not load any bhavcopy");
  return rows;
}
