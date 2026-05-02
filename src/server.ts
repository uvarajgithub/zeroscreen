/**
 * server.ts — ZeroScreen Express app
 *
 * Routes:
 *   GET  /                      → screener (filter page)
 *   GET  /stock/:symbol         → stock detail page
 *   GET  /watchlists            → all watchlists
 *   GET  /watchlists/:id        → single watchlist
 *   POST /watchlists            → create watchlist
 *   POST /watchlists/:id/add    → add stock
 *   POST /watchlists/:id/remove → remove stock
 *   DELETE /watchlists/:id      → delete watchlist
 *
 *   API (JSON):
 *   GET  /api/screen            → filtered stocks JSON
 *   GET  /api/stock/:symbol     → single stock JSON
 *   GET  /api/stats             → DB stats
 *   POST /api/refresh/prices    → trigger price refresh
 *   POST /api/refresh/stock/:symbol → re-scrape one stock
 */

import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import {
  screenStocks, getStock, getWatchlists, getWatchlist, createWatchlist,
  addToWatchlist, removeFromWatchlist, deleteWatchlist, getDbStats,
  getSectors, ScreenerFilter, initDb, upsertStock,
} from "./db";
import { refreshPrices, refreshFundamentals, startScheduler } from "./scheduler";
import { fetchFundamentals } from "./scraper";

const app  = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static(path.join(__dirname, "..", "public")));

// ── Template helper ────────────────────────────────────────────────────────────
function readView(name: string): string {
  return fs.readFileSync(path.join(__dirname, "..", "views", name), "utf8");
}

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function fmtCr(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e5) return (n / 1e5).toFixed(1) + " Lcr";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "k Cr";
  return n.toFixed(0) + " Cr";
}

function fmtVol(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1e7) return (v / 1e7).toFixed(1) + "Cr";
  if (v >= 1e5) return (v / 1e5).toFixed(1) + "L";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(v);
}

function roceColor(r: number | null): string {
  if (r == null) return "#888";
  if (r >= 25)  return "#2ecc71";
  if (r >= 15)  return "#82e0aa";
  if (r >= 8)   return "#f39c12";
  return "#e74c3c";
}

function deColor(d: number | null): string {
  if (d == null) return "#888";
  if (d === 0)  return "#2ecc71";
  if (d <= 0.3) return "#82e0aa";
  if (d <= 1.0) return "#f39c12";
  return "#e74c3c";
}

function changeColor(c: number | null): string {
  if (c == null) return "#888";
  return c >= 0 ? "#2ecc71" : "#e74c3c";
}

// ── Nav HTML ──────────────────────────────────────────────────────────────────
function nav(active: string): string {
  const links = [
    ["screener", "/", "🔍 Screener"],
    ["watchlists", "/watchlists", "⭐ Watchlists"],
  ];
  return `<nav class="topnav">
    <span class="brand">ZeroScreen</span>
    ${links.map(([key, href, label]) =>
      `<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`
    ).join("")}
    <span class="db-stats" id="db-stats">Loading...</span>
  </nav>`;
}

