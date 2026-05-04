"use strict";
/**
 * scraper.ts — screener.in HTML scraper for ZeroScreen
 * Extracts full fundamentals for a given NSE symbol
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchFundamentals = fetchFundamentals;
var https_1 = require("https");
var http_1 = require("http");
function fetchUrl(url, extraHeaders) {
    if (extraHeaders === void 0) { extraHeaders = {}; }
    return new Promise(function (resolve, reject) {
        var lib = url.startsWith("https") ? https_1.default : http_1.default;
        var req = lib.get(url, {
            headers: __assign({ "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36", "Accept": "text/html,application/xhtml+xml,*/*;q=0.9", "Accept-Language": "en-US,en;q=0.9", "Referer": "https://www.screener.in/" }, extraHeaders),
        }, function (res) {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchUrl(res.headers.location, extraHeaders).then(resolve).catch(reject);
                return;
            }
            var data = "";
            res.on("data", function (c) { return data += c; });
            res.on("end", function () { return resolve(data); });
        });
        req.setTimeout(25000, function () { req.destroy(); reject(new Error("Timeout")); });
        req.on("error", reject);
    });
}
function tableNums(html, label, maxCols) {
    if (maxCols === void 0) { maxCols = 6; }
    var idx = html.indexOf(label);
    if (idx < 0)
        return [];
    var chunk = html.slice(idx, idx + 1500);
    var matches = __spreadArray([], chunk.matchAll(/<td[^>]*>\s*([−\-]?[\d,]+\.?\d*)\s*<\/td>/g), true);
    return matches.slice(0, maxCols).map(function (m) {
        return parseFloat(m[1].replace(/,/g, "").replace("−", "-"));
    });
}
function extractTopRatio(html, label) {
    var idx = html.indexOf(label);
    if (idx < 0)
        return null;
    var chunk = html.slice(idx, idx + 500);
    var m = chunk.match(/<span class="number">([\d.,]+)<\/span>/);
    return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}
function fetchFundamentals(symbol) {
    return __awaiter(this, void 0, void 0, function () {
        var result, url, html, nameMatch, sectorMatch, raw, mcMatch, pm, np, rev, borrowings, equity, reserves, b, e, r, nw, hiMatch, loMatch, aboutRaw, incMatch, e_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    result = {
                        symbol: symbol,
                        companyName: null, sector: null, marketCap: null, peRatio: null,
                        roce: null, roe: null, deRatio: null, promoterPct: null,
                        eps: null, bookValue: null, dividendYield: null, currentRatio: null,
                        week52High: null, week52Low: null, about: null, incorporated: null,
                        netProfits: [], revenues: [], allProfitable: false, profitUptrend: false,
                        error: null,
                    };
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    url = "https://www.screener.in/company/".concat(encodeURIComponent(symbol), "/");
                    return [4 /*yield*/, fetchUrl(url)];
                case 2:
                    html = _c.sent();
                    if (!html || html.length < 3000) {
                        result.error = "Empty response";
                        return [2 /*return*/, result];
                    }
                    if (html.includes("Page not found") || html.includes("404")) {
                        result.error = "Not found on screener.in";
                        return [2 /*return*/, result];
                    }
                    nameMatch = html.match(/<h1[^>]*class="[^"]*h2[^"]*"[^>]*>\s*([^<]+)\s*<\/h1>/)
                        || html.match(/<title>([^|<]+)/);
                    if (nameMatch)
                        result.companyName = nameMatch[1].trim().replace(/\s+/g, " ");
                    sectorMatch = html.match(/class="[^"]*company-links[^"]*"[^>]*>[\s\S]*?<a[^>]*href="[^"]*sector[^"]*"[^>]*>([^<]+)<\/a>/) ||
                        html.match(/class="[^"]*company-links[^"]*"[^>]*>[\s\S]*?<a[^>]*href="[^"]*(industry|sector|peer)[^"]*"[^>]*>([^<]+)<\/a>/) ||
                        html.match(/Industry\s*<\/[^>]+>\s*<[^>]+>([^<]{3,50})</);
                    if (sectorMatch) {
                        raw = (sectorMatch[2] || sectorMatch[1]).trim();
                        // Reject garbage: bare numbers, [1], "edit about", single chars, URLs
                        if (raw.length >= 3 && !/^\[?\d+\]?$/.test(raw) && !/edit|about|login|http/i.test(raw)) {
                            result.sector = raw;
                        }
                    }
                    mcMatch = html.match(/Market Cap\s*<\/.*?>\s*<.*?>\s*([\d,]+)/);
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
                    pm = html.match(/Promoter Holding:\s*([\d.]+)%/)
                        || html.match(/Promoters\s*<\/.*?>\s*<.*?>\s*([\d.]+)/);
                    if (pm)
                        result.promoterPct = parseFloat(pm[1]);
                    np = tableNums(html, "Net Profit", 5);
                    if (np.length >= 2) {
                        result.netProfits = np;
                        result.allProfitable = np.every(function (v) { return v > 0; });
                        result.profitUptrend = np[np.length - 1] > np[np.length - 2];
                    }
                    rev = tableNums(html, "Sales +", 5)
                        || tableNums(html, "Revenue", 5);
                    if (rev.length >= 2)
                        result.revenues = rev;
                    borrowings = tableNums(html, "Borrowings", 3);
                    equity = tableNums(html, "Equity Capital", 3);
                    reserves = tableNums(html, "Reserves", 3);
                    if (borrowings.length > 0 && equity.length > 0 && reserves.length > 0) {
                        b = borrowings[borrowings.length - 1];
                        e = equity[equity.length - 1];
                        r = reserves[reserves.length - 1];
                        nw = e + r;
                        if (nw > 0)
                            result.deRatio = Math.round((b / nw) * 100) / 100;
                    }
                    hiMatch = html.match(/52W High\s*<\/[^>]+>\s*<[^>]+>\s*([\d,]+\.?\d*)/)
                        || html.match(/52 Week High[^\d]*([\d,]+\.?\d*)/);
                    if (hiMatch)
                        result.week52High = parseFloat(hiMatch[1].replace(/,/g, ""));
                    loMatch = html.match(/52W Low\s*<\/[^>]+>\s*<[^>]+>\s*([\d,]+\.?\d*)/)
                        || html.match(/52 Week Low[^\d]*([\d,]+\.?\d*)/);
                    if (loMatch)
                        result.week52Low = parseFloat(loMatch[1].replace(/,/g, ""));
                    aboutRaw = (_b = (_a = (html.match(/<div[^>]+class="[^"]*about[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/) ||
                        html.match(/<p[^>]+class="[^"]*sub[^"]*"[^>]*>([\s\S]*?)<\/p>/) ||
                        html.match(/<div[^>]+class="[^"]*company-info[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/) ||
                        html.match(/<meta[^>]+name="description"[^>]+content="([^"]{40,})"/))) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : null;
                    if (aboutRaw) {
                        result.about = aboutRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 1200);
                    }
                    incMatch = html.match(/[Ii]ncorporated\s+in\s+(\d{4})/) ||
                        html.match(/[Ii]ncorporated\s+on[^\d]*(\d{4})/) ||
                        html.match(/[Ff]ounded\s+in\s+(\d{4})/i) ||
                        html.match(/[Ee]stablished\s+in\s+(\d{4})/i);
                    if (incMatch)
                        result.incorporated = parseInt(incMatch[1], 10);
                    return [3 /*break*/, 4];
                case 3:
                    e_1 = _c.sent();
                    result.error = e_1.message || "Unknown error";
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, result];
            }
        });
    });
}
