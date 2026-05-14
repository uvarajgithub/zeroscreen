import urllib.request, urllib.parse, json

TOKEN = "8194627984:AAFqK7t9ZJKFiBoecUGYSdrnJakDrdU42oA"
CHAT  = "711985026"

msg = (
    "\U0001f56f\ufe0f *15\-Min Candle*  3:30 pm, 11/5  \U0001f7e2 Bullish\n"
    "O: 54382\.8  H: 54460\.15  L: 54379\.5  C: 54454\.35\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "\U0001f3af *LOCK50*\n"
    "\u2705 Done for Day\n"
    "\U0001f4ca *\-151 pts*  \u00b7  Trades: 4/5\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "\U0001f441 *TRAIL*  \u00b7  Watching\n"
    "\U0001f4c8 CE \u2265 *54479*  \u2014  1 pt away\n"
    "\U0001f4c9 PE \u2264 *54332*  \u2014  120 pts away\n"
    "\U0001f4ca *\+0 pts*  \u00b7  T:0/5\n"
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
    "[\U0001f511 Token](https://139\-59\-18\-52\.nip\.io/login)  \u00b7  [\U0001f4ca Dashboard](http://139\.59\.18\.52/dashboard)"
)

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
resp = json.loads(urllib.request.urlopen(req, timeout=10).read())
print("OK" if resp.get("ok") else f"ERR: {resp}")
