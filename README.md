# ZeroScreen — Self-Hosted NSE Stock Screener + Trading Platform

Live at **http://139.59.18.52:4000**

---

## What You See, Screen by Screen

### 1. Launch URL — `http://139.59.18.52:4000/`

**Stock Screener (home page) — no login required**

The first thing you land on is the full NSE screener. No signup wall.

- **Nav bar** — ZeroScreen brand · 5 primary links (Screener, Signals, Dashboard, Strategies, Paper Trade) · More dropdown · search bar · dark mode toggle · Sign In
- **News ticker** — scrolling market headlines across the top
- **Strategy preset cards** — 14 one-click strategies: Quality Blue Chips, Debt-Free, Growth, Value, High ROCE, Dividend, Promoter, Small Cap, Penny, High Value, Long Term, Short Term, Swing, Options
- **Filter panel** (collapsible) — ROCE, ROE, D/E, Promoter %, P/E, Price range, Market Cap, Volume, Sector, Change %, 52-Week proximity, Profitable years, Profit uptrend
- **Results table** — up to 50 stocks per page, columns: Symbol, Company, Sector, Price, Change %, Volume, ROCE, ROE, D/E, Promoter %, P/E, Market Cap, Profitable
  - Debt-free stocks show "Debt-free 💎"
  - Change % colored green/red
  - ROCE colored green → yellow → red
- **Pagination** — Prev / Next with filter state preserved
- **Column toggles** — show/hide any metric column
- **Multi-select compare** — tick checkboxes → "Compare Selected" button appears

---

### 2. Stock Detail — `http://139.59.18.52:4000/stock/RELIANCE`

Click any symbol in the screener to open its detail page.

- **Hero bar** — symbol, company name, live price, change %, day high/low, prev close, 52-week range slider
- **TradingView chart** — full interactive price chart (550px, syncs dark/light mode)
- **8 KPI cards** — Market Cap, ROCE, ROE, D/E Ratio, P/E Ratio, EPS, Book Value, Dividend Yield
- **6 financial charts** — Net Profit (bar), Revenue (line), ROCE vs ROE (grouped bar), Promoter Holding (doughnut), Valuation (P/E · P/B · Current Ratio · Div Yield), Profit Margin %
- **Metrics table** — all fundamentals in one scrollable table
- **About** — company description, sector, year established
- **Live news** — Google News headlines for the stock grouped by Today / Yesterday / Last 7 Days / Older
- **Action buttons** — Refresh Data · Add to Watchlist · 📋 Paper Trade (green) · screener.in · NSE India links
  - "📋 Paper Trade" button opens `/my-paper-trade?buy=SYMBOL` with symbol + live price pre-filled

---

### 3. Signals — `http://139.59.18.52:4000/signals`

**Theme: Emerald/Teal — Public, no login**

Live BANKNIFTY options bot — refreshes every 8 seconds automatically.

- **Active position card** (when bot is in a trade):
  - Direction badge — CE (green) or PE (red)
  - Entry price, Stop Loss, Quantity, AI confidence score
  - Live unrealised PnL
- **Flat state card** — "💤 No Active Position" when bot is idle
- **Today's stats bar** — Today's PnL · Total trades · Wins · Losses · Max Drawdown · All-time Win Rate
- **Recent trades** — last 20 trades as cards, each showing:
  - Direction badge (CE/PE)
  - PnL amount (green if profit, red if loss)
  - Entry price · Exit price · Duration · Exit reason (TARGET HIT / SL HIT / EOD)
  - Timestamp in IST

---

### 4. My Trade / Unified Dashboard — `http://139.59.18.52:4000/dashboard`

**Login required — unified for all roles (members + admin)**

The main hub for every logged-in user. Replaces the old fragmented `/dashboard`, `/paper-trade/bot-stats`, and `/my-portfolio` routes (all now redirect here).

#### Layout
- **Header** — "My Trading Dashboard" + user name badge + quick action buttons (+ New Trade, 🤖 Schedule Bot)
- **📊 Portfolio Stats** — collapsible panel (collapsed by default). Click to expand KPI cards:
  - Portfolio Value · Cash Balance · Total P&L · This Week (Manual) · Win Rate · Open Positions
  - _(Admin only)_ Bot P&L (All Time) · Bot This Week

#### Tabs
| Tab | Who sees it | Description |
|-----|-------------|-------------|
| 📂 Positions (N) | All users | Open paper trade positions with live P&L and inline Sell form |
| 🛒 My Trades (N) | All users | Closed (SELL) paper trades — date, symbol, type, qty, buy ₹, sell ₹, P&L, P&L% |
| 📅 Weekly | All users | Manual trade P&L grouped by week (last 8 weeks). Empty state links to paper trade |
| 📆 Monthly | All users | Manual trade P&L grouped by month (last 6 months) with cards + table |
| 📌 Picks Tracker | **Admin only** | Full picks tracker with In Position / Pending / Executed sub-tabs |

#### Picks Tracker (Admin only) — In Position sub-tab
- **Hero summary row**: Overall Unrealized P&L (big green/red card) · Positions count · In Profit · In Loss
- **Table columns**: Symbol · Direction · Qty · Entry Price · Target · SL · CMP · P&L (₹ + % stacked) · Entry At
- P&L uses `entry_price` field if set, otherwise mid-point of entry zone; direction-aware (BULLISH/BEARISH)

#### Picks Tracker — Pending sub-tab
- Table: Symbol · Type · Direction · Qty · Entry Zone · Target · SL · CMP (🔔 if price is in zone)

#### Picks Tracker — Executed sub-tab
- Table: Symbol · Direction · Qty · Result (pill badge) · Entry ₹ · Result ₹ · P&L (₹ + %) · Date

---

### 5. My Paper Trade — `http://139.59.18.52:4000/my-paper-trade`

**Admin only** (members are redirected to `/dashboard`)

Admin's full paper trade portfolio page with additional bot sections.

#### Standard sections
- Hero · Credits bar · 6 KPI cards · Buy form · Equity curve · Open Positions · Trade History · Reset

#### Admin-only additions
- **📅 Scheduled Trades** — mode, symbol, direction, details, status, cancel button
- **🤖 Auto Bot Trade History** — date, symbol, direction, entry/exit, qty, P&L, duration, reason
- **Today's Picks Tracker** — same In Position / Pending / Executed tabs as dashboard (with Qty + P&L columns)

---

**Theme: Amber/Orange — Public, no login**

Showcases the bot's proprietary strategy without revealing any logic or names.

