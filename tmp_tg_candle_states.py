import urllib.request, urllib.parse, json, time

TOKEN = "8194627984:AAFqK7t9ZJKFiBoecUGYSdrnJakDrdU42oA"
CHAT  = "711985026"

def send(msg, label=""):
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
    time.sleep(0.8)

# ── STATE 1: WATCHING FOR BREAKOUT (no trade yet, morning) ─────────────────
send(
    "\U0001f56f\ufe0f *15\-Min Candle*  9:45 am, 12/5  \U0001f7e2 Bullish\n"
    "O: 54310\\.0  H: 54468\\.5  L: 54290\\.0  C: 54432\\.0\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "\U0001f3af *LOCK50*\n"
    "\U0001f441 Watching\n"
    "\U0001f4c8 CE \u2265 *54493*  \u2014  61 pts away\n"
    "\U0001f4c9 PE \u2264 *54382*  \u2014  50 pts away\n"
    "Live: *54432*\n"
    "\U0001f4ca *\+0 pts*  \u00b7  Trades: 0/5\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "\U0001f441 *TRAIL*  \u00b7  Watching\n"
    "\U0001f4c8 CE \u2265 *54493*  \u2014  61 pts away\n"
    "\U0001f4c9 PE \u2264 *54382*  \u2014  50 pts away\n"
    "\U0001f4ca *\+0 pts*  \u00b7  T:0/5\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "[\U0001f511 Token](https://139\-59\-18\-52\\.nip\\.io/login)  \u00b7  [\U0001f4ca Dashboard](http://139\\.59\\.18\\.52/dashboard)",
    "1. WATCHING (morning, no trade)"
)

# ── STATE 2: SIGNAL FIRED + IN TRADE ──────────────────────────────────────
send(
    "\U0001f56f\ufe0f *15\-Min Candle*  10:00 am, 12/5  \U0001f7e2 Bullish\n"
    "O: 54432\\.0  H: 54520\\.0  L: 54410\\.0  C: 54508\\.0\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "\U0001f3af *LOCK50*\n"
    "\U0001f525 *In Trade \u00b7 CE*\n"
    "Entry: 54493  \u00b7  SL: 54393  \(\u221290 pts\)\n"
    "\U0001f4c8 *\+15 pts gathered*  \u00b7  SL: 54393\n"
    "\U0001f4ca *\+15 pts*  \u00b7  Trades: 1/5\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "\U0001f441 *TRAIL*  \u00b7  CE In Trade\n"
    "\U0001f4c8 *\+15 pts gathered*  \u00b7  SL: 54393\n"
    "Entry: 54493  \u00b7  1W 0L  \u00b7  T:1/5\n"
    "\U0001f4ca *\+15 pts*\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "[\U0001f511 Token](https://139\-59\-18\-52\\.nip\\.io/login)  \u00b7  [\U0001f4ca Dashboard](http://139\\.59\\.18\\.52/dashboard)",
    "2. IN TRADE (CE, +15 pts)"
)

# ── STATE 3: IN TRADE (good profit, trail locked) ─────────────────────────
send(
    "\U0001f56f\ufe0f *15\-Min Candle*  11:15 am, 12/5  \U0001f7e2 Bullish\n"
    "O: 54600\\.0  H: 54820\\.0  L: 54580\\.0  C: 54790\\.0\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "\U0001f3af *LOCK50*\n"
    "\U0001f525 *In Trade \u00b7 CE*\n"
    "Entry: 54493  \u00b7  SL: 54690  \(\-100 pts\)\n"
    "\U0001f4c8 *\+297 pts gathered*  \u00b7  SL: 54690\n"
    "\U0001f4ca *\+297 pts*  \u00b7  Trades: 1/5\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "\U0001f441 *TRAIL*  \u00b7  CE In Trade\n"
    "\U0001f4c8 *\+297 pts gathered*  \u00b7  SL: 54590\n"
    "Entry: 54493  \u00b7  1W 0L  \u00b7  T:1/5\n"
    "\U0001f4ca *\+297 pts*\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "[\U0001f511 Token](https://139\-59\-18\-52\\.nip\\.io/login)  \u00b7  [\U0001f4ca Dashboard](http://139\\.59\\.18\\.52/dashboard)",
    "3. IN TRADE (CE, +297 pts, trail locked)"
)

# ── STATE 4: DONE FOR DAY (today's actual) ────────────────────────────────
send(
    "\U0001f56f\ufe0f *15\-Min Candle*  3:30 pm, 11/5  \U0001f7e2 Bullish\n"
    "O: 54382\\.8  H: 54460\\.2  L: 54379\\.5  C: 54454\\.4\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "\U0001f3af *LOCK50*\n"
    "\u2705 Done for Day\n"
    "\U0001f4ca *\-151 pts*  \u00b7  Trades: 4/5\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "\u2705 *TRAIL*  \u00b7  Done for Day\n"
    "\U0001f4ca *\+0 pts*  \u00b7  0W 0L  \u00b7  T:0/5\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "[\U0001f511 Token](https://139\-59\-18\-52\\.nip\\.io/login)  \u00b7  [\U0001f4ca Dashboard](http://139\\.59\\.18\\.52/dashboard)",
    "4. DONE FOR DAY"
)

# ── STATE 5: RE-ENTRY WAITING ──────────────────────────────────────────────
send(
    "\U0001f56f\ufe0f *15\-Min Candle*  10:30 am, 12/5  \U0001f534 Bearish\n"
    "O: 54508\\.0  H: 54515\\.0  L: 54380\\.0  C: 54395\\.0\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "\U0001f3af *LOCK50*\n"
    "\u21a9\ufe0f *Re\-Entry \u00b7 CE*\n"
    "Next: CE close > *54520*  \u00b7  \u274c 125 pts away\n"
    "Live: *54395*\n"
    "\U0001f4ca *\-100 pts*  \u00b7  Trades: 1/5\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "\U0001f441 *TRAIL*  \u00b7  Watching\n"
    "\U0001f4c8 CE \u2265 *54520*  \u2014  125 pts away\n"
    "\U0001f4c9 PE \u2264 *54370*  \u2014  25 pts away\n"
    "\U0001f4ca *\-100 pts*  \u00b7  T:1/5\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "[\U0001f511 Token](https://139\-59\-18\-52\\.nip\\.io/login)  \u00b7  [\U0001f4ca Dashboard](http://139\\.59\\.18\\.52/dashboard)",
    "5. RE-ENTRY WAITING"
)

print("\nAll candle state samples sent!")
