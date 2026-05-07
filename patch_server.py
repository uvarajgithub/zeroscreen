#!/usr/bin/env python3
"""
patch_server.py — Apply three patches to local server.ts:
  1. Replace market-strip-outer HTML with compact idx-grid
  2. Update loadMarkets() JS to use new ip-/icc- element IDs
  3. Replace old /signals route with new sig3 + gvRefresh version from dist/server.js
"""
import re, sys, os

TS_PATH  = r"C:\Users\LENOVO\zeroscreen\src\server.ts"
JS_PATH  = r"C:\Users\LENOVO\zeroscreen\dist\server.js"
BACKUP   = TS_PATH + ".bak"

# ── Read files ────────────────────────────────────────────────────────────────
with open(TS_PATH, "r", encoding="utf-8") as f:
    src = f.read()
with open(JS_PATH, "r", encoding="utf-8") as f:
    jssrc = f.read()

# backup
with open(BACKUP, "w", encoding="utf-8") as f:
    f.write(src)
print(f"Backup saved to {BACKUP}")

# ─────────────────────────────────────────────────────────────────────────────
# PATCH 1: Replace market-strip-outer HTML with idx-grid
# ─────────────────────────────────────────────────────────────────────────────
STRIP_START = '  <!-- ── Live Market Strip (full-width ticker) ── -->'
STRIP_END   = '  </div>\n\n  <div class="container screener-layout">'

IDX_GRID_HTML = '''  <!-- ── Compact Index Grid ── -->
  <div class="idx-grid-outer">
    <div class="idx-grid" id="idx-grid">
      <div class="idx-card" id="ic-NSEI">
        <div class="idx-lbl"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"> NIFTY 50</div>
        <div class="idx-price" id="ip-NSEI">—</div>
        <div class="idx-chg idx-d" id="icc-NSEI">—</div>
      </div>
      <div class="idx-card" id="ic-NSEBANK">
        <div class="idx-lbl"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"> BANK NIFTY</div>
        <div class="idx-price" id="ip-NSEBANK">—</div>
        <div class="idx-chg idx-d" id="icc-NSEBANK">—</div>
      </div>
      <div class="idx-card" id="ic-FINNIFTY">
        <div class="idx-lbl"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"> FIN NIFTY</div>
        <div class="idx-price" id="ip-FINNIFTY">—</div>
        <div class="idx-chg idx-d" id="icc-FINNIFTY">—</div>
      </div>
      <div class="idx-card" id="ic-INDIAVIX">
        <div class="idx-lbl"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"> INDIA VIX</div>
        <div class="idx-price" id="ip-INDIAVIX">—</div>
        <div class="idx-chg idx-d" id="icc-INDIAVIX">—</div>
      </div>
      <div class="idx-card" id="ic-MIDCAP">
        <div class="idx-lbl"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"> MIDCAP 100</div>
        <div class="idx-price" id="ip-MIDCAP">—</div>
        <div class="idx-chg idx-d" id="icc-MIDCAP">—</div>
      </div>
      <div class="idx-card" id="ic-NIFTYIT">
        <div class="idx-lbl"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"> NIFTY IT</div>
        <div class="idx-price" id="ip-NIFTYIT">—</div>
        <div class="idx-chg idx-d" id="icc-NIFTYIT">—</div>
      </div>
      <div class="idx-card idx-card-global" id="ic-DJI">
        <div class="idx-lbl"><img src="https://flagcdn.com/16x12/us.png" class="mkt-flag-img" alt="US"> DOW JONES</div>
        <div class="idx-price" id="ip-DJI">—</div>
        <div class="idx-chg idx-d" id="icc-DJI">—</div>
      </div>
      <div class="idx-card idx-card-global" id="ic-IXIC">
        <div class="idx-lbl"><img src="https://flagcdn.com/16x12/us.png" class="mkt-flag-img" alt="US"> NASDAQ</div>
        <div class="idx-price" id="ip-IXIC">—</div>
        <div class="idx-chg idx-d" id="icc-IXIC">—</div>
      </div>
      <div class="idx-card idx-card-global" id="ic-GSPC">
        <div class="idx-lbl"><img src="https://flagcdn.com/16x12/us.png" class="mkt-flag-img" alt="US"> S&amp;P 500</div>
        <div class="idx-price" id="ip-GSPC">—</div>
        <div class="idx-chg idx-d" id="icc-GSPC">—</div>
      </div>
      <div class="idx-card idx-card-global" id="ic-N225">
        <div class="idx-lbl"><img src="https://flagcdn.com/16x12/jp.png" class="mkt-flag-img" alt="JP"> NIKKEI 225</div>
        <div class="idx-price" id="ip-N225">—</div>
        <div class="idx-chg idx-d" id="icc-N225">—</div>
      </div>
      <div class="idx-card idx-card-global" id="ic-HSI">
        <div class="idx-lbl"><img src="https://flagcdn.com/16x12/hk.png" class="mkt-flag-img" alt="HK"> HANG SENG</div>
        <div class="idx-price" id="ip-HSI">—</div>
        <div class="idx-chg idx-d" id="icc-HSI">—</div>
      </div>
    </div>
  </div>

  <div class="container screener-layout">'''

# Find old strip section
s_start = src.find(STRIP_START)
s_end   = src.find(STRIP_END)
if s_start == -1 or s_end == -1:
    print(f"ERROR: Could not find market strip markers. s_start={s_start}, s_end={s_end}")
    sys.exit(1)