- **Strategy hero** — "Proprietary Intraday Strategy" badge · headline · 4 live backtest stats (5-Year PnL, months backtested, % profitable months, trading days)
- **4 benefit cards** with real numbers:
  - Consistent Edge — win rates from backtest
  - Fully Automated — 9:15 AM to 3:30 PM, zero manual intervention
  - Built-in Risk Control — per-trade stop loss details
  - Dual Signal Confirmation — two independent models must agree
- **Screener Presets grid** — all 14 strategy cards with description + one-click link to filtered screener

---

### 6. Paper Trade (Bot) — `http://139.59.18.52:4000/paper-trade`

**Theme: Pink/Rose — Public, no login**

Simulated portfolio tracking across 3 concurrent strategies run by the bot engine.

- **CTA banner** — "Trade Any NSE Stock — Paper Trade It!" links logged-in users to their personal portfolio (`/my-paper-trade`)
- **KPI summary bar** — Total PnL · Closed Trades · Win Rate · Wins · Losses · Avg PnL/Trade · Open Positions
- **By-strategy cards** — BANKNIFTY Options · Equity Swing · Penny Stocks (each with individual PnL and trade count)
- **Equity curve** — Chart.js line chart built from all closed trades sorted by exit date
- **Monthly summary table** — Period · Trades · Win Rate · Best Trade · Worst Trade · Monthly PnL
- **Full trade history** (last 50) — Symbol · Direction badge (LONG/SHORT) · Entry · Exit · Qty · Status badge (TARGET HIT / SL HIT / OPEN / EOD EXIT / EXPIRED) · Hold Days · PnL · PnL%
- Data written nightly at 7:36 PM IST by paper-trade-engine; shows empty state until first run

---

### 7. My Paper Trade — `http://139.59.18.52:4000/my-paper-trade`

**Login + mobile verification required**

Personal paper trading portfolio for every registered user. No broker account needed. Virtual money only.

#### Access Flow
1. Sign up / log in → redirected to `/verify-mobile` (one-time setup)
2. Enter 10-digit Indian mobile → 6-digit OTP via SMS (Fast2SMS) → verified
3. Land on personal portfolio with ₹1,00,000 virtual balance

#### Credits & Subscription
- **Free plan**: 10 paper trades total (configurable by admin)
- **Premium**: Unlimited trades per month (₹499/month subscription)
- **Credits bar** shows remaining free trades or "Premium — Unlimited trades"
- When free limit is reached → redirected to `/my-paper-trade/upgrade`

#### Market Hours Enforcement
- Buy and Sell only work **Mon–Fri, 9:15 AM – 3:30 PM IST** (NSE hours)
- Live **🟢 Market Open / 🔴 Market Closed** badge shown at all times
- Error message when trying to trade outside hours

#### Portfolio Page Features
- **Hero** — portfolio name, ₹ available cash balance
- **Credits & market hours bar** — free trades left / premium badge + market status
- **6 KPI cards** — Portfolio Value · Total PnL · Realized PnL · Win Rate · Wins/Losses · Invested
- **Buy form**:
  - Stock search with autocomplete (symbol + company name)
  - Trade type dropdown — **Intraday** or **Holding**
  - Qty, Price (auto-filled from DB on symbol select), estimated cost
  - Buy blocked when market is closed or credits exhausted
- **Open Positions table** — Symbol · Company · Type (INTRA/HOLD badge) · Qty · Avg Price · Invested · Live Price · Current Value · P&L · P&L% · inline Sell form
- **Realized P&L equity curve** — Chart.js line chart from all sell trades
- **Trade History table** — Date/Time · Symbol · Type · Action (BUY/SELL badge) · Qty · Price · Total · P&L · P&L% · Balance After
- **Reset button** — wipes all positions and trades, restarts with ₹1,00,000

---

### 8. Verify Mobile — `http://139.59.18.52:4000/verify-mobile`

**Login required — one-time setup before paper trading**

- Enter 10-digit Indian mobile number
- 6-digit OTP sent via Fast2SMS (set `FAST2SMS_API_KEY` env var); logs to console in dev mode
- Rate-limited: max 3 OTP requests per mobile per hour
- On success: mobile stored + `mobile_verified = 1` set in DB → redirected to paper trade

---

### 9. Paper Trade Settings — `http://139.59.18.52:4000/my-paper-trade/config`

**Login required** (Auto-trade toggle requires Premium or Admin)

Configure default parameters for new paper trades:

- **Default Trade Type** — Intraday (square off same day) or Holding (positional / multi-day)
- **Default Quantity** — pre-fills qty field on buy form
- **Default Stop Loss %** — reference for risk management (stored, not auto-enforced)
- **Default Target %** — reference for profit target
- **Max Open Positions** — user-defined limit (stored as preference)
- **🔥 Auto-trade Today's Picks** _(Premium/Admin only)_ — when enabled, automatically buys all of today's picks at market open (9:15 AM IST) at live price with SL & target set. Positions are auto-sold when SL or target is hit.

Settings are saved per-user and pre-fill the buy form on the portfolio page.

---

### 10. Paper Trade Upgrade — `http://139.59.18.52:4000/my-paper-trade/upgrade`

**Login required**

Upgrade page shown when free trade limit is reached:

- Free plan vs Premium plan feature comparison
- ₹499/month pricing
- "Subscribe Now →" links to existing `/subscribe` (Razorpay) payment flow
- Already-premium users see confirmation message instead

---

### 11. Strategy Builder — `http://139.59.18.52:4000/strategy-builder`

**In the "More" dropdown — Public, no login**

Type a strategy in plain English → instantly get screener filters.

- **Text input** — free-form description area
- **8 example chips** — click to auto-fill and parse
- **Parse engine** (client-side, instant): detects ROCE/ROE/D/E/P/E, company size, 14 sectors, debt-free, profitable, growing, undervalued, dividend, top gainers, 52-week proximity
- **Filter tags** — colored badges showing every parsed filter
- **"Apply to Screener →"** — direct link to screener pre-filled with all detected filters

---

### 12. Compare — `http://139.59.18.52:4000/compare`

**In the "More" dropdown — Public, no login**

- Type 2–5 NSE symbols with autocomplete suggestions
- Side-by-side table: Price · Change % · ROCE · ROE · D/E · Promoter % · P/E · EPS · Book Value · Dividend Yield · Current Ratio · Market Cap · Sector
- **Refresh All Data** button

---

### 13. Watchlists — `http://139.59.18.52:4000/watchlists`

**Login required** — saves across sessions.

