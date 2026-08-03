#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%Y%m%d-%H%M%S)"
backup="/root/deploy-backups/nifty-shadow-${stamp}"
mkdir -p "$backup/zeroscreen/src" "$backup/zeroscreen/dist" "$backup/trading-bot/src" "$backup/trading-bot/dist"

cp /root/zeroscreen/src/server.ts "$backup/zeroscreen/src/"
cp /root/zeroscreen/src/shadowMonitor.ts "$backup/zeroscreen/src/"
cp /root/zeroscreen/dist/server.js "$backup/zeroscreen/dist/"
cp /root/zeroscreen/dist/shadowMonitor.js "$backup/zeroscreen/dist/"
if [[ -f /home/ubuntu/trading-bot/src/nifty-shadow.ts ]]; then cp /home/ubuntu/trading-bot/src/nifty-shadow.ts "$backup/trading-bot/src/"; fi
if [[ -f /home/ubuntu/trading-bot/dist/src/nifty-shadow.js ]]; then cp /home/ubuntu/trading-bot/dist/src/nifty-shadow.js "$backup/trading-bot/dist/"; fi

install -m 0644 /tmp/nifty-shadow.ts /home/ubuntu/trading-bot/src/nifty-shadow.ts
install -m 0644 /tmp/nifty-shadow.js /home/ubuntu/trading-bot/dist/src/nifty-shadow.js
cd /home/ubuntu/trading-bot
pm2 delete nifty-shadow >/dev/null 2>&1 || true
pm2 start dist/src/nifty-shadow.js --name nifty-shadow --cwd /home/ubuntu/trading-bot

heartbeat_ok=0
for _ in $(seq 1 30); do
  if [[ -f nifty-shadow-heartbeat.json ]] && node -e 'const h=require("./nifty-shadow-heartbeat.json"); process.exit(h.status === "RUNNING" && h.executionMode === "SHADOW" ? 0 : 1)'; then
    heartbeat_ok=1
    break
  fi
  sleep 2
done
if [[ "$heartbeat_ok" != "1" ]]; then
  pm2 logs nifty-shadow --nostream --lines 40
  exit 1
fi
node -e 'const h=require("./nifty-shadow-heartbeat.json"); console.log(`NIFTY_HEARTBEAT_OK strategies=${Object.keys(h.strategies || {}).length}`)'

install -m 0600 /tmp/server.ts /root/zeroscreen/src/server.ts
install -m 0600 /tmp/shadowMonitor.ts /root/zeroscreen/src/shadowMonitor.ts
install -m 0644 /tmp/server.js /root/zeroscreen/dist/server.js
install -m 0644 /tmp/shadowMonitor.js /root/zeroscreen/dist/shadowMonitor.js
pm2 restart zeroscreen --update-env
pm2 save --force
sleep 3
pm2 describe zeroscreen | grep -q 'status.*online'
pm2 describe nifty-shadow | grep -q 'status.*online'
echo "DEPLOY_OK backup=$backup"
