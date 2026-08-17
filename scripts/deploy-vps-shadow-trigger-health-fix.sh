#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%Y%m%d-%H%M%S)"
backup="/root/deploy-backups/shadow-trigger-health-${stamp}"
zs_root="/root/zeroscreen"
bot_root="/home/ubuntu/trading-bot"

mkdir -p "$backup/zeroscreen/src" "$backup/zeroscreen/dist" "$backup/trading-bot/src" "$backup/trading-bot/dist/src"
cp "$zs_root/src/shadowMonitor.ts" "$backup/zeroscreen/src/"
cp "$zs_root/dist/shadowMonitor.js" "$backup/zeroscreen/dist/"
cp "$bot_root/src/nifty-shadow.ts" "$backup/trading-bot/src/"
cp "$bot_root/dist/src/nifty-shadow.js" "$backup/trading-bot/dist/src/"
cp "$bot_root/src/index.ts" "$backup/trading-bot/src/"
cp "$bot_root/dist/src/index.js" "$backup/trading-bot/dist/src/"

rollback() {
  cp "$backup/zeroscreen/src/shadowMonitor.ts" "$zs_root/src/shadowMonitor.ts"
  cp "$backup/zeroscreen/dist/shadowMonitor.js" "$zs_root/dist/shadowMonitor.js"
  cp "$backup/trading-bot/src/nifty-shadow.ts" "$bot_root/src/nifty-shadow.ts"
  cp "$backup/trading-bot/dist/src/nifty-shadow.js" "$bot_root/dist/src/nifty-shadow.js"
  cp "$backup/trading-bot/src/index.ts" "$bot_root/src/index.ts"
  cp "$backup/trading-bot/dist/src/index.js" "$bot_root/dist/src/index.js"
  pm2 restart trading-bot --update-env >/dev/null 2>&1 || true
  pm2 restart nifty-shadow --update-env >/dev/null 2>&1 || true
  pm2 restart zeroscreen --update-env >/dev/null 2>&1 || true
  echo "DEPLOY_ROLLED_BACK backup=$backup" >&2
}
trap rollback ERR

install -m 0644 /tmp/zeroscreen-shadowMonitor.ts "$zs_root/src/shadowMonitor.ts"
install -m 0644 /tmp/zeroscreen-shadowMonitor.js "$zs_root/dist/shadowMonitor.js"
install -m 0644 /tmp/nifty-shadow.ts "$bot_root/src/nifty-shadow.ts"
install -m 0644 /tmp/nifty-shadow.js "$bot_root/dist/src/nifty-shadow.js"
install -m 0644 /tmp/trading-bot-index.ts "$bot_root/src/index.ts"
install -m 0644 /tmp/trading-bot-index.js "$bot_root/dist/src/index.js"

node --check "$zs_root/dist/shadowMonitor.js"
node --check "$bot_root/dist/src/nifty-shadow.js"
node --check "$bot_root/dist/src/index.js"
grep -q 'processName = underlying === "NIFTY" ? "nifty-shadow"' "$zs_root/dist/shadowMonitor.js"
grep -q 'isCompletedCandle' "$bot_root/dist/src/nifty-shadow.js"
grep -q 'EOD wall-clock recovery' "$bot_root/dist/src/nifty-shadow.js"
grep -q 'todayIndex15mInFlight === request' "$bot_root/dist/src/index.js"
grep -q 'drishtiLastResetDay !== todayKey' "$bot_root/dist/src/index.js"
grep -q 'BH_EOD_DEFERRED' "$bot_root/dist/src/index.js"

cd "$bot_root"
pm2 restart trading-bot --update-env
pm2 restart nifty-shadow --update-env
cd "$zs_root"
pm2 restart zeroscreen --update-env

ready=0
for _ in $(seq 1 30); do
  if pm2 pid nifty-shadow | grep -Eq '^[1-9][0-9]*$' \
    && pm2 pid trading-bot | grep -Eq '^[1-9][0-9]*$' \
    && pm2 pid zeroscreen | grep -Eq '^[1-9][0-9]*$' \
    && node -e 'const h=require("/home/ubuntu/trading-bot/nifty-shadow-heartbeat.json"); const age=(Date.now()-new Date(h.at).getTime())/1000; process.exit(h.status==="RUNNING" && age<120 ? 0 : 1)' \
    && curl -fsS -o /dev/null http://127.0.0.1:4000/signals; then
    ready=1
    break
  fi
  sleep 2
done
test "$ready" = "1"

http_status="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/signals)"
case "$http_status" in
  200|302) ;;
  *) echo "Unexpected /signals HTTP status: $http_status" >&2; false ;;
esac

pm2 save --force >/dev/null
rm -f /tmp/zeroscreen-shadowMonitor.ts /tmp/zeroscreen-shadowMonitor.js /tmp/nifty-shadow.ts /tmp/nifty-shadow.js /tmp/trading-bot-index.ts /tmp/trading-bot-index.js /tmp/deploy-vps-shadow-trigger-health-fix.sh
trap - ERR

echo "DEPLOY_OK backup=$backup http=$http_status"
