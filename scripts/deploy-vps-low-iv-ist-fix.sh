#!/usr/bin/env bash
set -euo pipefail
stamp="$(date +%Y%m%d-%H%M%S)"
backup="/root/deploy-backups/low-iv-ist-${stamp}"
bot_root="/home/ubuntu/trading-bot"
mkdir -p "$backup/dist/src"
cp "$bot_root/low_iv_gamma.js" "$backup/low_iv_gamma.js"
cp "$bot_root/dist/src/low_iv_gamma.js" "$backup/dist/src/low_iv_gamma.js"
rollback() {
  cp "$backup/low_iv_gamma.js" "$bot_root/low_iv_gamma.js"
  cp "$backup/dist/src/low_iv_gamma.js" "$bot_root/dist/src/low_iv_gamma.js"
  cd "$bot_root"
  pm2 restart trading-bot --update-env >/dev/null 2>&1 || true
  echo "DEPLOY_ROLLED_BACK backup=$backup" >&2
}
trap rollback ERR
install -m 0644 /tmp/low_iv_gamma.js "$bot_root/low_iv_gamma.js"
install -m 0644 /tmp/low_iv_gamma-runtime.js "$bot_root/dist/src/low_iv_gamma.js"
node --check "$bot_root/low_iv_gamma.js"
node --check "$bot_root/dist/src/low_iv_gamma.js"
grep -q 'kiteDateTimeIST' "$bot_root/dist/src/low_iv_gamma.js"
cd "$bot_root"
pm2 restart trading-bot --update-env
ready=0
for _ in $(seq 1 45); do
  if pm2 pid trading-bot | grep -Eq '^[1-9][0-9]*$' \
    && node -e 'const h=require("./bot-heartbeat.json"); const s=require("./low-iv-gamma-shadow-state.json"); const age=(Date.now()-new Date(h.at).getTime())/1000; process.exit(age>=0&&age<120&&s.day===new Date(Date.now()+19800000).toISOString().slice(0,10)&&s.dataQuality!=="OPENING_RANGE_INCOMPLETE"?0:1)'; then
    ready=1
    break
  fi
  sleep 2
done
test "$ready" = "1"
pm2 save --force >/dev/null
rm -f /tmp/low_iv_gamma.js /tmp/low_iv_gamma-runtime.js /tmp/deploy-vps-low-iv-ist-fix.sh
trap - ERR
echo "DEPLOY_OK backup=$backup"
