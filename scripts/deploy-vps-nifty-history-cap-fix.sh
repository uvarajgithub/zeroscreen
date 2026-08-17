#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%Y%m%d-%H%M%S)"
backup="/root/deploy-backups/nifty-history-cap-${stamp}"
bot_root="/home/ubuntu/trading-bot"
mkdir -p "$backup/src" "$backup/dist/src"
cp "$bot_root/src/nifty-shadow.ts" "$backup/src/nifty-shadow.ts"
cp "$bot_root/dist/src/nifty-shadow.js" "$backup/dist/src/nifty-shadow.js"

rollback() {
  cp "$backup/src/nifty-shadow.ts" "$bot_root/src/nifty-shadow.ts"
  cp "$backup/dist/src/nifty-shadow.js" "$bot_root/dist/src/nifty-shadow.js"
  cd "$bot_root"
  pm2 restart nifty-shadow --update-env >/dev/null 2>&1 || true
  echo "DEPLOY_ROLLED_BACK backup=$backup" >&2
}
trap rollback ERR

install -m 0644 /tmp/nifty-shadow.ts "$bot_root/src/nifty-shadow.ts"
install -m 0644 /tmp/nifty-shadow.js "$bot_root/dist/src/nifty-shadow.js"
node --check "$bot_root/dist/src/nifty-shadow.js"
grep -q 'Date.now() - 7 \* 86400000' "$bot_root/dist/src/nifty-shadow.js"

cd "$bot_root"
pm2 restart nifty-shadow --update-env
ready=0
for _ in $(seq 1 75); do
  if pm2 pid nifty-shadow | grep -Eq '^[1-9][0-9]*$' \
    && node -e 'const h=require("./nifty-shadow-heartbeat.json"); const s=Object.values(h.strategies||{}); process.exit(h.status==="RUNNING" && s.length===14 && s.every(x=>Array.isArray(x.candleLog)&&x.candleLog.length>0) ? 0 : 1)'; then
    ready=1
    break
  fi
  sleep 2
done
test "$ready" = "1"
pm2 save --force >/dev/null
rm -f /tmp/nifty-shadow.ts /tmp/nifty-shadow.js /tmp/deploy-vps-nifty-history-cap-fix.sh
trap - ERR
echo "DEPLOY_OK backup=$backup"