- Create named watchlists with descriptions
- View all stocks in a watchlist with live prices
- Add stocks from screener or stock detail page
- Delete watchlist

---

### 14. Alerts — `http://139.59.18.52:4000/alerts`

**Login required**

- Save screener filter combos as named alerts
- Receive weekday morning email digest when stocks match your saved filters

---

### 15. Sign In — `http://139.59.18.52:4000/login`

- **Continue with Google** button (when Google OAuth is configured via env vars)
- Email + password form
- Forgot password link → email reset flow
- **"Continue as guest →"** link — goes straight to screener without any account

---

### 16. Sign Up — `http://139.59.18.52:4000/signup`

- **Sign up with Google** button
- Name + email + password form
- **"Continue as guest →"** link

---

### 17. Admin — `http://139.59.18.52:4000/admin/users`

**Admin role required**

- User management table — name, email, role, registration date, Make Admin action
- KPI cards: Total Users · Admins · Joined Today · Regular Users
- **📈 Analytics** button → `/admin/analytics`
- **📊 Data Control** button → `/admin/data`

---

### 18. Analytics — `http://139.59.18.52:4000/admin/analytics`

**Admin only** — privacy-safe visitor tracking (IP hashed, no PII stored).

- Today's views · Today's unique visitors · All-time views · Pages tracked
- Top 15 pages (last 30 days) with view counts
- Daily breakdown — last 14 days with views and unique visitors
- Recent 30 visits — time, path, visitor hash, user agent

---

## Navigation Structure

```
ZeroScreen
├── 🔍 Screener              /                     (primary · public)
├── � Picks                 /picks                (primary · public)
├── 🤖 Live Bot              /signals              (primary · public)
├── 📋 Paper Trade           /paper-trade          (primary · public)
├── 💼 My Trade (HOT)        /dashboard            (primary · login required → unified dashboard)
└── ▾ Explore
    ├── 🔨 Strategy Builder   /strategy-builder     (public)
    ├── ⭐ Watchlists          /watchlists           (login required)
    ├── 🔔 Alerts              /alerts               (login required)
    ├── ⚖️  Compare             /compare              (public)
    ├── 📬 Contact             /contact              (public)
    └── 🛠 Admin               /admin/users          (admin only)
```

### Route Redirects
| From | To | Notes |
|------|----|-------|
| `/my-portfolio` | `/dashboard` | Members redirected |
| `/paper-trade/bot-stats` | `/dashboard` | Old bot stats route |
| `/my-paper-trade` | Admin-only portfolio page | Members get 403 |

---

## Paper Trading User Flow

```
1. Sign Up → /signup
2. Login  → /login
3. First visit to /my-paper-trade → redirected to /verify-mobile
4. Enter mobile → OTP sent via SMS → enter OTP → verified
5. Land on /my-paper-trade with ₹1,00,000 virtual balance
6. Search any NSE stock → live price auto-fills → select Intraday/Holding → Buy
   (Only works Mon–Fri 9:15 AM – 3:30 PM IST)
7. Watch positions with live P&L
8. Sell when ready → P&L calculated
9. After 10 free trades → prompted to upgrade at /my-paper-trade/upgrade
10. Subscribe at /subscribe (₹499/month) → unlimited trades
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js v22 |
| Language | TypeScript 5.9 |
| Web Framework | Express 4.18 |
| Database | SQLite3 5.1.7 |
| Session Store | SQLite (connect-sqlite3) |
| Auth | express-session + bcrypt + Google OAuth2 (optional) |
| Scheduling | node-cron |
| Email | nodemailer |
| SMS OTP | Fast2SMS (`FAST2SMS_API_KEY` env var) |
| Charting | Chart.js 4.4.2 (CDN) |
| Price Charts | TradingView Embed Widget (iframe) |
| Frontend | Vanilla JS + CSS (no framework) |
| CSS Variables | Custom design system (light · dark · per-page themes) |
| Analytics | SQLite `page_views` table (IP hashed, server-side) |
| Data Source | screener.in (scraped), NSE India (prices) |
| Bot Data | `/root/trading-bot/trades.json`, `trade-state.json` |
| Paper Data | `/home/ubuntu/trading-bot/paper-trades.json`, `paper-records.json` |
| Process Manager | PM2 |
| Hosting | DigitalOcean VPS (Ubuntu), port 4000 |

---

## Project Structure

```
zeroscreen/
├── src/
│   ├── server.ts       # Express app, all routes, all page HTML (inline templates)
│   ├── db.ts           # SQLite schema, queries, migrations
│   ├── scraper.ts      # screener.in fundamentals scraper
│   ├── scheduler.ts    # Cron jobs: price refresh, fundamentals, email alerts
│   ├── nse.ts          # NSE price feed
│   └── mailer.ts       # nodemailer helpers (welcome, alert, reset, contact)
├── public/
│   ├── css/style.css   # All styles (design tokens, page themes, components, responsive)
│   └── js/app.js       # Page loader, dark mode, nav dropdown, search autocomplete
├── views/              # (reserved)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `stocks` | NSE fundamentals (ROCE, ROE, D/E, promoter %, etc.) |
| `prices` | Live NSE prices (updated every ~5 min by scheduler) |
| `users` | Auth: name, email, bcrypt password, role, mobile, mobile_verified |
| `watchlists` | Named watchlists per user |
| `watchlist_stocks` | Stocks in each watchlist |
| `alerts` | Saved screener filter combos for email alerts |
| `password_reset_tokens` | Password reset email tokens |
| `page_views` | Privacy-safe analytics (IP hashed) |
| `custom_strategies` | User-saved strategy builder results |
| `picks` | Admin-published stock picks |
| `app_settings` | Key-value config (telegram link, banner, free trade limit) |
| `subscriptions` | Razorpay payment records, plan status, expiry |
| `phone_otps` | Mobile OTP records (6-digit, 10-min TTL) |
| `paper_portfolio` | Per-user virtual cash balance (starts ₹1,00,000) |
| `paper_positions` | Open paper trade positions (symbol, qty, avg_price, trade_type) |
| `paper_trades` | Full trade history (buy/sell, P&L, trade_type) |
| `paper_trade_config` | Per-user paper trade defaults (trade type, SL%, target%, max positions) |

---

## Page Themes

| Page | Theme | Accent |
|------|-------|--------|
| Screener | Blue (default) | `#2563eb` |
| Signals | Emerald / Teal | `#059669` |
| Dashboard | Indigo / Purple | `#7c3aed` |
| Strategies | Amber / Orange | `#d97706` |
| Paper Trade (bot) | Pink / Rose | `#db2777` |
| My Paper Trade | Green (accent) | `#10b981` |

