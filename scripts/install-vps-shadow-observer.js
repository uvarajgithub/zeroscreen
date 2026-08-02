const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');

const staged = '/tmp/vps-shadow-session-observer.js';
const target = '/home/ubuntu/trading-bot/scripts/vps-shadow-session-observer.js';
const auditDir = '/home/ubuntu/trading-bot/audits';
const marker = '# zeroscreen-shadow-observer';
const schedule = `25 3 * * 1-5 cd /home/ubuntu/trading-bot && /usr/bin/node scripts/vps-shadow-session-observer.js >> /home/ubuntu/trading-bot/audits/shadow-session-observer.log 2>&1 ${marker}`;

if (!fs.existsSync(staged)) throw new Error('Staged SHADOW observer is missing');
fs.mkdirSync(auditDir, { recursive: true, mode: 0o700 });
fs.chmodSync(auditDir, 0o700);
fs.copyFileSync(staged, target);
fs.chmodSync(target, 0o700);
fs.unlinkSync(staged);
execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' });

let existing = '';
try { existing = execFileSync('crontab', ['-l'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) {}
const lines = existing.split(/\r?\n/).filter((line) => line.trim() && !line.includes(marker));
lines.push(schedule);
const next = `${lines.join('\n')}\n`;
const installed = spawnSync('crontab', ['-'], { input: next, encoding: 'utf8' });
if (installed.status !== 0) throw new Error(`Could not install observer schedule: ${installed.stderr || installed.status}`);
const verify = execFileSync('crontab', ['-l'], { encoding: 'utf8' });
if (verify.split(/\r?\n/).filter((line) => line.includes(marker)).length !== 1) throw new Error('Observer schedule was not installed exactly once');
console.log('SHADOW_OBSERVER_INSTALL=OK');
console.log('SHADOW_OBSERVER_SCHEDULE_UTC=03:25_WEEKDAYS');
console.log('SHADOW_OBSERVER_SCHEDULE_IST=08:55_WEEKDAYS');
