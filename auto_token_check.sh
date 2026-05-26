#!/bin/bash
TOKEN_FILE=/home/ubuntu/trading-bot/access_token.txt
LOG=/home/ubuntu/trading-bot/logs/auto_token.log
TODAY=$(date "+%Y-%m-%d")
# Check if access_token.txt was written today (auto_token.js writes it on success)
if [ -f "$TOKEN_FILE" ] && [ "$(date -r "$TOKEN_FILE" '+%Y-%m-%d')" = "$TODAY" ]; then
  echo "[auto_token_check] $TODAY: token already refreshed today (file date ok), skipping." >> "$LOG"
else
  echo "[auto_token_check] $TODAY: token not refreshed yet — running fallback at 02:30 UTC..." >> "$LOG"
  node /home/ubuntu/trading-bot/auto_token.js >> "$LOG" 2>&1
fi