# Include the full replacement (IDX_GRID_HTML ends with the next div open)
src = src[:s_start] + IDX_GRID_HTML + src[s_end + len(STRIP_END):]
print(f"PATCH 1 OK: replaced market-strip-outer with idx-grid")

# ─────────────────────────────────────────────────────────────────────────────
# PATCH 2: Replace loadMarkets() JS function
# ─────────────────────────────────────────────────────────────────────────────
LOAD_MKT_OLD_START = "    async function loadMarkets() {"
LOAD_MKT_OLD_END   = "    setInterval(loadMarkets, 30000);"

NEW_LOAD_MKT = """    async function loadMarkets() {
      try {
        const r = await fetch('/api/markets');
        const quotes = await r.json();
        const MKT_ID_MAP = {
          'NIFTY 50':'NSEI','NIFTY BANK':'NSEBANK','NIFTY FIN SERVICE':'FINNIFTY',
          'NIFTY IT':'NIFTYIT','INDIA VIX':'INDIAVIX','NIFTY MIDCAP 100':'MIDCAP',
          '^DJI':'DJI','^IXIC':'IXIC','^GSPC':'GSPC','^N225':'N225','^HSI':'HSI'
        };
        quotes.forEach((q) => {
          const key = MKT_ID_MAP[q.symbol] || q.symbol.replace(/[^A-Z0-9]/gi,'');
          const up  = (q.changePct || 0) >= 0;
          const isGlobal = q.region === 'global';
          const fmt = (n) => n.toLocaleString(isGlobal ? 'en-US' : 'en-IN', {maximumFractionDigits:2});
          const newPrice = q.price != null ? fmt(q.price) : '\\u2014';
          const newChg   = q.changePct != null ? (up?'+':'') + q.changePct.toFixed(2) + '%' : '\\u2014';
          const card = document.getElementById('ic-' + key);
          const priceEl = document.getElementById('ip-' + key);
          const chgEl   = document.getElementById('icc-' + key);
          if (!card) return;
          card.classList.remove('idx-up','idx-dn');
          if (priceEl) priceEl.textContent = newPrice;
          if (chgEl) {
            chgEl.textContent = newChg;
            chgEl.className = 'idx-chg ' + (up ? 'idx-up' : 'idx-dn');
          }
        });
        const ts = document.getElementById('mkt-updated');
        if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
      } catch(_) {}
    }
    loadMarkets();
    setInterval(loadMarkets, 30000);"""

lm_start = src.find(LOAD_MKT_OLD_START)
lm_end   = src.find(LOAD_MKT_OLD_END)
if lm_start == -1 or lm_end == -1:
    print(f"ERROR: Could not find loadMarkets markers. lm_start={lm_start}, lm_end={lm_end}")
    sys.exit(1)
src = src[:lm_start] + NEW_LOAD_MKT + src[lm_end + len(LOAD_MKT_OLD_END):]
print(f"PATCH 2 OK: replaced loadMarkets JS with idx-grid version")

# ─────────────────────────────────────────────────────────────────────────────
# PATCH 3: Replace /signals route with sig3 + gvRefresh version from compiled JS
# ─────────────────────────────────────────────────────────────────────────────
SIG_OLD_START = 'app.get("/signals", featureGate("feature_signals", "Signals"), (req: Request, res: Response) => {'
SIG_OLD_END   = '\nasync function ensureAdminEmail() {'

SIG_NEW_START = 'app.get("/signals", featureGate("feature_signals", "Signals"), (req, res) => {'
SIG_NEW_END   = '\nasync function ensureAdminEmail() {'

# Get new signals route from compiled JS
js_sig_start = jssrc.find(SIG_NEW_START)
js_sig_end   = jssrc.find(SIG_NEW_END)
if js_sig_start == -1 or js_sig_end == -1:
    print(f"ERROR: Could not find signals route in compiled JS. js_sig_start={js_sig_start}, js_sig_end={js_sig_end}")
    sys.exit(1)

new_signals_route = jssrc[js_sig_start:js_sig_end]
print(f"  new signals route: {len(new_signals_route)} chars, {new_signals_route.count(chr(10))} lines")

# Find old signals route in server.ts
ts_sig_start = src.find(SIG_OLD_START)
ts_sig_end   = src.find(SIG_OLD_END)
if ts_sig_start == -1 or ts_sig_end == -1:
    print(f"ERROR: Could not find signals route in server.ts. ts_sig_start={ts_sig_start}, ts_sig_end={ts_sig_end}")
    sys.exit(1)

old_signals_route = src[ts_sig_start:ts_sig_end]
print(f"  old signals route: {len(old_signals_route)} chars, {old_signals_route.count(chr(10))} lines")

src = src[:ts_sig_start] + new_signals_route + src[ts_sig_end:]
print(f"PATCH 3 OK: replaced /signals route with sig3 version")

# ─────────────────────────────────────────────────────────────────────────────
# Save
# ─────────────────────────────────────────────────────────────────────────────
with open(TS_PATH, "w", encoding="utf-8") as f:
    f.write(src)

lines = src.count('\n') + 1
print(f"\nDONE — {TS_PATH}")
print(f"  Total lines: {lines}")
print(f"  Total bytes: {len(src.encode('utf-8'))}")
