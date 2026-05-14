#!/bin/bash
# Check bot process env and fix if Telegram vars missing
PID=$(ps aux | grep 'trading-bot/dist/src/index' | grep -v grep | awk '{print $2}' | head -1)
echo "Bot PID: $PID"
if [ -n "$PID" ]; then
    cat /proc/$PID/environ | tr '\0' '\n' | grep -E 'TELEGRAM|ACCESS_TOKEN|API_KEY|PWD'
else
    echo "Bot process not found"
fi
echo "---"
echo ".env contents:"
cat /home/ubuntu/trading-bot/.env
echo "---dotenv test---"
cd /home/ubuntu/trading-bot && node -e "require('dotenv').config(); console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? 'SET' : 'MISSING'); console.log('TELEGRAM_CHAT_ID:', process.env.TELEGRAM_CHAT_ID ? 'SET' : 'MISSING'); console.log('ACCESS_TOKEN:', process.env.ACCESS_TOKEN ? 'SET' : 'MISSING');"