---

## Bot Integration

ZeroScreen reads files written by the trading bot — no API calls, no changes to bot code:

```
trading-bot   → /root/trading-bot/bot-heartbeat.json   (every 15s — alive/dead detection)
trading-bot   → /root/trading-bot/trades.json          (every completed trade)
trading-bot   → /root/trading-bot/trade-state.json     (current active position)
trading-bot   → /root/trading-bot/5year-backtest-result.json
paper-engine  → /home/ubuntu/trading-bot/paper-trades.json   (nightly 7:36 PM IST)
paper-engine  → /home/ubuntu/trading-bot/paper-records.json  (monthly summary)
```

### Bot Alive / Dead Detection

ZeroScreen determines bot status by reading `bot-heartbeat.json` and checking the `at` (timestamp) field:

```
isAlive = Date.now() - new Date(heartbeat.at).getTime() < 3 minutes
```

- **Bot running** → writes heartbeat every 15 s → `isAlive = true`
- **Bot stops / crashes** → stops writing → after 3 min ZeroScreen marks it offline
- **No action needed** — detection is fully automatic, no manual trigger

### Bot Status Dot (Signals Page)

| Dot | State | Condition |
|-----|-------|-----------|
| 🔴 Red (solid) | **Offline** | Heartbeat older than 3 min |
| 🟡 Amber (slow pulse) | **Waiting** | Alive, heartbeat status contains "WAIT" or "9:25" |
| 🔵 Blue (medium pulse) | **Scanning** | Alive, market hours, no active trade |
| 🟢 Green (fast pulse) | **Active trade** | Alive, `inTrade = true` in heartbeat |

The dot and label update automatically every 8 s (admin view) or 12 s (guest view) via `/api/bot/status`.

### Morning Startup Sequence (Daily)

Every trading morning, when you submit the new Zerodha access token via the token-server form, this is the exact sequence:

```
Overnight
─────────────────────────────────────────────────────────────
  trading-bot (PM2 id 13) — RUNNING 24/7
  Writes bot-heartbeat.json every 15 s → ZeroScreen dot = 🔵 Scanning / 🟡 Waiting

~8:30 AM — You submit Zerodha token via token-server
─────────────────────────────────────────────────────────────
  1. token-server writes new ACCESS_TOKEN to /home/ubuntu/trading-bot/.env
  2. PM2 sends SIGTERM to trading-bot process
  3. Bot catches SIGTERM → gracefulShutdown()
       → sends Telegram: "🔴 Bot Stopped — Reason: Process terminated (SIGTERM)"
       → process exits
  4. Heartbeat stops being written
  5. After 3 min: ZeroScreen dot turns 🔴 red (offline)

~8:30 AM + a few seconds — PM2 auto-restarts trading-bot
─────────────────────────────────────────────────────────────
  6. Bot loads fresh .env (new ACCESS_TOKEN)
  7. Syncs broker state (checks open positions via Kite API)
  8. setInterval(15 s) starts → immediately writes bot-heartbeat.json
  9. ZeroScreen dot turns back to 🔵 / 🟡 within one refresh cycle
 10. Sends Telegram: "🟢 BANKNIFTY Bot Started — Mode: LIVE ..."

Normal day flow
─────────────────────────────────────────────────────────────
 9:25 AM  → bot starts scanning for BANKNIFTY signal → dot = 🔵 Scanning
 Signal found → bot enters trade → dot = 🟢 Active trade (pulsing)
 Trade exits → bot returns to scanning → dot = 🔵 Scanning
 3:15-3:20 PM → EOD exit / max trades → bot stops for day
           → sends Telegram: "🔴 Bot Stopped — Reason: EOD exit"
           → heartbeat still written (process running) → dot stays 🔵
```

**Note:** The "Bot Stopped" Telegram you receive every morning is the PM2 restart caused by the token update — **not a crash**. The bot is back online within seconds. This is expected and correct behaviour.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth — enables "Sign in with Google" |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GOOGLE_CALLBACK_URL` | Google OAuth redirect (default: `http://139.59.18.52:4000/auth/google/callback`) |
| `SESSION_SECRET` | Express session signing key |
| `ADMIN_EMAIL` | Email that automatically gets admin role on signup |
| `SMTP_HOST` | SMTP server for email alerts and password reset |
| `SMTP_PORT` | SMTP port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address for emails |
| `TELEGRAM_BOT_TOKEN` | Telegram notifications on new signups |
| `TELEGRAM_CHAT_ID` | Telegram chat for notifications |
| `RAZORPAY_KEY_ID` | Razorpay payment gateway |
| `RAZORPAY_KEY_SECRET` | Razorpay secret for payment verification |
| `FAST2SMS_API_KEY` | Fast2SMS API for mobile OTP delivery |
| `INTERNAL_BOT_SECRET` | Shared secret for bot webhook endpoints (`/internal/bot-update`, `/internal/kite-token`) |

---

## Deployment

```powershell
# Local build check
npx tsc --noEmit

# Package and deploy to VPS
Remove-Item -ErrorAction SilentlyContinue zeroscreen-deploy.zip
Compress-Archive -Path src,public,package.json,package-lock.json,tsconfig.json -DestinationPath zeroscreen-deploy.zip
.\pscp.exe -pw "PASSWORD" zeroscreen-deploy.zip root@139.59.18.52:/root/zeroscreen-deploy.zip
.\plink.exe -pw "PASSWORD" -batch root@139.59.18.52 "cd /root/zeroscreen && unzip -o /root/zeroscreen-deploy.zip > /dev/null && npx tsc 2>&1 | tail -5 && pm2 restart 9 && echo DONE"
```

**PM2 processes (actual IDs on VPS):**
| ID | Name | Purpose |
|----|------|---------|
| 8  | zeroscreen | Main Express server (port 4000) — restart this one |
| 13 | trading-bot | BANKNIFTY options bot |
| 2  | equity-scanner | Equity scanner (waiting outside market hours) |
| 3  | equity-strategy | Equity strategy engine (waiting) |
| 6  | penny-scanner | Penny stock scanner (waiting) |
| 7  | core-scanner | Core watchlist scanner (waiting) |
| 1  | token-server | Trading bot token refresh |
| 5  | daily-reminder | Daily email digest |
| 0  | trading-bot | BANKNIFTY options bot |

---

## Recent Changes (May 2026)

