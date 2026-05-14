import urllib.request, urllib.parse, json, time

TOKEN = "8194627984:AAFqK7t9ZJKFiBoecUGYSdrnJakDrdU42oA"
CHAT  = "711985026"

def send(msg, label=""):
    if label:
        print(f"Sending: {label}...")
    data = urllib.parse.urlencode({
        "chat_id": CHAT,
        "text": msg,
        "parse_mode": "MarkdownV2",
        "disable_web_page_preview": "true"
    }).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TOKEN}/sendMessage",
        data=data, method="POST"
    )
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=10).read())
        print("  OK" if resp.get("ok") else f"  ERR: {resp.get('description')}")
    except Exception as e:
        print(f"  FAIL: {e}")
    time.sleep(0.5)

# ── 1. BOT STARTED ─────────────────────────────────────────────────────────
send(
    "\U0001f7e2 *BANKNIFTY Bot Started*\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "Strategy: *HYBRID REVERSE*\n"
    "Mode: *PAPER* \u00b7 Qty: 30\n"
    "Premium: \u20b9450\u2013\u20b9600\n"
    "SL: 100 pts \u00b7 Entry buffer: 25 pts\n"
    "\u23f0 9:00:02 am\n"
    "[\U0001f511 Refresh Token if needed](https://139\-59\-18\-52\.nip\.io/login)",
    "BOT STARTED"
)

# ── 2. BOT RESTARTED (flat) ────────────────────────────────────────────────
send(
    "\u21ba *Bot Restarted* \u2014 No Trade\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "Position: FLAT\n"
    "Day P&L: \-151 pts \u00b7 Trades: 4/5\n"
    "Mode: PAPER \u00b7 Qty: 30\n"
    "[\U0001f511 Token Refresh](https://139\-59\-18\-52\.nip\.io/login)",
    "BOT RESTARTED (FLAT)"
)

# ── 3. TRADE ENTRY ─────────────────────────────────────────────────────────
send(
    "\U0001f4ca *BREAKOUT ENTRY \u2014 CE*\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "Symbol: `BANKNIFTY26MAY55000CE`\n"
    "Premium: *\u20b9487* \u00b7 Qty: 30 lots\n"
    "Index entry: *54482* \u00b7 SL: 54382 \(\-100 pts\)\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "Capital deployed: *\u20b914,610*\n"
    "Re\-entry allowed: Yes",
    "TRADE ENTRY"
)

# ── 4. TRADE EXIT (profit) ──────────────────────────────────────────────────
send(
    "\u2705 *\U0001f3af LOCK50 \u00b7 EXIT \u2014 Trail SL*\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "Symbol: `BANKNIFTY26MAY55000CE`\n"
    "Direction: *CE*\n"
    "Entry index: 54482\n"
    "Exit index: 54792\n"
    "Index P&L: *\+310 pts*\n"
    "\u20b9 est: *\+\u20b94,650* \(30qty\xd70\.5\u03b4\)\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "Day P&L so far: \+159 pts",
    "TRADE EXIT (WIN)"
)

# ── 5. TRADE EXIT (loss) ────────────────────────────────────────────────────
send(
    "\U0001f534 *\U0001f3af LOCK50 \u00b7 EXIT \u2014 Stop Loss*\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "Symbol: `BANKNIFTY26MAY55000CE`\n"
    "Direction: *CE*\n"
    "Entry index: 54482\n"
    "Exit index: 54382\n"
    "Index P&L: *\-100 pts*\n"
    "\u20b9 est: *\-\u20b91,500* \(30qty\xd70\.5\u03b4\)\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "Day P&L so far: \-100 pts",
    "TRADE EXIT (LOSS)"
)

# ── 6. TOKEN EXPIRED ───────────────────────────────────────────────────────
send(
    "\u26a0\ufe0f *TOKEN EXPIRED*\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "Bot cannot fetch market data\.\n"
    "[\U0001f511 Refresh Token Now](https://139\-59\-18\-52\.nip\.io/login)\n"
    "Time: 9:17 am IST",
    "TOKEN EXPIRED"
)

# ── 7. DAILY LOSS LIMIT HIT ────────────────────────────────────────────────
send(
    "\U0001f6a8 *DAILY LOSS LIMIT HIT*\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "Loss: *\-350 pts* \u00b7 Trades: 3/5\n"
    "Trading stopped for today",
    "DAILY LOSS LIMIT"
)

print("\nAll samples sent!")
