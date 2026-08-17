"use strict";
/**
 * scraper.ts — screener.in HTML scraper for ZeroScreen
 * Extracts full fundamentals for a given NSE symbol
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchFundamentals = fetchFundamentals;
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
function fetchUrl(url, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith("https") ? https_1.default : http_1.default;
        const req = lib.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://www.screener.in/",
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
function tableNums(html, label, maxCols = 6) {
    const idx = html.indexOf(label);
    if (idx < 0)
        return [];
    const chunk = html.slice(idx, idx + 1500);
    const matches = [...chunk.matchAll(/<td[^>]*>\s*([−\-]?[\d,]+\.?\d*)\s*<\/td>/g)];
    return matches.slice(0, maxCols).map(m => parseFloat(m[1].replace(/,/g, "").replace("−", "-")));
}
function extractTopRatio(html, label) {
    const idx = html.indexOf(label);
    if (idx < 0)
        return null;
    const chunk = html.slice(idx, idx + 500);
    const m = chunk.match(/<span class="number">([\d.,]+)<\/span>/);
    return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}
async function fetchFundamentals(symbol) {
    var _a, _b;
    const result = {
        symbol, companyName: null, sector: null, marketCap: null, peRatio: null,
        roce: null, roe: null, deRatio: null, promoterPct: null,
        eps: null, bookValue: null, dividendYield: null, currentRatio: null,
        week52High: null, week52Low: null, about: null, incorporated: null,
        netProfits: [], revenues: [], allProfitable: false, profitUptrend: false,
        error: null,
    };
    try {
        const url = `https://www.screener.in/company/${encodeURIComponent(symbol)}/`;
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
        if (nameMatch)
            result.companyName = nameMatch[1].trim().replace(/\s+/g, " ");
        // ── Sector ────────────────────────────────────────────────────────────────
        // screener.in puts sector/industry links in .company-links or .breadcrumbs
        const sectorMatch = html.match(/class="[^"]*company-links[^"]*"[^>]*>[\s\S]*?<a[^>]*href="[^"]*sector[^"]*"[^>]*>([^<]+)<\/a>/) ||
            html.match(/class="[^"]*company-links[^"]*"[^>]*>[\s\S]*?<a[^>]*href="[^"]*(industry|sector|peer)[^"]*"[^>]*>([^<]+)<\/a>/) ||
            html.match(/Industry\s*<\/[^>]+>\s*<[^>]+>([^<]{3,50})</);
        if (sectorMatch) {
            const raw = (sectorMatch[2] || sectorMatch[1]).trim();
            // Reject garbage: bare numbers, [1], "edit about", single chars, URLs
            if (raw.length >= 3 && !/^\[?\d+\]?$/.test(raw) && !/edit|about|login|http/i.test(raw)) {
                result.sector = raw;
            }
        }
        // ── Market Cap ────────────────────────────────────────────────────────────
        const mcMatch = html.match(/Market Cap\s*<\/.*?>\s*<.*?>\s*([\d,]+)/);
        if (mcMatch)
            result.marketCap = parseFloat(mcMatch[1].replace(/,/g, ""));
        // ── P/E Ratio ─────────────────────────────────────────────────────────────
        result.peRatio = extractTopRatio(html, "Stock P/E");
        if (result.peRatio === null)
            result.peRatio = extractTopRatio(html, "P/E");
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
        if (pm)
            result.promoterPct = parseFloat(pm[1]);
        // ── Net Profit (last 5 years) ─────────────────────────────────────────────
        const np = tableNums(html, "Net Profit", 5);
        if (np.length >= 2) {
            result.netProfits = np;
            result.allProfitable = np.every(v => v > 0);
            result.profitUptrend = np[np.length - 1] > np[np.length - 2];
        }
        // ── Revenue (Sales, last 5 years) ─────────────────────────────────────────
        const rev = tableNums(html, "Sales +", 5)
            || tableNums(html, "Revenue", 5);
        if (rev.length >= 2)
            result.revenues = rev;
        // ── D/E Ratio ─────────────────────────────────────────────────────────────
        const borrowings = tableNums(html, "Borrowings", 3);
        const equity = tableNums(html, "Equity Capital", 3);
        const reserves = tableNums(html, "Reserves", 3);
        if (borrowings.length > 0 && equity.length > 0 && reserves.length > 0) {
            const b = borrowings[borrowings.length - 1];
            const e = equity[equity.length - 1];
            const r = reserves[reserves.length - 1];
            const nw = e + r;
            if (nw > 0)
                result.deRatio = Math.round((b / nw) * 100) / 100;
        }
        // ── 52-Week High / Low ────────────────────────────────────────────────────
        const hiMatch = html.match(/52W High\s*<\/[^>]+>\s*<[^>]+>\s*([\d,]+\.?\d*)/)
            || html.match(/52 Week High[^\d]*([\d,]+\.?\d*)/);
        if (hiMatch)
            result.week52High = parseFloat(hiMatch[1].replace(/,/g, ""));
        const loMatch = html.match(/52W Low\s*<\/[^>]+>\s*<[^>]+>\s*([\d,]+\.?\d*)/)
            || html.match(/52 Week Low[^\d]*([\d,]+\.?\d*)/);
        if (loMatch)
            result.week52Low = parseFloat(loMatch[1].replace(/,/g, ""));
        // ── Company About / Description ───────────────────────────────────────────
        // Try several screener.in patterns for the about paragraph
        const aboutRaw = (_b = (_a = (html.match(/<div[^>]+class="[^"]*about[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/) ||
            html.match(/<p[^>]+class="[^"]*sub[^"]*"[^>]*>([\s\S]*?)<\/p>/) ||
            html.match(/<div[^>]+class="[^"]*company-info[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/) ||
            html.match(/<meta[^>]+name="description"[^>]+content="([^"]{40,})"/))) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : null;
        if (aboutRaw) {
            result.about = aboutRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 1200);
        }
        // ── Incorporation year ────────────────────────────────────────────────────
        const incMatch = html.match(/[Ii]ncorporated\s+in\s+(\d{4})/) ||
            html.match(/[Ii]ncorporated\s+on[^\d]*(\d{4})/) ||
            html.match(/[Ff]ounded\s+in\s+(\d{4})/i) ||
            html.match(/[Ee]stablished\s+in\s+(\d{4})/i);
        if (incMatch)
            result.incorporated = parseInt(incMatch[1], 10);
    }
    catch (e) {
        result.error = e.message || "Unknown error";
    }
    return result;
}