### Phase 8 — Deployed restart #586–587
- **Stock Research Notes** — private per-user notes on every stock detail page. Auto-saves with 1.5s debounce (POST `/api/note/:symbol`). Max 2000 chars. "Unsaved… → ✓ Saved" status. Stored in new `stock_notes` table (SQLite UPSERT).
- **`/my-notes` page** — lists all your research notes across stocks in a card grid. Excerpt preview, time-ago, edit button, delete with confirmation.
- **Paper Trade Monthly P&L chart** — bar chart on `/my-paper-trade` showing P&L by month (green/red). Only renders when you have at least 1 closed trade.
- **Cumulative P&L curve** — `mptEqChart` canvas element added; equity curve now renders correctly on paper trade page.
- **Profile: Win Rate** — profile page now shows Win Rate row (e.g. `62.5% · 5W/3L`) in addition to balance and trade count. Powered by `getPaperTradeStats()` single SQL query.
- **zsMarkInviteDone()** — Copy Link and WhatsApp buttons on `/my-referrals` now fire the onboarding checklist "Invite a Friend" step.
- **"Research Notes" in nav** — added to Investor Tools section of nav dropdown for logged-in users.

### Phase 7 — Deployed restart #585
- **Price Alerts (`/my-alerts`)** — per-user price alerts (above/below target). Email fires when price crosses threshold. Scheduler checks every 30 min on weekdays.
- **PWA manifest** (`/manifest.json`) — Progressive Web App support, installable on mobile.
- **OG images** — `og-default.svg` (1200×630), `icon-192.svg`, `icon-512.svg` for social sharing and PWA.

### Phase 6 — Deployed restart #583–584
- **Premium Strategy Picks** — admin CRUD for curated NSE picks at `/admin/premium-picks`. Members see teaser, premium users see full details at `/premium-picks`.
- **Onboarding checklist** — 5-step widget (first screener search, first watchlist, first paper trade, invite a friend, set up alerts). Persisted in `localStorage`, step completions wired via JS callbacks.
- **Paper Trade print/export view** — `/my-paper-trade/print` generates a clean printable portfolio summary.
- **CSS variable fixes** — replaced all `--bg2` / `--bg3` references with correct design tokens.
- **`/subscribe` → `/premium`** — redirect updated.
- **Leaderboard** (`/leaderboard`) — top paper traders ranked by portfolio balance, return %, and win rate.

### Earlier Fixes
- **Nav responsive fix** — `flex-shrink:0` on nav-right; search bar narrowed; nav links collapse at breakpoints.
- **Signals compact trade rows** — single-line `.sig-trade-row` cards. SSR and auto-refresh JS updated.
- **Paper Trade index symbol autocomplete** — BANKNIFTY, NIFTY, FINNIFTY etc. appear in search with CE/PE toggle.
- **Paper Trade dropdown overlap** — `.pt2-trade-card` `overflow:visible` fix.
- **Mobile nav drawer** — full left-side drawer with overlay, close button, logo header.

---

## TODO — Next Session

### 🪙 Coins / Reward System (new feature — separate from paper trade balance)

Introduce a virtual "ZeroCoins" currency as a reward/gamification layer:

| Rule | Coins |
|------|-------|
| New member signs up | +10,000 ZeroCoins |
| Referred user joins through your referral link | +10,000 to referrer |
| User who joined via referral link | +5,000 extra bonus |
| Top paper trade performer of the month (cron job on 1st of month) | +10,000 to #1 leaderboard |

**Implementation plan:**
1. `db.ts` — add `coins INTEGER NOT NULL DEFAULT 0` column to `users` table (ALTER + migration)
2. `db.ts` — add `addCoins(userId, amount, reason)` function + `coins_log` table for audit trail
3. `db.ts` — add `getCoinsBalance(userId)` + `getCoinsLog(userId)` functions
4. `server.ts` — grant 10,000 coins on email signup (`/signup` POST) and Google OAuth callback
5. `server.ts` — grant referral coins: +10,000 to referrer + +5,000 to new user in `applyReferral()` flow
6. `server.ts` — show coins balance in profile page and greeting bar
7. `db.ts` / `scheduler.ts` — cron on 1st of each month: query leaderboard winner → award 10,000 coins
8. `server.ts` — `/my-coins` page showing balance + full coins log (earn history)
9. Admin: view/adjust coins per user in `/admin/users/:id`

---

### 🔧 Admin Dashboard Cleanup

Admin panel has duplicate options spread across multiple pages. Consolidate:

| Issue | Fix |
|-------|-----|
| "Permissions" and "Settings" overlap — same toggles appear in multiple admin pages | Merge into single `/admin/settings` page |
| User paper trade history link appears in both `/admin/users` table and `/admin/users/:id` | Keep only on user detail page |
| "Signal Control" and "Bot Analytics" accessible from both nav and overview page | Remove redundant links from overview |
| Multiple "Export CSV" buttons with inconsistent styling | Standardise to one `btn-export` class |
| Admin nav dropdown has 11 items — too many | Group into sections: Users, Content, Bot, System |

---

### 📡 Telegram Price Alert Delivery

When a price alert fires, also send a Telegram message to the user if they've linked their Telegram account.

**Files:** `src/scheduler.ts` (`checkPriceAlerts`), `src/db.ts` (`getAllActivePriceAlerts` — add `telegram_chat_id` to join), `src/mailer.ts` (add `sendTelegramToUser` helper)

```ts
// In checkPriceAlerts():
if (a.telegram_chat_id) {
  await sendTelegramToUser(a.telegram_chat_id, `🎯 Alert: ${a.symbol} hit ₹${a.target_price} (${a.direction})`);
}
```

---

### 📈 Smart "Near 52W High Breakout" Alert Preset

On `/my-alerts` form, add a "⚡ Breakout" quick-fill button next to the target price field. When clicked, fetches `week52_high` for the entered symbol and auto-fills the price field with that value + sets direction to "above".

**Files:** `src/server.ts` (add JS to `/my-alerts` page — AJAX call to `/api/stock/:symbol/52w`), `src/server.ts` (add `/api/stock/:symbol/52w` endpoint returning `{ week52_high, week52_low }`)

---

### 🔁 "Check Alerts Now" Button on `/my-alerts`

Add a "Check Now" button that fires a manual alert check for the current user's active alerts. Useful for testing and gives users confidence alerts are working.