// ── GET / — Screener ───────────────────────────────────────────────────────────
app.get("/", async (req: Request, res: Response) => {
  const f: ScreenerFilter = {
    minRoce:     req.query.minRoce     ? parseFloat(req.query.minRoce as string)     : undefined,
    maxRoce:     req.query.maxRoce     ? parseFloat(req.query.maxRoce as string)     : undefined,
    maxDe:       req.query.maxDe       ? parseFloat(req.query.maxDe as string)       : undefined,
    minPromoter: req.query.minPromoter ? parseFloat(req.query.minPromoter as string) : undefined,
    maxPe:       req.query.maxPe       ? parseFloat(req.query.maxPe as string)       : undefined,
    minPe:       req.query.minPe       ? parseFloat(req.query.minPe as string)       : undefined,
    minPrice:    req.query.minPrice    ? parseFloat(req.query.minPrice as string)    : undefined,
    maxPrice:    req.query.maxPrice    ? parseFloat(req.query.maxPrice as string)    : undefined,
    minVolume:   req.query.minVolume   ? parseInt(req.query.minVolume as string, 10) : undefined,
    minMarketCap:req.query.minMc       ? parseFloat(req.query.minMc as string)       : undefined,
    allProfitable: req.query.allProfit === "1",
    profitUptrend: req.query.uptrend  === "1",
    sector:      req.query.sector      ? req.query.sector as string                  : undefined,
    sortBy:      (req.query.sortBy as string) || "roce",
    sortDir:     (req.query.sortDir as "asc" | "desc") || "desc",
    limit:       100,
  };

  const hasFilters = Object.values(req.query).some(v => v !== "");
  const stocks = await (hasFilters ? screenStocks(f) : screenStocks({ sortBy: "roce", sortDir: "desc", limit: 50 }));
  const sectors = await getSectors();

  const rows = stocks.map(s => `
    <tr>
      <td><a href="/stock/${s.symbol}" class="sym-link">${s.symbol}</a></td>
      <td class="company-name">${s.company_name || "—"}</td>
      <td>${s.sector || "—"}</td>
      <td>₹${fmt(s.price, 2)}</td>
      <td style="color:${changeColor(s.change_pct)}">${s.change_pct != null ? (s.change_pct >= 0 ? "+" : "") + fmt(s.change_pct, 2) + "%" : "—"}</td>
      <td>${fmtVol(s.volume)}</td>
      <td style="color:${roceColor(s.roce)}">${fmt(s.roce)}%</td>
      <td>${fmt(s.roe)}%</td>
      <td style="color:${deColor(s.de_ratio)}">${s.de_ratio === 0 ? "Debt-free 💎" : fmt(s.de_ratio)}</td>
      <td>${fmt(s.promoter_pct)}%</td>
      <td>${fmt(s.pe_ratio, 1)}</td>
      <td>${fmtCr(s.market_cap)}</td>
      <td>${s.all_profitable ? "✅" : "❌"} ${s.profit_uptrend ? "↑" : "↓"}</td>
    </tr>`).join("");

  const sectorOptions = sectors.map(s =>
    `<option value="${s}" ${f.sector === s ? "selected" : ""}>${s}</option>`
  ).join("");

  const q = req.query;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ZeroScreen — NSE Stock Screener</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("screener")}
  <div class="container">
    <h1>NSE Stock Screener</h1>
    <form class="filter-form" method="GET" action="/">
      <div class="filter-grid">
        <div class="filter-group">
          <label>ROCE % ≥</label>
          <input type="number" name="minRoce" value="${q.minRoce || ""}" placeholder="e.g. 15" step="0.1">
        </div>
        <div class="filter-group">
          <label>D/E ≤</label>
          <input type="number" name="maxDe" value="${q.maxDe || ""}" placeholder="e.g. 1.0" step="0.1">
        </div>
        <div class="filter-group">
          <label>Promoter % ≥</label>
          <input type="number" name="minPromoter" value="${q.minPromoter || ""}" placeholder="e.g. 40" step="1">
        </div>
        <div class="filter-group">
          <label>P/E ≤</label>
          <input type="number" name="maxPe" value="${q.maxPe || ""}" placeholder="e.g. 30" step="0.5">
        </div>
        <div class="filter-group">
          <label>Price ≥ ₹</label>
          <input type="number" name="minPrice" value="${q.minPrice || ""}" placeholder="e.g. 50">
        </div>
        <div class="filter-group">
          <label>Price ≤ ₹</label>
          <input type="number" name="maxPrice" value="${q.maxPrice || ""}" placeholder="e.g. 5000">
        </div>
        <div class="filter-group">
          <label>Volume ≥</label>
          <input type="number" name="minVolume" value="${q.minVolume || ""}" placeholder="e.g. 100000">
        </div>
        <div class="filter-group">
          <label>Sector</label>
          <select name="sector">
            <option value="">All Sectors</option>
            ${sectorOptions}
          </select>
        </div>
        <div class="filter-group">
          <label>Sort By</label>
          <select name="sortBy">
            ${["roce","roe","de","promoter","pe","price","volume","market_cap","change_pct"].map(k =>
              `<option value="${k}" ${(q.sortBy || "roce") === k ? "selected" : ""}>${k}</option>`
            ).join("")}
          </select>
        </div>
        <div class="filter-group checkbox-group">
          <label><input type="checkbox" name="allProfit" value="1" ${q.allProfit === "1" ? "checked" : ""}> 3yr All Profitable</label>
          <label><input type="checkbox" name="uptrend" value="1" ${q.uptrend === "1" ? "checked" : ""}> Profit Uptrend</label>
        </div>
      </div>
      <div class="filter-actions">
        <button type="submit" class="btn-primary">🔍 Screen</button>
        <a href="/" class="btn-secondary">✕ Clear</a>
      </div>
    </form>

    <div class="results-header">
      <span>${stocks.length} stocks found</span>
      <a href="/api/screen?${new URLSearchParams(req.query as any).toString()}" class="btn-ghost" target="_blank">JSON</a>
    </div>

    <div class="table-wrap">
      <table class="stocks-table">
        <thead>
          <tr>
            <th>Symbol</th><th>Company</th><th>Sector</th>
            <th>Price</th><th>Chg%</th><th>Volume</th>
            <th>ROCE%</th><th>ROE%</th><th>D/E</th>
            <th>Promoter%</th><th>P/E</th><th>Mkt Cap</th><th>Profit</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="13" class="no-data">No results. Try adjusting filters or run a data refresh first.</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── GET /stock/:symbol ─────────────────────────────────────────────────────────
app.get("/stock/:symbol", async (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase();
  const s = await getStock(symbol);

  if (!s) {
    res.status(404).send(`<!DOCTYPE html><html><head><title>Not Found</title>
    <link rel="stylesheet" href="/public/css/style.css"></head><body>
    ${nav("")}<div class="container"><h2>Stock "${symbol}" not found in database.</h2>
    <p><a href="/">Back to Screener</a></p></div></body></html>`);
    return;
  }

  const screenerData = s.screener_data ? JSON.parse(s.screener_data) : {};
  const netProfits: number[] = screenerData.netProfits || [];
  const revenues:   number[] = screenerData.revenues   || [];

  const profitChartData = JSON.stringify(netProfits);
  const revenueChartData = JSON.stringify(revenues);
  const chartLabels = JSON.stringify(
    netProfits.map((_, i) => `Year ${i + 1}`)
  );

  const watchlists = (await getWatchlists()) as any[];

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${symbol} — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
</head>
<body>
  ${nav("")}
  <div class="container">
    <div class="stock-header">
      <div>
        <h1>${symbol} <span class="company-subtitle">${s.company_name || ""}</span></h1>
        <span class="sector-badge">${s.sector || "—"}</span>
      </div>
      <div class="stock-price-box">
        <span class="big-price">₹${fmt(s.price, 2)}</span>
        <span class="change-pct" style="color:${changeColor(s.change_pct)}">${s.change_pct != null ? (s.change_pct >= 0 ? "+" : "") + fmt(s.change_pct, 2) + "%" : ""}</span>
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">ROCE</div>
        <div class="metric-value" style="color:${roceColor(s.roce)}">${fmt(s.roce)}%</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">ROE</div>
        <div class="metric-value">${fmt(s.roe)}%</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">D/E Ratio</div>
        <div class="metric-value" style="color:${deColor(s.de_ratio)}">${s.de_ratio === 0 ? "Debt-free 💎" : fmt(s.de_ratio)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Promoter %</div>
        <div class="metric-value">${fmt(s.promoter_pct)}%</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">P/E Ratio</div>
        <div class="metric-value">${fmt(s.pe_ratio, 1)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">EPS</div>
        <div class="metric-value">₹${fmt(s.eps, 1)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Book Value</div>
        <div class="metric-value">₹${fmt(s.book_value, 1)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Dividend Yield</div>
        <div class="metric-value">${fmt(s.dividend_yield)}%</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Current Ratio</div>
        <div class="metric-value">${fmt(s.current_ratio, 2)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Market Cap</div>
        <div class="metric-value">${fmtCr(s.market_cap)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Volume</div>
        <div class="metric-value">${fmtVol(s.volume)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Profit 3yr</div>
        <div class="metric-value">${s.all_profitable ? "✅ All Positive" : "❌ Has Loss"} ${s.profit_uptrend ? "↑" : "↓"}</div>
      </div>
    </div>

    ${netProfits.length >= 2 ? `
    <div class="charts-row">
      <div class="chart-card">
        <h3>Net Profit Trend (₹ Cr)</h3>
        <canvas id="profitChart"></canvas>
      </div>
      ${revenues.length >= 2 ? `
      <div class="chart-card">
        <h3>Revenue Trend (₹ Cr)</h3>
        <canvas id="revenueChart"></canvas>
      </div>` : ""}
    </div>` : ""}

    <div class="stock-actions">
      <button class="btn-primary" onclick="refreshStock('${symbol}')">🔄 Refresh Data</button>
      <a href="https://www.screener.in/company/${symbol}/" target="_blank" class="btn-secondary">View on screener.in ↗</a>
      <div class="watchlist-add">
        <select id="wlSelect">
          <option value="">Add to watchlist...</option>
          ${watchlists.map((w: any) => `<option value="${w.id}">${w.name}</option>`).join("")}
        </select>
        <button class="btn-ghost" onclick="addToWatchlist('${symbol}')">+ Add</button>
      </div>
    </div>

    <div class="fetched-info">Data fetched: ${s.fetched_at ? new Date(s.fetched_at).toLocaleString("en-IN") : "Never"}</div>
  </div>

  <script>
    ${netProfits.length >= 2 ? `
    new Chart(document.getElementById('profitChart'), {
      type: 'bar',
      data: {
        labels: ${chartLabels},
        datasets: [{ label: 'Net Profit', data: ${profitChartData},
          backgroundColor: ${profitChartData}.map(v => v >= 0 ? '#2ecc71' : '#e74c3c'),
          borderRadius: 4 }]
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#333' }, ticks: { color: '#aaa' } }, x: { ticks: { color: '#aaa' } } } }
    });` : ""}
    ${revenues.length >= 2 ? `
    new Chart(document.getElementById('revenueChart'), {
      type: 'line',
      data: {
        labels: ${chartLabels},
        datasets: [{ label: 'Revenue', data: ${revenueChartData},
          borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.1)', fill: true, tension: 0.3 }]
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#333' }, ticks: { color: '#aaa' } }, x: { ticks: { color: '#aaa' } } } }
    });` : ""}

    async function refreshStock(sym) {
      const btn = event.target;
      btn.disabled = true; btn.textContent = "Refreshing...";
      const r = await fetch('/api/refresh/stock/' + sym, { method: 'POST' });
      if (r.ok) { location.reload(); } else { btn.textContent = "Error"; btn.disabled = false; }
    }

    async function addToWatchlist(sym) {
      const id = document.getElementById('wlSelect').value;
      if (!id) { alert('Select a watchlist first'); return; }
      const r = await fetch('/watchlists/' + id + '/add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym })
      });
      if (r.ok) alert('Added to watchlist!'); else alert('Error');
    }
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── GET /watchlists ────────────────────────────────────────────────────────────
app.get("/watchlists", async (req: Request, res: Response) => {
  const lists = (await getWatchlists()) as any[];
  const cards = lists.map(w => `
    <div class="wl-card">
      <a href="/watchlists/${w.id}" class="wl-name">${w.name}</a>
      <span class="wl-count">${w.stock_count} stocks</span>
      <p class="wl-desc">${w.description || ""}</p>
      <div class="wl-actions">
        <a href="/watchlists/${w.id}" class="btn-primary">View</a>
        <button class="btn-danger" onclick="deleteWl(${w.id})">Delete</button>
      </div>
    </div>`).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Watchlists — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("watchlists")}
  <div class="container">
    <div class="page-header">
      <h1>⭐ Watchlists</h1>
      <button class="btn-primary" onclick="document.getElementById('createModal').style.display='flex'">+ New Watchlist</button>
    </div>
    <div class="wl-grid">${cards || '<p class="no-data">No watchlists yet. Create one!</p>'}</div>

    <div id="createModal" class="modal" style="display:none">
      <div class="modal-box">
        <h2>Create Watchlist</h2>
        <input id="wlName" type="text" placeholder="Name" class="modal-input">
        <textarea id="wlDesc" placeholder="Description (optional)" class="modal-input"></textarea>
        <div class="modal-actions">
          <button class="btn-primary" onclick="createWl()">Create</button>
          <button class="btn-secondary" onclick="document.getElementById('createModal').style.display='none'">Cancel</button>
        </div>
      </div>
    </div>
  </div>
  <script>
    async function createWl() {
      const name = document.getElementById('wlName').value.trim();
      if (!name) { alert('Name required'); return; }
      const r = await fetch('/watchlists', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: document.getElementById('wlDesc').value })
      });
      if (r.ok) location.reload(); else alert('Error creating watchlist');
    }
    async function deleteWl(id) {
      if (!confirm('Delete this watchlist?')) return;
      const r = await fetch('/watchlists/' + id, { method: 'DELETE' });
      if (r.ok) location.reload(); else alert('Error');
    }
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── GET /watchlists/:id ────────────────────────────────────────────────────────
app.get("/watchlists/:id", async (req: Request, res: Response) => {
  const wl = (await getWatchlist(parseInt(req.params.id, 10))) as any;
  if (!wl) { res.status(404).send("Watchlist not found"); return; }

  const rows = wl.stocks.map((s: any) => `
    <tr>
      <td><a href="/stock/${s.symbol}" class="sym-link">${s.symbol}</a></td>
      <td>₹${fmt(s.price, 2)}</td>
      <td style="color:${roceColor(s.roce)}">${fmt(s.roce)}%</td>
      <td style="color:${deColor(s.de_ratio)}">${fmt(s.de_ratio)}</td>
      <td>${fmt(s.promoter_pct)}%</td>
      <td>${fmt(s.pe_ratio, 1)}</td>
      <td>${fmtVol(s.volume)}</td>
      <td>${s.notes || ""}</td>
      <td><button class="btn-danger-sm" onclick="removeStock(${wl.id}, '${s.symbol}')">✕</button></td>
    </tr>`).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${wl.name} — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("watchlists")}
  <div class="container">
    <div class="page-header">
      <div>
        <a href="/watchlists" class="back-link">← Watchlists</a>
        <h1>⭐ ${wl.name}</h1>
        <p class="wl-desc">${wl.description || ""}</p>
      </div>
    </div>
    <div class="table-wrap">
      <table class="stocks-table">
        <thead>
          <tr><th>Symbol</th><th>Price</th><th>ROCE%</th><th>D/E</th><th>Promoter%</th><th>P/E</th><th>Volume</th><th>Notes</th><th></th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="9" class="no-data">No stocks yet. Add from any stock page.</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <script>
    async function removeStock(wlId, sym) {
      if (!confirm('Remove ' + sym + '?')) return;
      const r = await fetch('/watchlists/' + wlId + '/remove', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym })
      });
      if (r.ok) location.reload(); else alert('Error');
    }
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── Watchlist API routes ───────────────────────────────────────────────────────
app.post("/watchlists", async (req: Request, res: Response) => {
  const { name, description } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const id = await createWatchlist(name, description || "");
  res.json({ id });
});

app.post("/watchlists/:id/add", async (req: Request, res: Response) => {
  const { symbol, notes } = req.body;
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  await addToWatchlist(parseInt(req.params.id, 10), symbol, notes || "");
  res.json({ ok: true });
});

app.post("/watchlists/:id/remove", async (req: Request, res: Response) => {
  const { symbol } = req.body;
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  await removeFromWatchlist(parseInt(req.params.id, 10), symbol);
  res.json({ ok: true });
});

app.delete("/watchlists/:id", async (req: Request, res: Response) => {
  await deleteWatchlist(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// ── JSON API ───────────────────────────────────────────────────────────────────
app.get("/api/screen", async (req: Request, res: Response) => {
  const f: ScreenerFilter = {
    minRoce:     req.query.minRoce     ? parseFloat(req.query.minRoce as string) : undefined,
    maxDe:       req.query.maxDe       ? parseFloat(req.query.maxDe as string)   : undefined,
    minPromoter: req.query.minPromoter ? parseFloat(req.query.minPromoter as string) : undefined,
    maxPe:       req.query.maxPe       ? parseFloat(req.query.maxPe as string)   : undefined,
    minPrice:    req.query.minPrice    ? parseFloat(req.query.minPrice as string) : undefined,
    maxPrice:    req.query.maxPrice    ? parseFloat(req.query.maxPrice as string) : undefined,
    minVolume:   req.query.minVolume   ? parseInt(req.query.minVolume as string, 10) : undefined,
    allProfitable: req.query.allProfit === "1",
    profitUptrend: req.query.uptrend  === "1",
    sortBy:      (req.query.sortBy as string) || "roce",
    sortDir:     (req.query.sortDir as "asc" | "desc") || "desc",
    limit:       Math.min(parseInt((req.query.limit as string) || "100", 10), 500),
  };
  res.json(await screenStocks(f));
});

app.get("/api/stock/:symbol", async (req: Request, res: Response) => {
  const s = await getStock(req.params.symbol.toUpperCase());
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  res.json(s);
});

app.get("/api/stats", async (_req: Request, res: Response) => {
  res.json(await getDbStats());
});

app.post("/api/refresh/prices", async (_req: Request, res: Response) => {
  try {
    const count = await refreshPrices();
    res.json({ ok: true, count });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/refresh/stock/:symbol", async (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const f = await fetchFundamentals(symbol);
    if (f.error) { res.status(400).json({ error: f.error }); return; }
    upsertStock({
      symbol,
      company_name: f.companyName, sector: f.sector, market_cap: f.marketCap,
      pe_ratio: f.peRatio, roce: f.roce, roe: f.roe, de_ratio: f.deRatio,
      promoter_pct: f.promoterPct, eps: f.eps, book_value: f.bookValue,
      dividend_yield: f.dividendYield, current_ratio: f.currentRatio,
      net_profit_1: f.netProfits[f.netProfits.length - 3] ?? null,
      net_profit_2: f.netProfits[f.netProfits.length - 2] ?? null,
      net_profit_3: f.netProfits[f.netProfits.length - 1] ?? null,
      revenue_1: f.revenues[f.revenues.length - 3] ?? null,
      revenue_2: f.revenues[f.revenues.length - 2] ?? null,
      revenue_3: f.revenues[f.revenues.length - 1] ?? null,
      all_profitable: f.allProfitable ? 1 : 0,
      profit_uptrend: f.profitUptrend ? 1 : 0,
      screener_data: JSON.stringify({ netProfits: f.netProfits, revenues: f.revenues }),
      fetch_error: null, fetched_at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
// Init DB then start
initDb().then(() => app.listen(PORT, () => {
  console.log(`\n🔍 ZeroScreen running at http://localhost:${PORT}`);
  console.log(`   Screener  : http://localhost:${PORT}/`);
  console.log(`   Watchlists: http://localhost:${PORT}/watchlists`);
  console.log(`   API stats : http://localhost:${PORT}/api/stats\n`);
  startScheduler();
})).catch(err => { console.error("DB init failed:", err); process.exit(1); });
