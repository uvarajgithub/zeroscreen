#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%Y%m%d-%H%M%S)"
backup="/root/deploy-backups/bank-overlap-guard-${stamp}"
bot_root="/home/ubuntu/trading-bot"
mkdir -p "$backup/src" "$backup/dist/src"
cp "$bot_root/src/index.ts" "$backup/src/index.ts"
cp "$bot_root/dist/src/index.js" "$backup/dist/src/index.js"

rollback() {
  cp "$backup/src/index.ts" "$bot_root/src/index.ts"
  cp "$backup/dist/src/index.js" "$bot_root/dist/src/index.js"
  cd "$bot_root"
  pm2 restart trading-bot --update-env >/dev/null 2>&1 || true
  echo "DEPLOY_ROLLED_BACK backup=$backup" >&2
}
trap rollback ERR

install -m 0644 /tmp/trading-bot-index.ts "$bot_root/src/index.ts"
install -m 0644 /tmp/trading-bot-index.js "$bot_root/dist/src/index.js"
node --check "$bot_root/dist/src/index.js"
cmp -s "$bot_root/src/index.ts" "$bot_root/dist/src/index.js"
grep -q "const shadowEngineInFlight = new Set()" "$bot_root/dist/src/index.js"
grep -q "overlap remains blocked until completion" "$bot_root/dist/src/index.js"

cd "$bot_root"
pm2 restart trading-bot --update-env
ready=0
for _ in $(seq 1 30); do
  if pm2 pid trading-bot | grep -Eq '^[1-9][0-9]*$' \
    && node -e 'const h=require("./bot-heartbeat.json"); const age=(Date.now()-new Date(h.at).getTime())/1000; process.exit(age>=0 && age<120 ? 0 : 1)'; then
    ready=1
    break
  fi
  sleep 2
done
test "$ready" = "1"
pm2 save --force >/dev/null
rm -f /tmp/trading-bot-index.ts /tmp/trading-bot-index.js /tmp/deploy-vps-bank-overlap-guard.sh
trap - ERR
echo "DEPLOY_OK backup=$backup"
