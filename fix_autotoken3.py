with open('/home/ubuntu/trading-bot/auto_token.js', 'r') as f:
    txt = f.read()

# Add Telegram helper after the http require lines
telegram_fn = """
// -- Telegram notification helper --
function sendTelegram(msg) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat  = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  const data = JSON.stringify({ chat_id: chat, text: msg });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  }, () => {});
  req.on('error', () => {});
  req.write(data); req.end();
}

"""

txt = txt.replace(
    "const API_KEY = process.env.API_KEY;",
    "const API_KEY = process.env.API_KEY;\n" + telegram_fn
)

# Add success Telegram message
txt = txt.replace(
    "    console.log('[auto_token] \u2714 Token refreshed and bot restarted successfully');",
    "    console.log('[auto_token] \u2714 Token refreshed and bot restarted successfully');\n    sendTelegram('\u2705 Token refreshed at 7:30 AM IST - bot is live and running');"
)

# Add failure Telegram message
txt = txt.replace(
    "main().catch(e => {\n  console.error('[auto_token] FAILED:', e.message);\n  process.exit(1);\n});",
    "main().catch(e => {\n  console.error('[auto_token] FAILED:', e.message);\n  sendTelegram('\u274c Token refresh FAILED: ' + e.message.slice(0, 200) + '\\n\\nLogin manually: http://139.59.18.52:3001/login');\n  setTimeout(() => process.exit(1), 2000);\n});"
)

with open('/home/ubuntu/trading-bot/auto_token.js', 'w') as f:
    f.write(txt)
print('Telegram notifications added')
