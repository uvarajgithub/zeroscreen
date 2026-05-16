'use strict';
/**
 * patch_dashboard_vmt.js
 * Patches /home/ubuntu/trading-bot/dist/src/dashboard.js to add VMT Shadow panel.
 * Run once: node patch_dashboard_vmt.js
 */

const fs   = require('fs');
const FILE = '/home/ubuntu/trading-bot/dist/src/dashboard.js';

let src = fs.readFileSync(FILE, 'utf8');

if (src.includes('/api/vmt')) {
    console.log('Already patched — skipping.');
    process.exit(0);
}

// ── PATCH 1: Add /api/vmt endpoint after /api/heartbeat ──────────────────────
const API_ANCHOR = `app.get("/api/heartbeat", (_req, res) => {
    const hb = readJSON("bot-heartbeat.json", null);
    res.json(hb ?? { error: "No heartbeat file yet" });
});`;

const API_NEW = `app.get("/api/heartbeat", (_req, res) => {
    const hb = readJSON("bot-heartbeat.json", null);
    res.json(hb ?? { error: "No heartbeat file yet" });
});
// ── VMT Shadow ──
app.get("/api/vmt", (_req, res) => {
    const v = readJSON("vmt-shadow.json", null);
    res.json(v ?? { status: "IDLE", error: "VMT shadow not running" });
});`;

if (!src.includes(API_ANCHOR)) {
    console.error('ERROR: Cannot find /api/heartbeat anchor. Aborting.');
    process.exit(1);
}
src = src.replace(API_ANCHOR, API_NEW);
console.log('✓ Patch 1: /api/vmt endpoint added');

// ── PATCH 2: Add VMT panel HTML before </footer> ──────────────────────────────
const FOOTER_ANCHOR = `  <footer>Refreshes every 3s`;

const VMT_HTML = `
  <!-- VMT Shadow Panel -->
  <div class="vmt-shadow-section">
    <div class="vmt-header">
      <span class="vmt-title">&#x1F4A1; VMT SHADOW</span>
      <span id="vmt-status-badge" class="badge badge-flat">IDLE</span>
      <span id="vmt-ts" style="font-size:0.72rem;color:#8b949e;margin-left:auto"></span>
    </div>
    <!-- Pre-trade setup row -->
    <div id="vmt-setup-row" class="vmt-setup-row">
      <div class="vmt-cell"><div class="vmt-lbl">ATM Strike</div><div class="vmt-val cyan" id="vmt-atm">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">CE Premium</div><div class="vmt-val" id="vmt-ce-prem">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">CE Entry / SL / Tgt</div><div class="vmt-val" id="vmt-ce-levels">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">PE Premium</div><div class="vmt-val" id="vmt-pe-prem">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">PE Entry / SL / Tgt</div><div class="vmt-val" id="vmt-pe-levels">&#8212;</div></div>
    </div>
    <!-- Live trigger row (pre-entry) -->
    <div id="vmt-live-row" class="vmt-setup-row" style="display:none">
      <div class="vmt-cell"><div class="vmt-lbl">CE Live Price</div><div class="vmt-val cyan" id="vmt-ce-now">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">CE Distance</div><div class="vmt-val" id="vmt-ce-dist">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">PE Live Price</div><div class="vmt-val cyan" id="vmt-pe-now">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">PE Distance</div><div class="vmt-val" id="vmt-pe-dist">&#8212;</div></div>
    </div>
    <!-- Active trade row -->
    <div id="vmt-trade-row" class="vmt-setup-row" style="display:none">
      <div class="vmt-cell"><div class="vmt-lbl">Direction</div><div class="vmt-val" id="vmt-dir">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">Entry</div><div class="vmt-val" id="vmt-entry">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">SL</div><div class="vmt-val red" id="vmt-sl">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">Target</div><div class="vmt-val green" id="vmt-target">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">Live Option</div><div class="vmt-val cyan" id="vmt-live-opt">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">Live P&amp;L (pts)</div><div class="vmt-val" id="vmt-live-pnl">&#8212;</div></div>
    </div>
    <!-- Result row -->
    <div id="vmt-result-row" class="vmt-setup-row" style="display:none">
      <div class="vmt-cell"><div class="vmt-lbl">Result</div><div class="vmt-val" id="vmt-result-badge">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">Final P&amp;L (pts)</div><div class="vmt-val" id="vmt-final-pnl">&#8212;</div></div>
      <div class="vmt-cell"><div class="vmt-lbl">Final P&amp;L (Rs/lot)</div><div class="vmt-val" id="vmt-final-rs">&#8212;</div></div>
    </div>
  </div>

  <footer>Refreshes every 3s`;

