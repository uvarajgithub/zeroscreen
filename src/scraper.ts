/**
 * scraper.ts — screener.in HTML scraper for ZeroScreen
 * Extracts full fundamentals for a given NSE symbol
 */

import https from "https";
import http from "http";

export interface Fundamentals {
  symbol:        string;
  companyName:   string | null;
  sector:        string | null;
  marketCap:     number | null;
  peRatio:       number | null;
  roce:          number | null;
  roe:           number | null;
  deRatio:       number | null;
  promoterPct:   number | null;
  eps:           number | null;
  bookValue:     number | null;
  dividendYield: number | null;
  currentRatio:  number | null;
  netProfits:    number[];   // oldest → newest, up to 5 years
  revenues:      number[];   // oldest → newest, up to 5 years
  allProfitable: boolean;
  profitUptrend: boolean;
  error:         string | null;
}

function fetchUrl(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
        "Accept":     "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer":    "https://www.screener.in/",
        ...extraHeaders,
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, extraHeaders).then(resolve).catch(reject);
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

function tableNums(html: string, label: string, maxCols = 6): number[] {
  const idx = html.indexOf(label);
  if (idx < 0) return [];
  const chunk = html.slice(idx, idx + 1500);
  const matches = [...chunk.matchAll(/<td[^>]*>\s*([−\-]?[\d,]+\.?\d*)\s*<\/td>/g)];
  return matches.slice(0, maxCols).map(m =>
    parseFloat(m[1].replace(/,/g, "").replace("−", "-"))
  );
}

function extractTopRatio(html: string, label: string): number | null {
  const idx = html.indexOf(label);
  if (idx < 0) return null;
  const chunk = html.slice(idx, idx + 500);
  const m = chunk.match(/<span class="number">([\d.,]+)<\/span>/);
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}

export async function fetchFundamentals(symbol: string): Promise<Fundamentals> {
  const result: Fundamentals = {
    symbol, companyName: null, sector: null, marketCap: null, peRatio: null,
    roce: null, roe: null, deRatio: null, promoterPct: null,
    eps: null, bookValue: null, dividendYield: null, currentRatio: null,
    netProfits: [], revenues: [], allProfitable: false, profitUptrend: false,
    error: null,
  };

  try {
    const url  = `https://www.screener.in/company/${encodeURIComponent(symbol)}/`;
    const html = await fetchUrl(url);

    if (!html || html.length < 3000) {
      result.error = "Empty response";
      return result;
    }
    if (html.includes("Page not found") || html.includes("404")) {
      result.error = "Not found on screener.in";
      return result;
    }

    // ── Company name ──────────────────────────────────────────────────────────
    const nameMatch = html.match(/<h1[^>]*class="[^"]*h2[^"]*"[^>]*>\s*([^<]+)\s*<\/h1>/)
      || html.match(/<title>([^|<]+)/);
    if (nameMatch) result.companyName = nameMatch[1].trim().replace(/\s+/g, " ");

    // ── Sector ────────────────────────────────────────────────────────────────
    const sectorMatch = html.match(/class="[^"]*company-links[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    if (sectorMatch) result.sector = sectorMatch[1].trim();

    // ── Market Cap ────────────────────────────────────────────────────────────
    const mcMatch = html.match(/Market Cap\s*<\/.*?>\s*<.*?>\s*([\d,]+)/);
    if (mcMatch) result.marketCap = parseFloat(mcMatch[1].replace(/,/g, ""));

    // ── P/E Ratio ─────────────────────────────────────────────────────────────
    result.peRatio = extractTopRatio(html, "Stock P/E");
    if (result.peRatio === null) result.peRatio = extractTopRatio(html, "P/E");

    // ── ROCE ──────────────────────────────────────────────────────────────────
    result.roce = extractTopRatio(html, "ROCE");

    // ── ROE ───────────────────────────────────────────────────────────────────
    result.roe = extractTopRatio(html, "ROE");

    // ── EPS ───────────────────────────────────────────────────────────────────
    result.eps = extractTopRatio(html, "EPS");

    // ── Book Value ────────────────────────────────────────────────────────────
    result.bookValue = extractTopRatio(html, "Book Value");

    // ── Dividend Yield ────────────────────────────────────────────────────────
    result.dividendYield = extractTopRatio(html, "Dividend Yield");

    // ── Current Ratio ─────────────────────────────────────────────────────────
    result.currentRatio = extractTopRatio(html, "Current Ratio");

    // ── Promoter Holding ──────────────────────────────────────────────────────
    const pm = html.match(/Promoter Holding:\s*([\d.]+)%/)
      || html.match(/Promoters\s*<\/.*?>\s*<.*?>\s*([\d.]+)/);
    if (pm) result.promoterPct = parseFloat(pm[1]);

    // ── Net Profit (last 5 years) ─────────────────────────────────────────────
    const np = tableNums(html, "Net Profit", 5);
    if (np.length >= 2) {
      result.netProfits    = np;
      result.allProfitable = np.every(v => v > 0);
      result.profitUptrend = np[np.length - 1] > np[np.length - 2];
    }

    // ── Revenue (Sales, last 5 years) ─────────────────────────────────────────
    const rev = tableNums(html, "Sales +", 5)
      || tableNums(html, "Revenue", 5);
    if (rev.length >= 2) result.revenues = rev;

    // ── D/E Ratio ─────────────────────────────────────────────────────────────
    const borrowings = tableNums(html, "Borrowings", 3);
    const equity     = tableNums(html, "Equity Capital", 3);
    const reserves   = tableNums(html, "Reserves", 3);

    if (borrowings.length > 0 && equity.length > 0 && reserves.length > 0) {
      const b = borrowings[borrowings.length - 1];
      const e = equity[equity.length - 1];
      const r = reserves[reserves.length - 1];
      const nw = e + r;
      if (nw > 0) result.deRatio = Math.round((b / nw) * 100) / 100;
    }

  } catch (e: any) {
    result.error = e.message || "Unknown error";
  }

  return result;
}
