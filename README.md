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

### 4. Dashboard — `http://139.59.18.52:4000/dashboard`

**Theme: Indigo/Purple — Public, no login**

Bot performance analytics with real trade data and 5-year backtest.

- **Live KPI bar** — All-Time PnL · Total Trades · Win Rate · Wins · Losses · Max Drawdown · Today's PnL
- **Live equity curve** — Chart.js area chart built from every real trade in `trades.json` (shows "no trades yet" when empty)
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

**Login required**

Configure default parameters for new paper trades:

- **Default Trade Type** — Intraday (square off same day) or Holding (positional / multi-day)
- **Default Quantity** — pre-fills qty field on buy form
- **Default Stop Loss %** — reference for risk management (stored, not auto-enforced)
- **Default Target %** — reference for profit target
- **Max Open Positions** — user-defined limit (stored as preference)

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
├── 📡 Signals               /signals              (primary · public)
├── 📊 Dashboard             /dashboard            (primary · public)
├── ⚙️  Strategies            /strategies           (primary · public)
├── 📋 Paper Trade (Bot)     /paper-trade          (primary · public)
└── ▾ More / Explore
    ├── 🔨 Strategy Builder   /strategy-builder     (public)
    ├── ⭐ Watchlists          /watchlists           (login required)
    ├── 🔔 Alerts              /alerts               (login required)
    ├── ⚖️  Compare             /compare              (public)
    ├── 📬 Contact             /contact              (public)
    └── 📋 My Paper Trade      /my-paper-trade       (login + mobile verified)
```

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
trading-bot   → /root/trading-bot/trades.json          (every completed trade)
trading-bot   → /root/trading-bot/trade-state.json     (current active position)
trading-bot   → /root/trading-bot/5year-backtest-result.json
paper-engine  → /home/ubuntu/trading-bot/paper-trades.json   (nightly 7:36 PM IST)
paper-engine  → /home/ubuntu/trading-bot/paper-records.json  (monthly summary)
```

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

**PM2 processes:**
| ID | Name | Purpose |
|----|------|---------|
| 9  | zeroscreen | Main Express server (port 4000) — restart this one |
| 10 | zeroscreen | ts-node scheduler (price + fundamentals cron jobs) |
| 4  | paper-trade-engine | Bot paper trade simulation (nightly) |
| 1  | token-server | Trading bot token refresh |
| 5  | daily-reminder | Daily email digest |
| 0  | trading-bot | BANKNIFTY options bot |

---

## Recent Changes (May 2026)

- **Nav responsive fix** — `flex-shrink:0` on nav-right; search bar narrowed to 160px; nav links collapse at ≤1160px and ≤980px breakpoints so profile avatar is always visible
- **Signals — compact trade rows** — Recent trades now render as single-line `.sig-trade-row` cards (direction badge · date · entry→exit prices · PnL · duration · exit reason). Both SSR and auto-refresh JS updated.
- **Paper Trade — index symbol autocomplete** — Typing `BANKNIFTY`, `NIFTY`, `FINNIFTY`, `MIDCPNIFTY`, `SENSEX`, or `BANKEX` in the symbol search now shows those as "Index Options (CE/PE)" at the top of the dropdown
- **Paper Trade — options panel** — Selecting an index auto-switches to Limit order and shows the CE/PE toggle + strike picker with a ✕ close button. Clearing the search input also hides the panel.
- **Paper Trade — dropdown overlap fixed** — `.pt2-trade-card` changed from `overflow:hidden` to `overflow:visible` so search results render above other form elements
- **Picks cards** — Reduced font sizes and padding; grid now uses `minmax(180px, 1fr)` showing more cards per row
- **Nav — double Admin panel** — Removed "🛡️ Admin Panel" link from profile dropdown (it already exists as a dedicated nav dropdown for admins)

---

## License

Private / self-hosted use. Data sourced from screener.in and NSE India — not for redistribution. Trading strategy logic is proprietary.

- **Hero bar** — symbol, company name, live price, change %, day high/low, prev close, 52-week range slider
- **TradingView chart** — full interactive price chart (550px, syncs dark/light mode)
- **8 KPI cards** — Market Cap, ROCE, ROE, D/E Ratio, P/E Ratio, EPS, Book Value, Dividend Yield
- **6 financial charts** — Net Profit (bar), Revenue (line), ROCE vs ROE (grouped bar), Promoter Holding (doughnut), Valuation (P/E · P/B · Current Ratio · Div Yield), Profit Margin %
- **Metrics table** — all fundamentals in one scrollable table
- **About** — company description, sector, year established
- **Live news** — Google News headlines for the stock grouped by Today / Yesterday / Last 7 Days / Older
- **Action buttons** — Refresh Data · Add to Watchlist · screener.in · NSE India links

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

### 4. Dashboard — `http://139.59.18.52:4000/dashboard`

**Theme: Indigo/Purple — Public, no login**

Bot performance analytics with real trade data and 5-year backtest.

- **Live KPI bar** — All-Time PnL · Total Trades · Win Rate · Wins · Losses · Max Drawdown · Today's PnL
- **Live equity curve** — Chart.js area chart built from every real trade in `trades.json` (shows "no trades yet" when empty)
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

**PM2 processes:** zeroscreen (ids 9 + 10) · trading-bot (0) · paper-trade-engine (4) · token-server (1) · daily-reminder (5)

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

**VPS:** DigitalOcean Ubuntu, port 4000, managed with PM2 (two instances: id 9 = main server, id 10 = scheduler)

---

## Environment

No `.env` required for basic usage. Email alerts require SMTP config via environment variables.

---

## License

Private / self-hosted use. Data sourced from screener.in and NSE India — not for redistribution. Trading strategy logic is proprietary.
