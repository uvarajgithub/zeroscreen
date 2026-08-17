const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const botDir = process.env.TRADING_BOT_DIR || '/home/ubuntu/trading-bot';
const auditDir = path.join(botDir, 'audits');
const selfTest = process.argv.includes('--self-test');
const intervalMs = Math.max(60_000, Number(process.env.SHADOW_OBSERVER_INTERVAL_MS || 300_000));
const openStatuses = new Set(['OPEN', 'TRIGGER PENDING', 'VALIDATION PENDING', 'OPEN PENDING', 'PUT ORDER REQ RECEIVED', 'MODIFY VALIDATION PENDING', 'MODIFY PENDING', 'CANCEL PENDING']);

function parseEnv(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}
function istParts(date = new Date()) {
  const shifted = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return { day: shifted.toISOString().slice(0, 10), hhmm: shifted.toISOString().slice(11, 16), weekday: shifted.getUTCDay() };
}
function append(file, row) {
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
function pm2State() {
  const list = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
  return ['trading-bot', 'nifty-shadow', 'drishti-v2-shadow', 'indicator-shadow', 'zeroscreen'].map((name) => {
    const row = list.find((item) => item.name === name);
    return { name, status: row?.pm2_env?.status || 'missing', pid: Number(row?.pid || 0), restarts: Number(row?.pm2_env?.restart_time || 0) };
  });
}

function acquireObserverLock(lockFile) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockFile, 'wx', 0o600);
      fs.writeFileSync(descriptor, String(process.pid));
      return descriptor;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let ownerPid = 0;
      try { ownerPid = Number(fs.readFileSync(lockFile, 'utf8').trim()); } catch (_) {}
      let ownerAlive = Number.isInteger(ownerPid) && ownerPid > 0;
      if (ownerAlive) {
        try { process.kill(ownerPid, 0); } catch (probeError) {
          if (probeError.code === 'ESRCH') ownerAlive = false;
          else if (probeError.code !== 'EPERM') throw probeError;
        }
      }
      // Guard against PID reuse: only an actual observer process owns this lock.
      if (ownerAlive && process.platform === 'linux') {
        try {
          const command = fs.readFileSync(`/proc/${ownerPid}/cmdline`, 'utf8').replace(/\0/g, ' ');
          ownerAlive = command.includes(path.basename(__filename));
        } catch (_) {}
      }
      if (ownerAlive) throw new Error(`A SHADOW observer is already running (PID ${ownerPid})`);
      try { fs.unlinkSync(lockFile); } catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      }
    }
  }
  throw new Error('Could not acquire SHADOW observer lock after removing a stale owner');
}

async function main() {
  const env = parseEnv(path.join(botDir, '.env'));
  const mode = String(env.MODE || 'UNSET').toUpperCase();
  const ttMode = String(env.TT1030_FUTURES_MODE || 'UNSET').toUpperCase();
  if (mode === 'LIVE' || ttMode !== 'SHADOW') throw new Error(`Observer refuses unsafe modes: MODE=${mode}, TT1030=${ttMode}`);

  const { KiteConnect } = require(path.join(botDir, 'node_modules', 'kiteconnect'));
  const kite = new KiteConnect({ api_key: env.API_KEY });
  kite.setAccessToken(env.ACCESS_TOKEN);
  fs.mkdirSync(auditDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(auditDir, 0o700);
  const day = istParts().day;
  const report = path.join(auditDir, `shadow-session-${day}.jsonl`);
  const summaryFile = path.join(auditDir, `shadow-session-${day}-summary.json`);
  const lockFile = path.join(auditDir, 'shadow-session-observer.lock');
  const lock = acquireObserverLock(lockFile);

  let samples = 0;
  const failures = [];
  let baselineProcesses = null;
  try {
    do {
      const now = new Date();
      const ist = istParts(now);
      const row = { at: now.toISOString(), session: ist.day, mode, ttMode, ok: false };
      try {
        await kite.getProfile();
        const [positions, orders] = await Promise.all([kite.getPositions(), kite.getOrders()]);
        const nonFlat = (positions?.net || []).filter((item) => Number(item?.quantity || 0) !== 0);
        const openOrders = (orders || []).filter((item) => openStatuses.has(String(item?.status || '').toUpperCase()));
        const heartbeat = JSON.parse(fs.readFileSync(path.join(botDir, 'bot-heartbeat.json'), 'utf8'));
        const heartbeatAgeSeconds = Math.round((Date.now() - new Date(heartbeat.at).getTime()) / 1000);
        const niftyHeartbeat = JSON.parse(fs.readFileSync(path.join(botDir, 'nifty-shadow-heartbeat.json'), 'utf8'));
        const niftyHeartbeatAgeSeconds = Math.round((Date.now() - new Date(niftyHeartbeat.at).getTime()) / 1000);
        const niftyHeartbeatStatus = String(niftyHeartbeat.status || '').toUpperCase();
        const niftyHeartbeatHealthy = niftyHeartbeatAgeSeconds >= 0 && niftyHeartbeatAgeSeconds < 120
          && !['DEGRADED', 'ERROR', 'FAILED'].includes(niftyHeartbeatStatus);
        const processes = pm2State();
        if (!baselineProcesses) baselineProcesses = processes;
        const processStable = processes.every((item) => {
          const baseline = baselineProcesses.find((base) => base.name === item.name);
          return item.status === 'online' && item.pid > 0 && baseline && baseline.pid === item.pid && baseline.restarts === item.restarts;
        });
        Object.assign(row, {
          auth: true,
          nonFlatPositions: nonFlat.length,
          openOrders: openOrders.length,
          heartbeatAgeSeconds,
          niftyHeartbeatAgeSeconds,
          niftyHeartbeatStatus,
          niftyHeartbeatHealthy,
          tt1030StateConsistent: heartbeat.tt1030StateConsistent === true,
          heartbeatSession: heartbeat.tt1030SessionDate || heartbeat.sessionDate || null,
          processStable,
          processes,
        });
        row.ok = nonFlat.length === 0 && openOrders.length === 0 && heartbeatAgeSeconds >= 0 && heartbeatAgeSeconds < 120 && niftyHeartbeatHealthy && row.tt1030StateConsistent && processStable;
        if (!row.ok) failures.push({ at: row.at, reason: 'safety sample failed', row });
      } catch (error) {
        row.error = error.message;
        failures.push({ at: row.at, reason: error.message });
      }
      append(report, row);
      samples += 1;
      if (selfTest) break;
      const current = istParts();
      if (current.weekday === 0 || current.weekday === 6 || current.hhmm >= '15:35') break;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    } while (true);

    const summary = { createdAt: new Date().toISOString(), session: day, mode, ttMode, samples, failures: failures.length, ok: samples > 0 && failures.length === 0, report };
    fs.writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(summaryFile, 0o600);
    console.log(`SHADOW_OBSERVER_SAMPLES=${samples}`);
    console.log(`SHADOW_OBSERVER_FAILURES=${failures.length}`);
    console.log(`SHADOW_OBSERVER_REPORT=${report}`);
    console.log(`SHADOW_OBSERVER=${summary.ok ? 'OK' : 'FAILED'}`);
    if (!summary.ok) process.exitCode = 1;
  } finally {
    if (lock !== undefined) fs.closeSync(lock);
    fs.rmSync(lockFile, { force: true });
  }
}

main().catch((error) => {
  console.error(`SHADOW_OBSERVER=FAILED:${error.message}`);
  process.exitCode = 1;
});
