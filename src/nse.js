"use strict";
/**
 * nse.ts — NSE data fetcher for ZeroScreen
 * Fetches latest bhavcopy for price + volume of all EQ series stocks
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLatestBhavcopy = fetchLatestBhavcopy;
var https_1 = require("https");
var http_1 = require("http");
function fetchUrl(url, headers) {
    if (headers === void 0) { headers = {}; }
    return new Promise(function (resolve, reject) {
        var lib = url.startsWith("https") ? https_1.default : http_1.default;
        var req = lib.get(url, {
            headers: __assign({ "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36", "Accept": "*/*" }, headers),
        }, function (res) {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
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
function lastTradingDay() {
    var d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    d.setDate(d.getDate() - 1);
    while (d.getDay() === 0 || d.getDay() === 6)
        d.setDate(d.getDate() - 1);
    return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}
function bhavDate(iso) {
    var _a = iso.split("-"), y = _a[0], m = _a[1], dd = _a[2];
    return "".concat(dd).concat(m).concat(y); // DDMMYYYY
}
function fetchLatestBhavcopy() {
    return __awaiter(this, void 0, void 0, function () {
        var rows, offset, d, iso, bd, url, csv, lines, header, idx, i, cols, series, price, volume, dayHigh, dayLow, prevClose, changePct, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    rows = [];
                    offset = 0;
                    _a.label = 1;
                case 1:
                    if (!(offset < 5)) return [3 /*break*/, 6];
                    d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
                    d.setDate(d.getDate() - offset - 1);
                    while (d.getDay() === 0 || d.getDay() === 6)
                        d.setDate(d.getDate() - 1);
                    iso = d.toLocaleDateString("en-CA");
                    bd = bhavDate(iso);
                    url = "https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_".concat(bd, ".csv");
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, fetchUrl(url)];
                case 3:
                    csv = _a.sent();
                    if (!csv || csv.trim().length < 500)
                        return [3 /*break*/, 5];
                    lines = csv.trim().split("\n");
                    header = lines[0].split(",").map(function (h) { return h.trim().toUpperCase(); });
                    idx = {
                        sym: header.indexOf("SYMBOL"),
                        ser: header.indexOf("SERIES"),
                        cls: header.findIndex(function (h) { return h === "CLOSE_PRICE" || h === "CLOSE"; }),
                        hi: header.findIndex(function (h) { return h === "HIGH_PRICE" || h === "HIGH"; }),
                        lo: header.findIndex(function (h) { return h === "LOW_PRICE" || h === "LOW"; }),
                        prev: header.findIndex(function (h) { return h === "PREV_CLOSE" || h === "PREVCLOSE"; }),
                        vol: header.findIndex(function (h) { return h === "TTL_TRD_QNTY" || h === "VOLUME" || h === "TOTTRDQTY"; }),
                    };
                    if (idx.sym < 0 || idx.cls < 0 || idx.vol < 0)
                        return [3 /*break*/, 5];
                    for (i = 1; i < lines.length; i++) {
                        cols = lines[i].split(",");
                        if (!cols[idx.sym])
                            continue;
                        series = idx.ser >= 0 ? cols[idx.ser].trim() : "EQ";
                        if (series !== "EQ")
                            continue;
                        price = parseFloat(cols[idx.cls]);
                        volume = parseInt(cols[idx.vol], 10);
                        dayHigh = idx.hi >= 0 ? parseFloat(cols[idx.hi]) : price;
                        dayLow = idx.lo >= 0 ? parseFloat(cols[idx.lo]) : price;
                        prevClose = idx.prev >= 0 ? parseFloat(cols[idx.prev]) : price;
                        if (isNaN(price) || isNaN(volume))
                            continue;
                        changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
                        rows.push({
                            symbol: cols[idx.sym].trim(),
                            price: price,
                            volume: volume,
                            dayHigh: dayHigh,
                            dayLow: dayLow,
                            prevClose: prevClose,
                            changePct: Math.round(changePct * 100) / 100,
                        });
                    }
                    if (rows.length > 100) {
                        console.log("[NSE] Loaded ".concat(rows.length, " stocks from bhavcopy ").concat(iso));
                        return [2 /*return*/, rows];
                    }
                    return [3 /*break*/, 5];
                case 4:
                    e_1 = _a.sent();
                    console.warn("[NSE] Failed bhavcopy ".concat(iso, ": ").concat(e_1.message));
                    return [3 /*break*/, 5];
                case 5:
                    offset++;
                    return [3 /*break*/, 1];
                case 6:
                    console.warn("[NSE] Could not load any bhavcopy");
                    return [2 /*return*/, rows];
            }
        });
    });
}
