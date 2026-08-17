#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%Y%m%d-%H%M%S)"
backup="/root/deploy-backups/news-trade-picks-${stamp}"
zs_root="/root/zeroscreen"
mkdir -p "$backup/zeroscreen/src" "$backup/zeroscreen/dist"
cp "$zs_root/src/server.ts" "$backup/zeroscreen/src/server.ts"
cp "$zs_root/dist/server.js" "$backup/zeroscreen/dist/server.js"

rollback() {
  cp "$backup/zeroscreen/src/server.ts" "$zs_root/src/server.ts"
  cp "$backup/zeroscreen/dist/server.js" "$zs_root/dist/server.js"
  cd "$zs_root"
  pm2 restart zeroscreen --update-env >/dev/null 2>&1 || true
  echo "DEPLOY_ROLLED_BACK backup=$backup" >&2
}
trap rollback ERR

install -m 0644 /tmp/zeroscreen-server.ts "$zs_root/src/server.ts"
install -m 0644 /tmp/zeroscreen-server.js "$zs_root/dist/server.js"
node --check "$zs_root/dist/server.js"
grep -q 'Daily News Trade Ideas' "$zs_root/dist/server.js"
grep -q 'buildNewsTradeIdeas' "$zs_root/dist/server.js"

cd "$zs_root"
pm2 restart zeroscreen --update-env
ready=0
for _ in $(seq 1 30); do
  if pm2 pid zeroscreen | grep -Eq '^[1-9][0-9]*$' && curl -fsS -o /dev/null http://127.0.0.1:4000/today; then
    ready=1
    break
  fi
  sleep 2
done
test "$ready" = "1"
pm2 save --force >/dev/null
rm -f /tmp/zeroscreen-server.ts /tmp/zeroscreen-server.js /tmp/deploy-vps-news-trade-picks.sh
trap - ERR
echo "DEPLOY_OK backup=$backup"
