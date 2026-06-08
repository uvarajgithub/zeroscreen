#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();

const cfg = {
  host: process.env.ZS_VPS_HOST || '139.59.18.52',
  user: process.env.ZS_VPS_USER || 'root',
  password: process.env.ZS_VPS_PASSWORD || ''
};

const results = [];

function nowIST() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
}

function addResult(name, ok, detail) {
  results.push({ name, ok, detail });
}

function runLocal(command, args) {
  const cmdLine = `${command} ${args.join(' ')}`.trim();
  const res = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', cmdLine], { cwd: root, encoding: 'utf8' })
    : spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  const launchError = res.error ? String(res.error.message || res.error) : '';
  return {
    ok: res.status === 0 && !res.error,
    stdout: (res.stdout || '').trim(),
    stderr: ((res.stderr || '').trim() || launchError).trim(),
    status: res.status
  };
}

function getPlinkPath() {
  const localPlink = path.join(root, 'plink.exe');
  if (fs.existsSync(localPlink)) return localPlink;
  return 'plink.exe';
}

function runRemote(remoteCmd) {
  const plink = getPlinkPath();
  const args = ['-batch', '-pw', cfg.password, `${cfg.user}@${cfg.host}`, remoteCmd];
  const res = spawnSync(plink, args, { cwd: root, encoding: 'utf8' });
  return {
    ok: res.status === 0,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
    status: res.status
  };
}

function checkLocal() {
  const build = runLocal('npm', ['run', 'build', '--silent']);
  addResult('Local TypeScript Build', build.ok, build.ok ? 'build passed' : (build.stderr || build.stdout || `exit ${build.status}`));

  const health = runLocal('npm', ['run', 'repo:health', '--silent']);
  addResult('Local Repo Health', health.ok, health.ok ? 'repo:health PASS' : (health.stderr || health.stdout || `exit ${health.status}`));

  const git = runLocal('git', ['status', '--short']);
  addResult('Local Git Clean', git.ok && !git.stdout, git.ok ? (git.stdout ? 'working tree has changes' : 'clean') : (git.stderr || 'git status failed'));
}

function checkRemote() {
  if (!cfg.password) {
    addResult('VPS Checks', false, 'ZS_VPS_PASSWORD not set (cannot verify production)');
    return;
  }

  const zStatus = runRemote("pm2 show zeroscreen | grep -E 'status' | head -1");
  addResult('VPS ZeroScreen PM2', zStatus.ok && /online/i.test(zStatus.stdout), zStatus.stdout || zStatus.stderr || 'no output');

  const bStatus = runRemote("pm2 show amina-100-variant-b | grep -E 'status' | head -1");
  addResult('VPS Bot PM2', bStatus.ok && /online/i.test(bStatus.stdout), bStatus.stdout || bStatus.stderr || 'no output');

  const http = runRemote("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/api/stats");
  addResult('VPS API /api/stats', http.ok && http.stdout === '200', http.stdout || http.stderr || 'no output');

  const cron = runRemote("crontab -l 2>/dev/null");
  const cronOk = cron.ok && cron.stdout.includes('0 2 * * 1-5 node /home/ubuntu/trading-bot/auto_token.js') && cron.stdout.includes('30 2 * * 1-5 /root/auto_token_check.sh');
  addResult('VPS Token Cron', cronOk, cron.ok ? 'primary+fallback present' : (cron.stderr || 'crontab read failed'));

  const env = runRemote("bash -lc 'for k in API_KEY API_SECRET ACCESS_TOKEN TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID; do v=$(grep -E \"^${k}=\" /home/ubuntu/trading-bot/.env | tail -1 | cut -d= -f2-); [ -n \"$v\" ] || echo $k; done'");
  addResult('VPS Env Keys', env.ok && !env.stdout, env.ok ? (!env.stdout ? 'all required keys set' : `missing: ${env.stdout.replace(/\s+/g, ',')}`) : (env.stderr || 'env check failed'));

  const tg = runRemote("bash -lc 'B=$(grep -E \"^TELEGRAM_BOT_TOKEN=\" /home/ubuntu/trading-bot/.env | tail -1 | cut -d= -f2-); [ -n \"$B\" ] || { echo fail; exit 0; }; curl -s https://api.telegram.org/bot${B}/getMe | grep -q \"\\\"ok\\\":true\" && echo ok || echo fail'");
  addResult('VPS Telegram API', tg.ok && tg.stdout === 'ok', tg.stdout || tg.stderr || 'no output');

  const kite = runRemote("bash -lc 'K=$(grep -E \"^API_KEY=\" /home/ubuntu/trading-bot/.env | tail -1 | cut -d= -f2-); A=$(grep -E \"^ACCESS_TOKEN=\" /home/ubuntu/trading-bot/.env | tail -1 | cut -d= -f2-); [ -n \"$K\" ] && [ -n \"$A\" ] || { echo missing; exit 0; }; R=$(curl -s https://api.kite.trade/user/profile -H \"X-Kite-Version: 3\" -H \"Authorization: token ${K}:${A}\"); echo \"$R\" | grep -q \"\\\"status\\\":\\\"success\\\"\" && echo valid || echo invalid'");
  addResult('VPS Kite Token', kite.ok && kite.stdout === 'valid', kite.stdout || kite.stderr || 'no output');

  const tokenFile = runRemote("bash -lc 'test -f /home/ubuntu/trading-bot/access_token.txt || { echo missing; exit 0; }; T=$(date -r /home/ubuntu/trading-bot/access_token.txt +%F); N=$(date +%F); [ \"$T\" = \"$N\" ] && echo fresh || echo stale:$T' ");
  addResult('VPS Token File Fresh', tokenFile.ok && tokenFile.stdout === 'fresh', tokenFile.stdout || tokenFile.stderr || 'no output');
}

function printReport() {
  console.log(`Pre-market Readiness Report (IST): ${nowIST()}`);
  for (const r of results) {
    const mark = r.ok ? 'PASS' : 'FAIL';
    console.log(`- [${mark}] ${r.name}: ${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log(`\nNO-GO (${failed.length} checks failed)`);
    process.exit(1);
  }

  console.log('\nGO (all checks passed)');
  process.exit(0);
}

checkLocal();
checkRemote();
printReport();
