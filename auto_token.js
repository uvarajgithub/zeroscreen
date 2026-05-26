// auto_token.js — Standalone Kite token auto-refresh
// Runs at 7:30 AM IST daily via cron (2:00 UTC, weekdays)
// Self-sufficient: exchanges token directly, updates .env itself — does NOT depend on token-server
// Retries up to 3 times on failure. Sends Telegram on success AND failure.
//
// SETUP (one time):
//   1. Fill in your credentials in the CONFIG section below
//   2. node /home/ubuntu/trading-bot/auto_token.js   ← test manually first
//   3. crontab -e  → confirm:  0 2 * * 1-5 node /home/ubuntu/trading-bot/auto_token.js >> /home/ubuntu/trading-bot/logs/auto_token.log 2>&1

const https = require('https');
const http  = require('http');
const fs    = require('fs');
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

// ── Exchange request_token → access_token directly via Kite REST API ─────────
function exchangeToken(requestToken, apiKey, apiSecret) {
  return new Promise((resolve, reject) => {
    const checksum = crypto.createHash('sha256')
      .update(apiKey + requestToken + apiSecret)
      .digest('hex');
    const data = new URLSearchParams({
      api_key: apiKey,
      request_token: requestToken,
      checksum
    }).toString();
    const opts = {
      hostname: 'api.kite.trade', path: '/session/token', method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
        'X-Kite-Version': '3',
        'User-Agent': 'Mozilla/5.0'
      }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.status === 'success' && j.data && j.data.access_token) {
            resolve(j.data.access_token);
          } else {
            reject(new Error('Token exchange failed: ' + d.slice(0, 200)));
          }
        } catch(e) { reject(new Error('Token exchange parse error: ' + d.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Token exchange timeout')); });
    req.write(data); req.end();
  });
}

// ── Update ACCESS_TOKEN line in .env file directly ────────────────────────────
function updateEnvFile(envPath, accessToken) {
  let content = fs.readFileSync(envPath, 'utf-8');
  if (/^ACCESS_TOKEN=.*/m.test(content)) {
    content = content.replace(/^ACCESS_TOKEN=.*/m, `ACCESS_TOKEN=${accessToken}`);
  } else {
    content += `\nACCESS_TOKEN=${accessToken}\n`;
  }
  fs.writeFileSync(envPath, content, 'utf-8');
  // Also write access_token.txt — used by the 9:10 AM health check to confirm token is fresh today
  try { fs.writeFileSync('/home/ubuntu/trading-bot/access_token.txt', accessToken); } catch(_) {}
  console.log('[auto_token] .env updated with new ACCESS_TOKEN');
}

// ── Verify token works by hitting Kite /user/profile ─────────────────────────
function verifyToken(apiKey, accessToken) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'api.kite.trade', path: '/user/profile', method: 'GET',
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
        'User-Agent': 'Mozilla/5.0'
      }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { const j = JSON.parse(d); resolve(j.status === 'success'); }
        catch(e) { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(10000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// ── Single attempt: login → get request_token ─────────────────────────────────
async function getRequestToken() {
  // Step 1: GET login page
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

  if (!requestToken) {
    const m2 = r2.body.match(/request_token[=:]["']?([A-Za-z0-9]+)/);
    if (m2) requestToken = m2[1];
  }

  // Step 3b: After 2FA, GET connect/login to trigger OAuth redirect
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
      if (!requestToken) throw new Error(`No request_token found.\nLoc: ${loc4}\nBody: ${r4.body.slice(0,300)}`);
    } else if (!requestToken) {
      throw new Error(`No request_token found.\nTOTP status: ${r2.status}\nLoc: ${loc3}\nBody: ${r3.body.slice(0,200)}`);
    }
  }
  console.log('[auto_token] Got request_token:', requestToken.slice(0, 12) + '...');
  return requestToken;
}

// ── Main flow with retry ───────────────────────────────────────────────────────
const ENV_PATH   = '/home/ubuntu/trading-bot/.env';
const API_SECRET = process.env.API_SECRET;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3 * 60 * 1000;  // 3 minutes between retries

async function main() {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  console.log(`\n[auto_token] Starting at ${now} IST`);

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      console.log(`\n[auto_token] Retry ${attempt}/${MAX_RETRIES} in 3 minutes...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
    console.log(`\n[auto_token] === Attempt ${attempt}/${MAX_RETRIES} ===`);

    try {
      // Step A: Get request_token from Zerodha login
      const requestToken = await getRequestToken();

      // Step B: Exchange request_token → access_token directly (no token-server dependency)
      console.log('[auto_token] Step 4: Exchanging for access_token...');
      const accessToken = await exchangeToken(requestToken, API_KEY, API_SECRET);
      console.log('[auto_token] Got access_token:', accessToken.slice(0, 8) + '...');

      // Step C: Write directly to .env
      console.log('[auto_token] Step 5: Updating .env...');
      updateEnvFile(ENV_PATH, accessToken);

      // Step D: Also update token-server so its in-memory state stays fresh
      try {
        const redirectUrl = `https://127.0.0.1/?request_token=${requestToken}&action=login&status=success`;
        const payload = `token=${encodeURIComponent(redirectUrl)}`;
        await new Promise((resolve) => {
          const req = http.request({
            hostname: 'localhost', port: 3001, path: '/submit', method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(payload) }
          }, res => { res.on('data', () => {}); res.on('end', () => resolve()); });
          req.on('error', () => resolve());  // non-fatal — .env already updated
          req.setTimeout(5000, () => { req.destroy(); resolve(); });
          req.write(payload); req.end();
        });
        console.log('[auto_token] token-server notified (optional)');
      } catch(_) {}

      // Step E: Restart bot with new token
      console.log('[auto_token] Step 6: Restarting bot...');
      execSync(`pm2 restart ${BOT_PM2_NAME} --update-env`, { stdio: 'pipe' });
      console.log(`[auto_token] ✔ ${BOT_PM2_NAME} restarted`);

      // Step F: Wait 10 seconds then verify token actually works
      console.log('[auto_token] Step 7: Verifying token...');
      await new Promise(r => setTimeout(r, 10000));
      const ok = await verifyToken(API_KEY, accessToken);
      if (!ok) throw new Error('Token verification failed — Kite /user/profile rejected it');

      // ✅ All good
      const successMsg = `✅ Token refreshed & bot ready\n${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;
      console.log('[auto_token] ' + successMsg);
      sendTelegram(successMsg);
      return;

    } catch (err) {
      lastError = err;
      console.error(`[auto_token] Attempt ${attempt} FAILED: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        sendTelegram(`⚠️ Token refresh attempt ${attempt}/${MAX_RETRIES} failed: ${err.message.slice(0, 150)}\nRetrying in 3 min...`);
      }
    }
  }

  // All retries exhausted
  const failMsg = `🚨 TOKEN REFRESH FAILED after ${MAX_RETRIES} attempts!\n${lastError ? lastError.message.slice(0, 200) : 'unknown'}\n\nBot will miss today's trade! Login manually NOW:\nhttp://139.59.18.52:3001/login`;
  console.error('[auto_token] ' + failMsg);
  sendTelegram(failMsg);
  setTimeout(() => process.exit(1), 2000);
}

main().catch(e => {
  console.error('[auto_token] FATAL:', e.message);
  sendTelegram(`🚨 TOKEN REFRESH FATAL ERROR: ${e.message.slice(0, 200)}\n\nLogin manually: http://139.59.18.52:3001/login`);
  setTimeout(() => process.exit(1), 2000);
});
