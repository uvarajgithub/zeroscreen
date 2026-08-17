#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%Y%m%d-%H%M%S)"
backup="/root/deploy-backups/token-consumer-health-${stamp}"
bot_root="/home/ubuntu/trading-bot"
zs_root="/root/zeroscreen"
mkdir -p "$backup/trading-bot" "$backup/zeroscreen/src" "$backup/zeroscreen/dist"
cp "$bot_root/auto_token.js" "$backup/trading-bot/auto_token.js"
cp "$zs_root/src/shadowMonitor.ts" "$backup/zeroscreen/src/shadowMonitor.ts"
cp "$zs_root/dist/shadowMonitor.js" "$backup/zeroscreen/dist/shadowMonitor.js"

rollback() {
  cp "$backup/trading-bot/auto_token.js" "$bot_root/auto_token.js"
  cp "$backup/zeroscreen/src/shadowMonitor.ts" "$zs_root/src/shadowMonitor.ts"
  cp "$backup/zeroscreen/dist/shadowMonitor.js" "$zs_root/dist/shadowMonitor.js"
  cd "$zs_root"
  pm2 restart zeroscreen --update-env >/dev/null 2>&1 || true
  echo "DEPLOY_ROLLED_BACK backup=$backup" >&2
}
trap rollback ERR

install -m 0700 /tmp/auto_token.js "$bot_root/auto_token.js"
install -m 0644 /tmp/zeroscreen-shadowMonitor.ts "$zs_root/src/shadowMonitor.ts"
install -m 0644 /tmp/zeroscreen-shadowMonitor.js "$zs_root/dist/shadowMonitor.js"
node --check "$bot_root/auto_token.js"
node --check "$zs_root/dist/shadowMonitor.js"
grep -q 'nifty-shadow,drishti-v2-shadow,indicator-shadow' "$bot_root/auto_token.js"
grep -q 'heartbeatDegraded' "$zs_root/dist/shadowMonitor.js"

cd "$zs_root"
pm2 restart zeroscreen --update-env
ready=0
for _ in $(seq 1 30); do
  if pm2 pid zeroscreen | grep -Eq '^[1-9][0-9]*$' && curl -fsS -o /dev/null http://127.0.0.1:4000/signals; then
    ready=1
    break
  fi
  sleep 2
done
test "$ready" = "1"
pm2 save --force >/dev/null
rm -f /tmp/auto_token.js /tmp/zeroscreen-shadowMonitor.ts /tmp/zeroscreen-shadowMonitor.js /tmp/deploy-vps-token-consumer-health-fix.sh
trap - ERR
echo "DEPLOY_OK backup=$backup"