src = src.replace(FOOTER_ANCHOR, VMT_HTML);
console.log('✓ Patch 2: VMT HTML panel added');

// ── PATCH 3: Add VMT CSS inside <style> ──────────────────────────────────────
const CSS_ANCHOR = `    footer { text-align: center; padding: 16px; color: #30363d; font-size: 0.72rem; }`;

const CSS_NEW = `    footer { text-align: center; padding: 16px; color: #30363d; font-size: 0.72rem; }
    /* VMT Shadow */
    .vmt-shadow-section { margin: 0 24px 14px; background: #0d1421; border: 1px solid #1d3461; border-radius: 8px; overflow: hidden; }
    .vmt-header { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #0f1c33; border-bottom: 1px solid #1d3461; }
    .vmt-title { font-size: 0.72rem; font-weight: 700; letter-spacing: 1px; color: #58a6ff; text-transform: uppercase; }
    .vmt-setup-row { display: flex; flex-wrap: wrap; gap: 0; border-bottom: 1px solid #1d3461; }
    .vmt-setup-row:last-child { border-bottom: none; }
    .vmt-cell { flex: 1 1 120px; padding: 10px 14px; border-right: 1px solid #1d3461; }
    .vmt-cell:last-child { border-right: none; }
    .vmt-lbl { font-size: 0.63rem; text-transform: uppercase; letter-spacing: 0.8px; color: #58a6ff; margin-bottom: 3px; opacity: 0.7; }
    .vmt-val { font-size: 0.9rem; font-weight: 700; color: #e6edf3; }
    .badge-vmt-ready   { background: #1a2840; color: #58a6ff; }
    .badge-vmt-trade   { background: #1a3320; color: #3fb950; }
    .badge-vmt-done    { background: #2d2208; color: #e3b341; }
    .badge-vmt-waiting { background: #1c2128; color: #8b949e; }`;

src = src.replace(CSS_ANCHOR, CSS_NEW);
console.log('✓ Patch 3: VMT CSS added');

// ── PATCH 4: Add VMT refresh logic in JS, before setInterval ─────────────────
const JS_ANCHOR = `    refresh();
    setInterval(refresh, 3000);`;

