/**
 * vps-premarket-preflight.js
 * Automated premarket health check & GO / NO-GO verification for all 6 trading tracks.
 * Can be run anytime via: node scripts/vps-premarket-preflight.js
 */

const fs = require('fs');
const https = require('https');
const sqlite3 = require('sqlite3').verbose();
const { execSync } = require('child_process');

const BOT_DIR = process.env.TRADING_BOT_DIR || '/home/ubuntu/trading-bot';
const DB_PATH = process.env.ZEROSCREEN_DB || '/root/zeroscreen/zeroscreen.db';

console.log("\n=======================================================");
console.log("   🚀 ZEROSCREEN PREMARKET GO / NO-GO PREFLIGHT CHECK");
console.log("=======================================================\n");

const results = [];

function pass(name, detail) {
  console.log(`[ \x1b[32mPASS\x1b[0m ] ${name} — ${detail}`);
  results.push({ name, status: 'PASS', detail });
}

function warn(name, detail) {
  console.log(`[ \x1b[33mWARN\x1b[0m ] ${name} — ${detail}`);
  results.push({ name, status: 'WARN', detail });
}

function fail(name, detail) {
  console.log(`[ \x1b[31mFAIL\x1b[0m ] ${name} — ${detail}`);
  results.push({ name, status: 'FAIL', detail });
}

async function runAudit() {
  // 1. Check Kite Access Token
  try {
    const envPath = `${BOT_DIR}/.env`;
    let apiKey = '', token = '';
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, 'utf8');
      apiKey = (raw.match(/^API_KEY=(.+)$/m)?.[1] || '').trim();
      token = (raw.match(/^ACCESS_TOKEN=(.+)$/m)?.[1] || '').trim();
    }
    const tokenFile = `${BOT_DIR}/access_token.txt`;
    if (fs.existsSync(tokenFile)) {
      const fToken = fs.readFileSync(tokenFile, 'utf8').trim();
      if (fToken) token = fToken;
    }

    if (!apiKey || !token) {
      warn("Broker Credentials", "API Key or Access Token not found in .env / access_token.txt");
    } else {
      // Validate live profile API
      await new Promise((resolve) => {
        const req = https.get('https://api.kite.trade/user/profile', {
          headers: {
            'X-Kite-Version': '3',
            'Authorization': `token ${apiKey}:${token}`,
          },
          timeout: 6000,
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(body);
              if (json.status === 'success' && json.data && json.data.user_id) {
                pass("Kite Token Health", `Valid token for user ${json.data.user_id} (${json.data.user_name || 'Active'})`);
              } else {
                warn("Kite Token Health", `Token returned non-success: ${json.message || 'Needs refresh at 08:30'}`);
              }
            } catch {
              warn("Kite Token Health", "Response was not valid JSON");
            }
            resolve();
          });
        });
        req.on('error', (e) => {
          warn("Kite Token Health", `Network/Auth warning: ${e.message}`);
          resolve();
        });
        req.on('timeout', () => {
          req.destroy();
          warn("Kite Token Health", "Kite profile check timed out");
          resolve();
        });
      });
    }
  } catch (e) {
    warn("Kite Credentials Check", e.message);
  }

  // 2. Check all 6 Strategy State Files
  const strats = [
    { id: 'tt1000', file: 'tt1000-state.json' },
    { id: 'tt1000-quality', file: 'tt1000-quality-state.json' },
    { id: 'tt1000-unlimited', file: 'tt1000-unlimited-state.json' },
    { id: 'tt1030', file: 'tt1030-state.json' },
    { id: 'tt1030-quality', file: 'tt1030-quality-state.json' },
    { id: 'tt1030-unlimited', file: 'tt1030-unlimited-state.json' },
  ];

  let stratsOk = true;
  strats.forEach(({ id, file }) => {
    const p = `${BOT_DIR}/${file}`;
    if (fs.existsSync(p)) {
      try {
        const s = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (s.inTrade) {
          warn(`Strategy State (${id})`, `Currently flagged inTrade: true. Will need reset if session closed.`);
          stratsOk = false;
        } else {
          pass(`Strategy State (${id})`, `Clean state (inTrade: false, date: ${s.date || s.currentDate || 'Ready'})`);
        }
      } catch (e) {
        fail(`Strategy State (${id})`, `Corrupted JSON: ${e.message}`);
        stratsOk = false;
      }
    } else {
      warn(`Strategy State (${id})`, `File ${file} will initialize on first candle`);
    }
  });

  // 3. Check SQLite Database
  if (fs.existsSync(DB_PATH)) {
    await new Promise((resolve) => {
      const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          fail("SQLite Database", `Cannot open: ${err.message}`);
          return resolve();
        }
        db.get("SELECT COUNT(*) as count FROM stocks", (err, row) => {
          if (err) fail("SQLite Stocks Table", err.message);
          else pass("SQLite Database", `Operational with ${row.count} tracked NSE stocks`);
          db.close();
          resolve();
        });
      });
    });
  } else {
    warn("SQLite Database", `File not found at ${DB_PATH}`);
  }

  // 4. Check PM2 Services
  try {
    const pm2List = execSync('pm2 jlist 2>/dev/null || echo "[]"').toString();
    const procs = JSON.parse(pm2List);
    const required = ['zeroscreen', 'trading-bot'];
    required.forEach(reqName => {
      const p = procs.find(item => item.name === reqName);
      if (p && p.pm2_env && p.pm2_env.status === 'online') {
        pass(`PM2 Service (${reqName})`, `Online (PID: ${p.pid}, uptime: ${Math.round(p.pm2_env.pm_uptime ? (Date.now() - p.pm2_env.pm_uptime)/60000 : 0)}m)`);
      } else {
        warn(`PM2 Service (${reqName})`, p ? `Status: ${p.pm2_env.status}` : "Process not registered");
      }
    });
  } catch (e) {
    warn("PM2 Check", `Could not inspect PM2 list: ${e.message}`);
  }

  // Summary
  console.log("\n-------------------------------------------------------");
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const passed = results.filter(r => r.status === 'PASS').length;

  if (failed === 0) {
    console.log(`\x1b[32m✨ PREFLIGHT STATUS: GO FOR TRADING\x1b[0m (${passed} Passed, ${warned} Warnings, 0 Failures)`);
  } else {
    console.log(`\x1b[31m⚠️ PREFLIGHT STATUS: NO-GO\x1b[0m (${failed} Critical Failures Found)`);
  }
  console.log("=======================================================\n");
}

runAudit();