**Files:** `src/server.ts` (add `POST /my-alerts/check` route — runs `checkPriceAlerts()` filtered to user's alerts → returns triggered count as JSON), `/my-alerts` page (AJAX button with spinner)

---

### 📧 Weekly Paper Trade Digest Email

Every Sunday morning (9 AM IST), send members a summary of their paper trading week:
- Week's realized P&L
- Trades this week (wins / losses)
- Current balance vs starting ₹1,00,000
- Best trade of the week

**Files:** `src/scheduler.ts` (new cron `0 3 * * 0`), `src/mailer.ts` (new `sendWeeklyPaperSummary()`), `src/db.ts` (new `getWeeklyPaperStats(userId)`)

---

## License

Private / self-hosted use. Data sourced from screener.in and NSE India — not for redistribution. Trading strategy logic is proprietary.

- **5-Year Backtest KPI cards** — Combined PnL (pts) · Model A PnL · Model B PnL · Model A Win Rate · Model B Win Rate · Total Trading Days
- **Monthly combined PnL chart** — green/red bar chart across all 60 months (Jan 2021 – Dec 2026)
- **Model A vs Model B chart** — grouped bar chart comparing both signal models side-by-side per month
- **Monthly breakdown table** — all months newest-first: Month · Model A PnL · Model B PnL · Combined · Trades · Wins · Losses

---

### 5. Strategies — `http://139.59.18.52:4000/strategies`

**Theme: Amber/Orange — Public, no login**

Showcases the bot's proprietary strategy without revealing any logic or names.

- **Strategy hero** — "Proprietary Intraday Strategy" badge · headline · 4 live backtest stats (5-Year PnL, months backtested, % profitable months, trading days)
- **4 benefit cards** with real numbers:
  - Consistent Edge — win rates from backtest
  - Fully Automated — 9:15 AM to 3:30 PM, zero manual intervention
  - Built-in Risk Control — per-trade stop loss details
  - Dual Signal Confirmation — two independent models must agree
- **Screener Presets grid** — all 14 strategy cards with description + one-click link to filtered screener

---

### 6. Paper Trade — `http://139.59.18.52:4000/paper-trade`

**Theme: Pink/Rose — Public, no login**

Simulated portfolio tracking across 3 concurrent strategies.

- **KPI summary bar** — Total PnL · Closed Trades · Win Rate · Wins · Losses · Avg PnL/Trade · Open Positions
- **By-strategy cards** — BANKNIFTY Options · Equity Swing · Penny Stocks (each with individual PnL and trade count)
- **Equity curve** — Chart.js line chart built from all closed trades sorted by exit date
- **Monthly summary table** — Period · Trades · Win Rate · Best Trade · Worst Trade · Monthly PnL
- **Full trade history** (last 50) — Symbol · Direction badge (LONG/SHORT) · Entry · Exit · Qty · Status badge (TARGET HIT / SL HIT / OPEN / EOD EXIT / EXPIRED) · Hold Days · PnL · PnL%
- Data written nightly at 7:36 PM IST by paper-trade-engine; shows empty state until first run

---

### 7. Strategy Builder — `http://139.59.18.52:4000/strategy-builder`

**In the "More" dropdown — Public, no login**

Type a strategy in plain English → instantly get screener filters.

- **Text input** — free-form description area
- **8 example chips** — click to auto-fill and parse: "Debt-free large cap with high ROCE", "Pharma stocks with promoter above 60%", etc.
- **Parse engine** (client-side, instant):
  - Detects ROCE / ROE / D/E / P/E / promoter % thresholds
  - Detects company size: large cap / mid cap / small cap / micro cap
  - Detects 14 sectors: banking, IT, pharma, auto, FMCG, infrastructure, metals, energy, realty, chemicals, telecom, cement, NBFC, insurance
  - Detects: debt-free, profitable, growing profits, undervalued, dividend-paying, top gainers, 52-week high/low proximity
- **Filter tags** — colored badges showing every parsed filter
- **"Apply to Screener →"** — direct link to screener pre-filled with all detected filters
- **Tips section** — guides users on phrasing

---

### 8. Compare — `http://139.59.18.52:4000/compare`

**In the "More" dropdown — Public, no login**

- Type 2–5 NSE symbols with autocomplete suggestions
- Side-by-side table: Price · Change % · ROCE · ROE · D/E · Promoter % · P/E · EPS · Book Value · Dividend Yield · Current Ratio · Market Cap · Sector
- **Refresh All Data** — re-fetches fundamentals for all compared stocks

---

### 9. Watchlists — `http://139.59.18.52:4000/watchlists`

**Login required** — saves across sessions.

- Create named watchlists with descriptions
- View all stocks in a watchlist with live prices
- Add stocks from screener or stock detail page
- Delete watchlist

---

### 10. Alerts — `http://139.59.18.52:4000/alerts`

**Login required**

- Save screener filter combos as named alerts
- Receive weekday morning email digest when stocks match your saved filters

---

### 11. Sign In — `http://139.59.18.52:4000/login`

- **Continue with Google** button (when Google OAuth is configured via env vars)
- Email + password form
- Forgot password link → email reset flow
- **"Continue as guest →"** link — goes straight to screener without any account

---

### 12. Sign Up — `http://139.59.18.52:4000/signup`

- **Sign up with Google** button
- Name + email + password form
- **"Continue as guest →"** link

---

### 13. Admin — `http://139.59.18.52:4000/admin/users`

**Admin role required**

- User management table — name, email, role, registration date, Make Admin action
- KPI cards: Total Users · Admins · Joined Today · Regular Users
- **📈 Analytics** button → `/admin/analytics`
- **📊 Data Control** button → `/admin/data`

### 14. Analytics — `http://139.59.18.52:4000/admin/analytics`

**Admin only** — privacy-safe visitor tracking (IP hashed, no PII stored).

- Today's views · Today's unique visitors · All-time views · Pages tracked
- Top 15 pages (last 30 days) with view counts
- Daily breakdown — last 14 days with views and unique visitors
- Recent 30 visits — time, path, visitor hash, user agent

---

## Navigation Structure

```
ZeroScreen
├── 🔍 Screener         /                  (primary · public)
├── 📡 Signals          /signals           (primary · public)
├── 📊 Dashboard        /dashboard         (primary · public)
├── ⚙️ Strategies       /strategies        (primary · public)
├── 📋 Paper Trade      /paper-trade       (primary · public)
└── ▾ More
    ├── 🔨 Strategy Builder  /strategy-builder  (public)
    ├── ⭐ Watchlists         /watchlists        (login required)
    ├── 🔔 Alerts             /alerts            (login required)
    ├── ⚖️ Compare            /compare           (public)
    └── 📬 Contact            /contact           (public)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js v22 |
| Language | TypeScript 5.9 |
| Web Framework | Express 4.18 |
| Database | SQLite3 5.1.7 |
| Session Store | SQLite (connect-sqlite3) |
| Auth | express-session + bcrypt + Google OAuth2 (optional) |
| Scheduling | node-cron |
| Email | nodemailer |
| Charting | Chart.js 4.4.2 (CDN) |
| Price Charts | TradingView Embed Widget (iframe) |
| Frontend | Vanilla JS + CSS (no framework) |
| CSS Variables | Custom design system (light · dark · per-page themes) |
| Analytics | SQLite `page_views` table (IP hashed, server-side) |
| Data Source | screener.in (scraped), NSE India (prices) |
| Bot Data | `/root/trading-bot/trades.json`, `trade-state.json` |
| Paper Data | `/home/ubuntu/trading-bot/paper-trades.json`, `paper-records.json` |
| Process Manager | PM2 |
| Hosting | DigitalOcean VPS (Ubuntu), port 4000 |

---

## Project Structure

```
zeroscreen/
├── src/
│   ├── server.ts       # Express app, all routes, all page HTML (inline templates)
│   ├── db.ts           # SQLite schema, queries, migrations (stocks, prices, users,
│   │                   #   watchlists, alerts, sessions, page_views, custom_strategies)
│   ├── scraper.ts      # screener.in fundamentals scraper
│   ├── scheduler.ts    # Cron jobs: price refresh, fundamentals, email alerts
│   └── nse.ts          # NSE price feed
├── public/
│   ├── css/style.css   # All styles (design tokens, page themes, components, responsive)
│   └── js/app.js       # Page loader, dark mode, nav dropdown, "More" menu, search autocomplete
├── views/              # (reserved)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Page Themes

Each major page has its own accent colour that tints the nav and interactive elements:

| Page | Theme | Accent |
|------|-------|--------|
| Screener | Blue (default) | `#2563eb` |
| Signals | Emerald / Teal | `#059669` |
| Dashboard | Indigo / Purple | `#7c3aed` |
| Strategies | Amber / Orange | `#d97706` |
| Paper Trade | Pink / Rose | `#db2777` |

---

## Bot Integration

ZeroScreen reads files written by the trading bot — no API calls, no changes to bot code:

```
trading-bot   → /root/trading-bot/trades.json          (every completed trade)
trading-bot   → /root/trading-bot/trade-state.json     (current active position)
trading-bot   → /root/trading-bot/5year-backtest-result.json
paper-engine  → /home/ubuntu/trading-bot/paper-trades.json   (nightly 7:36 PM IST)
paper-engine  → /home/ubuntu/trading-bot/paper-records.json  (monthly summary)
```

---

## Environment Variables (optional)

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth — enables "Sign in with Google" |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GOOGLE_CALLBACK_URL` | Google OAuth redirect (default: `http://139.59.18.52:4000/auth/google/callback`) |
| `SESSION_SECRET` | Express session signing key |
| `ADMIN_EMAIL` | Email that automatically gets admin role on signup |
| `SMTP_*` | Nodemailer config for email alerts and password reset |
| `TELEGRAM_BOT_TOKEN` | Telegram notifications on new signups |
| `TELEGRAM_CHAT_ID` | Telegram chat for notifications |
| `RAZORPAY_KEY_ID` | Razorpay payment gateway |
| `RAZORPAY_KEY_SECRET` | Razorpay secret for payment verification |
| `FAST2SMS_API_KEY` | Fast2SMS API for mobile OTP delivery |
| `INTERNAL_BOT_SECRET` | Shared secret for bot webhook endpoints (`/internal/bot-update`, `/internal/kite-token`) |

---

## Deployment

```bash
# Local build check
npx tsc --noEmit

# Package and deploy to VPS
Remove-Item -ErrorAction SilentlyContinue zeroscreen-deploy.zip
Compress-Archive -Path src,public,package.json,package-lock.json,tsconfig.json -DestinationPath zeroscreen-deploy.zip
# Upload + unzip + compile + restart
.\pscp.exe -pw "..." zeroscreen-deploy.zip root@139.59.18.52:/root/zeroscreen-deploy.zip
.\plink.exe -pw "..." -batch root@139.59.18.52 "unzip -o /root/zeroscreen-deploy.zip -d /root/zeroscreen/ ; cd /root/zeroscreen && npx tsc ; pm2 restart zeroscreen --update-env"
```

**PM2 processes (actual IDs on VPS):**
| ID | Name | Purpose |
|----|------|---------|
| 8  | zeroscreen | Main Express server (port 4000) — restart this one |
| 13 | trading-bot | BANKNIFTY options bot |
| 2  | equity-scanner | Equity scanner (waiting outside market hours) |
| 3  | equity-strategy | Equity strategy engine (waiting) |
| 6  | penny-scanner | Penny stock scanner (waiting) |
| 7  | core-scanner | Core watchlist scanner (waiting) |

---

## License

Private / self-hosted use. Data sourced from screener.in and NSE India — not for redistribution. Trading strategy logic is proprietary.

---

## Features

### 📡 Signals (`/signals`) — Public, no login required
- **Live position card** — shows current active BANKNIFTY position from `trade-state.json` (direction badge CE/PE, entry price, stop loss, qty, AI score)
- **Flat state** — shows "💤 No Active Position" when bot is idle
- **Today's stats bar** — PnL, trades, wins, losses, max drawdown, all-time win rate
- **Recent trades** — last 20 trades as cards with direction, PnL (green/red), type, entry/exit price, duration, exit reason, timestamp
- **Auto-refresh every 8 seconds** via `GET /api/bot/status`
- Graceful empty state when `trades.json` is empty or missing
- Live animated pulse dot in nav

### 📊 Dashboard (`/dashboard`) — Public
- **Live bot KPIs** — all-time PnL, total trades, win rate, wins/losses, max drawdown, today's PnL
- **Live equity curve** — Chart.js line chart from real `trades.json` (hidden with message when no trades yet)
- **5-year backtest KPIs** — total PnL, Model A PnL, Model B PnL, Model A/B win rates, trading days
- **Monthly combined PnL chart** — green/red bar chart for all 60 months (2021–2026)
- **Model A vs Model B chart** — grouped bar chart comparing both signal models
- **Monthly breakdown table** — all months newest-first with per-model PnL, trades, win/loss counts, combined PnL

### ⚙️ Strategies (`/strategies`) — Public
- **Strategy hero** — "Proprietary Intraday Strategy" (no internal names exposed)
- **4 benefit cards** — Consistent Edge, Fully Automated, Built-in Risk Control, Dual Signal Confirmation — each with real backtest numbers
- **Screener Presets grid** — all 14 screener strategy cards linking to pre-filtered screener results

### 📋 Paper Trade (`/paper-trade`) — Public
- **Summary KPIs** — total PnL, closed trades, win rate, wins/losses, avg PnL/trade, open positions
- **By-strategy cards** — BANKNIFTY / Equity Swing / Penny with individual PnL and trade counts
- **Equity curve** — Chart.js line chart built from closed trades sorted by exit date
- **Monthly summary table** — period, trades, win rate, best/worst trade, PnL
- **Full trade history table** — last 50 trades: symbol, direction badge (LONG/SHORT), entry/exit price, qty, color-coded status (TARGET HIT / SL HIT / OPEN / EOD EXIT / EXPIRED), hold days, PnL, PnL%
- Reads from `paper-trades.json` and `paper-records.json` written nightly by paper-trade-engine (7:36 PM IST)

### 🔍 Screener (`/`)
- Screen 1,700+ NSE stocks with real-time filters
- Filters: ROCE, ROE, D/E Ratio, Promoter %, P/E, Price range, Market Cap, Volume, Sector, Change %, 52-Week High/Low proximity
- 14 strategy presets: Quality Blue Chips, Debt-Free, Growth, Value, High ROCE, Dividend, Promoter, Small Cap, Penny, High Value, Long Term, Short Term, Swing, Options
- Sort by any column; pagination with configurable rows per page
- Column checkboxes to show/hide metrics
- Select multiple stocks → side-by-side comparison

### Stock Detail Page (`/stock/:symbol`)
- Live TradingView price chart (iframe embed, 550px tall, dark/light theme aware)
- Hero header: symbol, company name, price, change %, OHLC, 52-week range slider
- 8 KPI cards: Market Cap, ROCE, ROE, D/E, P/E, EPS, Book Value, Dividend Yield
- Financial charts (Chart.js): Net Profit, Revenue, ROCE vs ROE, Promoter Holding, Valuation, Profit Margin
- Detailed metrics table, company About section, live news feed (grouped by date)
- Refresh Data button, Add to Watchlist, links to screener.in and NSE India

### Compare (`/compare`)
- Type 2–5 NSE symbols with **autocomplete** (symbol + company name suggestions)
- Side-by-side fundamentals table
- **Refresh All Data** button

### Watchlists, Alerts, Auth
- Named watchlists with descriptions
- Email alerts for saved screener filters (weekday morning digest)
- Session-based login / register / change password with bcrypt

### UI / UX
- **Page-specific themes** — each major page has its own color scheme:
  - Screener: Blue (default)
  - Signals: Emerald/Teal
  - Dashboard: Indigo/Purple
  - Strategies: Amber/Orange
  - Paper Trade: Pink/Rose
- **"More" dropdown** in nav for secondary links (Watchlists, Alerts, Compare, Contact)
- Dark mode toggle (localStorage persistent)
- 4-second branded page loader (sessionStorage-based, persists across navigations)
- Responsive layout (mobile/tablet/desktop)
- Nav search bar with autocomplete

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js v22 |
| Language | TypeScript 5.9 |
| Web Framework | Express 4.18 |
| Database | SQLite3 5.1.7 |
| Session Store | SQLite (connect-sqlite3) |
| Auth | express-session + bcrypt |
| Scheduling | node-cron |
| Email | nodemailer |
| Charting | Chart.js 4.4.2 (CDN) |
| Price Charts | TradingView Embed Widget (iframe) |
| Frontend | Vanilla JS + CSS (no framework) |
| CSS Variables | Custom design system (light + dark + per-page themes) |
| Data Source | screener.in (scraped), NSE India (prices) |
| Bot Data | `/root/trading-bot/trades.json`, `trade-state.json` |
| Paper Data | `/home/ubuntu/trading-bot/paper-trades.json`, `paper-records.json` |
| Process Manager | PM2 |
| Hosting | DigitalOcean VPS (Ubuntu) |

---

## Project Structure

```
zeroscreen/
├── src/
│   ├── server.ts       # Express app, all routes, all pages (inline HTML)
│   ├── db.ts           # SQLite schema, queries, migrations
│   ├── scraper.ts      # screener.in fundamentals scraper
│   ├── scheduler.ts    # Cron jobs: price refresh, fundamentals, email alerts
│   └── nse.ts          # NSE price feed
├── public/
│   ├── css/style.css   # All styles (design tokens, components, page themes, responsive)
│   └── js/app.js       # Loader, dark mode, nav dropdown, search autocomplete
├── views/              # (reserved)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Bot Integration

ZeroScreen reads live data from the BANKNIFTY trading bot running on the same VPS:

```
trading-bot → writes every trade → /root/trading-bot/trades.json
trading-bot → writes active state → /root/trading-bot/trade-state.json
paper-engine → writes nightly → /home/ubuntu/trading-bot/paper-trades.json
paper-engine → writes summaries → /home/ubuntu/trading-bot/paper-records.json
backtest data → /root/trading-bot/5year-backtest-result.json
```

ZeroScreen reads these files via `fs.readFileSync` — no API calls between processes, no changes to bot code.

---

## Deployment

```bash
# Local dev
npm run dev

# Build
npx tsc

# VPS (pm2)
pm2 restart zeroscreen
```

**VPS:** DigitalOcean Ubuntu, port 4000, managed with PM2 (id 8 = zeroscreen server, id 13 = trading-bot)

## Scheduled Jobs (Cron)

| Time (IST) | Days | Job | Notes |
|---|---|---|---|
| **6:30 PM** | Mon–Fri | Price refresh | Fetches NSE bhavcopy → updates all prices |
| **6:45 PM** | Mon–Fri | Auto picks generation | Generates intraday/swing/longterm picks |
| **9:15 AM** | Mon–Fri | Auto paper trade buy | Buys today's picks at live open price for opted-in Premium users |
| **Every 5 min** (9:15–4 PM) | Mon–Fri | SL/Target monitor | Auto-sells paper positions on SL or target hit |
| **7:30 AM** | Mon–Fri | Alert digest | Emails users when saved alert filters match |
| **2:00 AM** | Saturday | Fundamentals refresh | Scrapes screener.in for stale stocks |

---

## Environment

No `.env` required for basic usage. Email alerts require SMTP config via environment variables.

---

## License

Private / self-hosted use. Data sourced from screener.in and NSE India — not for redistribution. Trading strategy logic is proprietary.
