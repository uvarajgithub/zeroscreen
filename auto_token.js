// auto_token.js — Standalone Kite token auto-refresh
// Runs at 8:00 AM IST daily via cron
// Does NOT touch any bot code — only calls the existing token-server /submit endpoint
//
// SETUP (one time):
//   1. Fill in your credentials in the CONFIG section below
//   2. node /home/ubuntu/trading-bot/auto_token.js   ← test manually first
//   3. crontab -e  → add:  30 2 * * 1-5 node /home/ubuntu/trading-bot/auto_token.js >> /home/ubuntu/trading-bot/logs/auto_token.log 2>&1
//      (2:30 UTC = 8:00 IST, weekdays only)

const https = require('https');
const http  = require('http');
const { execSync } = require('child_process');
const crypto = require('crypto');
require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });

// ── CONFIG ────────────────────────────────────────────────────────────────────
const ZERODHA_USER_ID  = 'TR4758';
const ZERODHA_PASSWORD = 'Uvi@janya123456';
const TOTP_SECRET      = '5WPWF3RZSEHY3B5KM2VVEHTU3JQWBXNS';
const BOT_PM2_NAME     = 'amina-100-variant-b';   // correct PM2 process name
// ─────────────────────────────────────────────────────────────────────────────

const API_KEY = process.env.API_KEY;

// -- Telegram notification helper --
function sendTelegram(msg) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat  = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  const data = JSON.stringify({ chat_id: chat, text: msg });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  }, () => {});
  req.on('error', () => {});
  req.write(data); req.end();
}

// ── TOTP (RFC 6238) using only built-in crypto ────────────────────────────────
function base32Decode(s) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0;
  const out = [];
  for (const c of s) {
    const idx = alpha.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((val >> bits) & 0xff); }
  }
  return Buffer.from(out);
}

function generateTOTP(secret) {
  const key = base32Decode(secret);
  const t = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(t / 0x100000000), 0);
  buf.writeUInt32BE(t >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const off  = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off+1] << 16) | (hmac[off+2] << 8) | hmac[off+3];
  return String(code % 1_000_000).padStart(6, '0');
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function httpsGet(path, cookies) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'kite.zerodha.com', path, method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept': 'text/html,application/json,*/*',
        ...(cookies ? { Cookie: cookies } : {})
      }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('GET timeout')); });
    req.end();
  });
}

function httpsPost(path, body, cookies) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(body).toString();
    const opts = {
      hostname: 'kite.zerodha.com', path, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html, */*',
        ...(cookies ? { Cookie: cookies } : {})
      }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('POST timeout')); });
    req.write(data); req.end();
  });
}

function mergeCookies(existing, newHeaders) {
  const newCookies = (newHeaders['set-cookie'] || []).map(c => c.split(';')[0]);
  if (!newCookies.length) return existing;
  const jar = {};
  for (const c of (existing || '').split('; ').filter(Boolean)) {
    const [k, v] = c.split('='); if (k) jar[k] = v;
  }
  for (const c of newCookies) {
    const [k, v] = c.split('='); if (k) jar[k] = v;
  }
  return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
}