const JS_NEW = `    async function refreshVMT() {
      try {
        const r = await fetch('/api/vmt');
        const v = await r.json();
        if (!v) return;
        const sb = document.getElementById('vmt-status-badge');
        document.getElementById('vmt-ts').textContent = v.ts || '';
        // Status badge
        const statusMap = { IDLE:'badge badge-flat badge-vmt-waiting', WAITING:'badge badge-flat badge-vmt-waiting', READY:'badge badge-flat badge-vmt-ready', IN_TRADE:'badge badge-ce badge-vmt-trade', DONE:'badge badge-done badge-vmt-done' };
        sb.className = statusMap[v.status] || 'badge badge-flat';
        sb.textContent = v.status || 'IDLE';
        // Setup row always shown when spotOpen known
        const setupRow = document.getElementById('vmt-setup-row');
        const liveRow  = document.getElementById('vmt-live-row');
        const tradeRow = document.getElementById('vmt-trade-row');
        const resultRow= document.getElementById('vmt-result-row');
        if (v.spotOpen) {
          document.getElementById('vmt-atm').textContent     = v.atmStrike || '-';
          document.getElementById('vmt-ce-prem').textContent = v.cePremium != null ? v.cePremium.toFixed(1) : '-';
          document.getElementById('vmt-ce-levels').textContent = v.ceEntry != null ? v.ceEntry.toFixed(1)+' / '+v.ceSL.toFixed(1)+' / '+v.ceTarget.toFixed(1) : '-';
          document.getElementById('vmt-pe-prem').textContent = v.pePremium != null ? v.pePremium.toFixed(1) : '-';
          document.getElementById('vmt-pe-levels').textContent = v.peEntry != null ? v.peEntry.toFixed(1)+' / '+v.peSL.toFixed(1)+' / '+v.peTarget.toFixed(1) : '-';
          setupRow.style.display = '';
        } else { setupRow.style.display = 'none'; }
        // Live trigger row (READY state — waiting for entry)
        if (v.status === 'READY' && v.ceNow != null) {
          document.getElementById('vmt-ce-now').textContent  = v.ceNow.toFixed(1);
          const ceDist = v.ceNow - v.ceEntry;
          const ceEl = document.getElementById('vmt-ce-dist');
          ceEl.textContent = (ceDist >= 0 ? '+' : '') + ceDist.toFixed(1) + ' pts';
          ceEl.className = 'vmt-val ' + (ceDist >= 0 ? 'green' : 'red');
          document.getElementById('vmt-pe-now').textContent  = v.peNow.toFixed(1);
          const peDist = v.peNow - v.peEntry;
          const peEl = document.getElementById('vmt-pe-dist');
          peEl.textContent = (peDist >= 0 ? '+' : '') + peDist.toFixed(1) + ' pts';
          peEl.className = 'vmt-val ' + (peDist >= 0 ? 'green' : 'red');
          liveRow.style.display = '';
        } else { liveRow.style.display = 'none'; }
        // Active trade row
        if (v.status === 'IN_TRADE') {
          document.getElementById('vmt-dir').innerHTML = v.tradeDir === 'CE'
            ? '<span class="badge badge-ce">CE</span>'
            : '<span class="badge badge-pe">PE</span>';
          document.getElementById('vmt-entry').textContent    = v.tradeEntry != null ? v.tradeEntry.toFixed(1) : '-';
          document.getElementById('vmt-sl').textContent       = v.tradeSL    != null ? v.tradeSL.toFixed(1)    : '-';
          document.getElementById('vmt-target').textContent   = v.tradeTarget!= null ? v.tradeTarget.toFixed(1): '-';
          document.getElementById('vmt-live-opt').textContent = v.liveOptPrice!= null? v.liveOptPrice.toFixed(1):'-';
          const lp = v.livePnl || 0;
          const lpEl = document.getElementById('vmt-live-pnl');
          lpEl.textContent = (lp >= 0 ? '+' : '') + lp.toFixed(1);
          lpEl.className = 'vmt-val ' + (lp > 0 ? 'green' : lp < 0 ? 'red' : 'gray');
          tradeRow.style.display = '';
          resultRow.style.display = 'none';
        } else { tradeRow.style.display = 'none'; }
        // Result row
        if (v.status === 'DONE') {
          const resMap = { TARGET:'&#x2705; TARGET', SL:'&#x274C; SL HIT', TIME_EXIT:'&#x23F0; TIME EXIT', NO_TRADE:'&#x23F8; NO TRADE' };
          const resColor = { TARGET:'green', SL:'red', TIME_EXIT:'yellow', NO_TRADE:'gray' };
          const rb = document.getElementById('vmt-result-badge');
          rb.innerHTML = resMap[v.exitReason] || v.exitReason;
          rb.className = 'vmt-val ' + (resColor[v.exitReason] || 'gray');
          const fp = v.finalPnl || 0;
          const fpEl = document.getElementById('vmt-final-pnl');
          fpEl.textContent = (fp >= 0 ? '+' : '') + fp.toFixed(1);
          fpEl.className = 'vmt-val ' + (fp > 0 ? 'green' : fp < 0 ? 'red' : 'gray');
          document.getElementById('vmt-final-rs').textContent = (fp >= 0 ? '+' : '') + 'Rs ' + Math.abs(fp * 15).toFixed(0);
          document.getElementById('vmt-final-rs').className = 'vmt-val ' + (fp > 0 ? 'green' : fp < 0 ? 'red' : 'gray');
          resultRow.style.display = '';
          tradeRow.style.display = 'none';
        } else if (v.status !== 'IN_TRADE') {
          resultRow.style.display = 'none';
        }
      } catch(e) {}
    }
    refresh();
    refreshVMT();
    setInterval(refresh, 3000);
    setInterval(refreshVMT, 5000);`;

src = src.replace(JS_ANCHOR, JS_NEW);
console.log('✓ Patch 4: VMT refresh JS added');

// ── Write patched file ────────────────────────────────────────────────────────
fs.writeFileSync(FILE, src);
console.log('\n✅  dashboard.js patched successfully.');
