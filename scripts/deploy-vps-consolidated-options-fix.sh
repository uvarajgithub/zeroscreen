#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%Y%m%d-%H%M%S)"
backup="/root/deploy-backups/consolidated-options-${stamp}"
zs_root="/root/zeroscreen"
mkdir -p "$backup/zeroscreen/src" "$backup/zeroscreen/dist"
cp "$zs_root/src/shadowMonitor.ts" "$backup/zeroscreen/src/shadowMonitor.ts"
cp "$zs_root/dist/shadowMonitor.js" "$backup/zeroscreen/dist/shadowMonitor.js"

rollback() {
  cp "$backup/zeroscreen/src/shadowMonitor.ts" "$zs_root/src/shadowMonitor.ts"
  cp "$backup/zeroscreen/dist/shadowMonitor.js" "$zs_root/dist/shadowMonitor.js"
  cd "$zs_root"
  pm2 restart zeroscreen --update-env >/dev/null 2>&1 || true
  echo "DEPLOY_ROLLED_BACK backup=$backup" >&2
}
trap rollback ERR

install -m 0644 /tmp/zeroscreen-shadowMonitor.ts "$zs_root/src/shadowMonitor.ts"
install -m 0644 /tmp/zeroscreen-shadowMonitor.js "$zs_root/dist/shadowMonitor.js"
node --check "$zs_root/dist/shadowMonitor.js"
grep -q 'data-consolidated-instrument="OPTIONS"' "$zs_root/dist/shadowMonitor.js"
grep -q 'visibleTiles=tiles.filter' "$zs_root/dist/shadowMonitor.js"

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
rm -f /tmp/zeroscreen-shadowMonitor.ts /tmp/zeroscreen-shadowMonitor.js /tmp/deploy-vps-consolidated-options-fix.sh
trap - ERR
echo "DEPLOY_OK backup=$backup"