// ── Main flow ─────────────────────────────────────────────────────────────────
async function main() {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  console.log(`\n[auto_token] Starting at ${now} IST`);

  // Step 1: GET login page (establishes api_key session context)
  console.log('[auto_token] Step 1: Establishing session...');
  const r0 = await httpsGet(`/connect/login?api_key=${API_KEY}&v=3`, '');
  let cookies = mergeCookies('', r0.headers);

  // Step 2: POST login credentials
  console.log('[auto_token] Step 2: Logging in...');
  const r1 = await httpsPost('/api/login', {
    user_id:  ZERODHA_USER_ID,
    password: ZERODHA_PASSWORD
  }, cookies);
  cookies = mergeCookies(cookies, r1.headers);

  let j1;
  try { j1 = JSON.parse(r1.body); } catch(e) { throw new Error('Login parse error: ' + r1.body.slice(0, 200)); }
  if (j1.status !== 'success') throw new Error('Login failed: ' + r1.body.slice(0, 200));

  const requestId = j1.data.request_id;
  console.log('[auto_token] Login OK — request_id:', requestId);

  // Step 3: POST TOTP
  const otp = generateTOTP(TOTP_SECRET);
  console.log('[auto_token] Step 3: Submitting TOTP:', otp);
  const r2 = await httpsPost('/api/twofa', {
    user_id:     ZERODHA_USER_ID,
    request_id:  requestId,
    twofa_value: otp,
    twofa_type:  'totp'
  }, cookies);
  cookies = mergeCookies(cookies, r2.headers);

  // Extract request_token from Location header (302 redirect)
  let requestToken = null;
  const loc = r2.headers['location'] || '';
  const m1 = loc.match(/request_token=([^&]+)/);
  if (m1) requestToken = m1[1];

  // Fallback: parse from response body
  if (!requestToken) {
    const m2 = r2.body.match(/request_token[=:]["']?([A-Za-z0-9]+)/);
    if (m2) requestToken = m2[1];
  }

  // Step 3b: After 2FA success, GET connect/login again to trigger OAuth redirect
  if (!requestToken) {
    console.log('[auto_token] Step 3b: Triggering OAuth redirect...');
    const r3 = await httpsGet(`/connect/login?api_key=${API_KEY}&v=3`, cookies);
    cookies = mergeCookies(cookies, r3.headers);
    const loc3 = r3.headers['location'] || '';
    const m3 = loc3.match(/request_token=([^&]+)/);
    if (m3) requestToken = m3[1];
    if (!requestToken) {
      const m4 = r3.body.match(/request_token=([A-Za-z0-9]+)/);
      if (m4) requestToken = m4[1];
    }
    // Step 3c: Follow /connect/finish to get request_token
    if (!requestToken && loc3.includes('/connect/finish')) {
      console.log('[auto_token] Step 3c: Following /connect/finish...');
      const finishPath = loc3.replace('https://kite.zerodha.com', '');
      const r4 = await httpsGet(finishPath, cookies);
      cookies = mergeCookies(cookies, r4.headers);
      const loc4 = r4.headers['location'] || '';
      const m5 = loc4.match(/request_token=([^&]+)/);
      if (m5) requestToken = m5[1];
      if (!requestToken) {
        const m6 = r4.body.match(/request_token=([A-Za-z0-9]+)/);
        if (m6) requestToken = m6[1];
      }
      if (!requestToken) {
        throw new Error(`No request_token found.\nFinish status: ${r4.status}\nFinish loc: ${loc4}\nFinish body: ${r4.body.slice(0,300)}`);
      }
    } else if (!requestToken) {
      throw new Error(`No request_token found.\nTOTP status: ${r2.status}\nTOTP body: ${r2.body.slice(0,200)}\nRedirect loc: ${loc3}\nRedirect body: ${r3.body.slice(0,200)}`);
    }
  }
  console.log('[auto_token] Got request_token:', requestToken.slice(0, 12) + '...');

  // Step 4: Submit to local token-server (handles .env update + bot restart)
  // Construct the redirect URL that token-server expects
  const redirectUrl = `https://127.0.0.1/?request_token=${requestToken}&action=login&status=success`;
  const payload = `token=${encodeURIComponent(redirectUrl)}`;

  console.log('[auto_token] Step 4: Submitting to token-server...');
  const response = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 3001, path: '/submit', method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('token-server timeout')); });
    req.write(payload); req.end();
  });

  console.log('[auto_token] Token-server response status:', response.status);

  // Step 5: Direct PM2 restart with correct process name
  // (token-server has BOT_NAME='trading-bot' which is wrong — we fix it here)
  try {
    execSync(`pm2 restart ${BOT_PM2_NAME} --update-env`, { stdio: 'pipe' });
    console.log(`[auto_token] \u2714 ${BOT_PM2_NAME} restarted with new token`);
    sendTelegram(`\u2705 Token refreshed & bot restarted\n${now} IST`);
  } catch (pmErr) {
    console.warn('[auto_token] PM2 restart warning:', pmErr.message ? pmErr.message.slice(0, 200) : pmErr);
    sendTelegram(`\u26a0\ufe0f Token updated but PM2 restart failed: ${(pmErr.message || '').slice(0, 100)}`);
  }
}

main().catch(e => {
  console.error('[auto_token] FAILED:', e.message);
  sendTelegram('\u274c Token refresh FAILED: ' + e.message.slice(0, 200) + '\n\nLogin manually: http://139.59.18.52:3001/login');
  setTimeout(() => process.exit(1), 2000);
});
