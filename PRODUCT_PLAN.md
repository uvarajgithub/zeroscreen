# ZeroScreen — Complete Product Plan
> Last updated: May 2026

---

## 🎯 Product Vision

**"AI-Powered Trading Assistant for Indian Retail Investors"**

Not just a screener — a platform that guides users from research → decision → execution.

```
Research (free/guest)  →  Decisions (member)  →  Execution insights (premium)
```

---

## 👤 User Tiers

### Guest (no login)
- Can browse everything: Screener, Picks, Charts, News, Strategies, Strategy Builder
- Cannot act: no watchlist, no paper trade, no alerts, no saved filters
- Purpose: SEO traffic + first impression
- Nudge: soft-gate modal ("Sign up free") — no hard redirects

### Member (free login)
- Everything guest can do
- Watchlist (save stocks)
- Basic email alerts (price alerts)
- Paper Trade (manual): starts with ₹1,00,000 virtual balance
- Independent paper trade dashboard
- Download / share paper trade report (CSV)
- Daily Picks email notification (opt-in on signup)
- Can see Signals: last trades, performance summary
- Cannot see: live entry price, SL, real-time bot updates

### Premium (paid)
- Everything member can do
- Real-time Signals: entry, SL, exit, live updates
- Auto-bot Paper Trading (signals auto-executed in paper trade)
- ₹10,00,000 virtual balance (10x member)
- Telegram alerts for signals
- Advanced Analytics: equity curve, drawdown, monthly P&L
- Full trade history (filterable + downloadable)
- Smart alerts: breakout, strategy, price
- Early access to signals (before free users)
- Premium Strategy Picks (curated high-probability setups)

### Admin (internal only)
- Full access to everything
- Trading bot controls (start/stop/configure)
- Live bot execution — not public facing
- Auto picks order execution — internal only
- User management (role, delete, ban)
- View user-wise paper trade history
- Manage Today's Picks (publish/edit/delete)
- App settings toggles (feature flags)
- Analytics dashboard (page views, user growth)
- Notifications panel (send announcements)
- Subscription management
- Content management

---

## 🗺️ Pages & Routes (Current State)

| Route | Who | Status |
|---|---|---|
| `/` | All | ✅ Screener |
| `/stock/:symbol` | All | ✅ Stock detail |
| `/today` | All | ✅ Today's Picks |
| `/signals` | All (limited for guest/member) | ✅ Live Bot |
| `/strategies` | All | ✅ Strategy list |
| `/strategy-builder` | All | ✅ Builder |
| `/compare` | All | ✅ Compare stocks |
| `/dashboard` | Member+ | ✅ Bot analytics |
| `/paper-trade` | Member+ | ✅ Bot paper trade view |
| `/my-paper-trade` | Member+ | ✅ Manual paper trade |
| `/watchlists` | Member+ | ✅ Watchlists |
| `/alerts` | Member+ | ✅ Alerts |
| `/profile` | Member+ | ✅ Profile |
| `/premium` | All | ✅ Premium page |
| `/login` | Guest | ✅ Redesigned |
| `/signup` | Guest | ✅ Exists |
| `/about` | All | ✅ About |
| `/contact` | All | ✅ Contact |
| `/admin/*` | Admin | ✅ Full admin panel |
| `/learn` | All | ❌ Missing |
| `/learn/:topic` | All | ❌ Missing |

---

## 📦 Phase Plan

---

### ✅ Phase 0 — Foundation (Done)
- [x] Screener with NSE data
- [x] Today's Picks (admin publishes)
- [x] Live Bot / Signals page
- [x] Paper Trade (manual + bot view)
- [x] Auth: email + Google OAuth
- [x] Admin panel (users, picks, settings, analytics)
- [x] Watchlists, Alerts
- [x] Razorpay premium scaffolding
- [x] Site-wide footer (stats, social, disclaimer)
- [x] Unified navbar across all pages
- [x] Animated login page redesign
- [x] Mobile drawer nav

---

### 🔄 Phase 1 — "Make the Member Tier Real" (Current)

**Goal:** New user signs up → gets virtual wallet → can paper trade immediately → gets daily pick emails.

| # | Task | File(s) | Status |
|---|---|---|---|
| 1 | DB: add `notify_picks` column to `users` | `src/db.ts` | [ ] |
| 2 | DB: auto-create `paper_portfolio` with ₹1L on signup | `src/db.ts` | [ ] |
| 3 | Signup: grant ₹1L virtual coins on register | `src/server.ts` | [ ] |
| 4 | Signup: add notify_picks checkbox | `src/server.ts` | [ ] |
| 5 | Guest soft-gate modal (no hard redirect) | `public/js/app.js`, `public/css/style.css` | [ ] |
| 6 | Picks email trigger when admin publishes | `src/server.ts`, `src/mailer.ts` | [ ] |
| 7 | Paper trade CSV export route + download button | `src/server.ts` | [ ] |
| 8 | Admin: view user-wise paper trade history | `src/server.ts` | [ ] |
| 9 | Compile, deploy, verify | — | [ ] |

---

### 📋 Phase 2 — "Signals Gating + Member Dashboard"

**Goal:** Member sees teaser signals (past trades, win rate). Premium sees live. Dashboard is personalized.

| # | Task |
|---|---|
| 1 | Signals page: show past trades + summary to all members |
| 2 | Signals page: blur/hide live entry, SL, real-time for non-premium |
| 3 | "Upgrade to see live signals" upsell card on signals page |
| 4 | Member homepage: personalized greeting + quick stats card |
| 5 | Notification preferences page in profile |
| 6 | Profile page: show virtual balance, total trades, win rate |

---

### 📋 Phase 3 — "Education + Onboarding"

**Goal:** Retain beginners. Rank on Google. Reduce churn.

| # | Task |
|---|---|
| 1 | `/learn` landing page (topic cards grid) |
| 2 | `/learn/basics` — What is the stock market |
| 3 | `/learn/intraday` — Intraday trading guide |
| 4 | `/learn/candles` — Candlestick patterns (with images) |
| 5 | `/learn/screener-guide` — How to use the screener |
| 6 | `/learn/paper-trade-guide` — How to paper trade |
| 7 | `/learn/signals-guide` — How to read signals |
| 8 | Feature tour: first-time user tooltip walkthrough |
| 9 | Onboarding checklist widget (sidebar/dashboard) |

---

### 📋 Phase 4 — "Premium Features + Telegram"

**Goal:** Make premium worth paying for.

| # | Task |
|---|---|
| 1 | Telegram bot integration (send signal alerts) |
| 2 | Auto-bot paper trading for premium users |
| 3 | Premium virtual balance: ₹10L vs ₹1L for free |
| 4 | Admin can manually set user virtual balance |
| 5 | Advanced analytics: equity curve chart, drawdown |
| 6 | Smart alerts: breakout alert, strategy alert |
| 7 | Premium strategy picks section (curated by admin) |
| 8 | Early access flag: premium gets signals 30s before members |
| 9 | Full trade history: filterable table + PDF export |

---

### 📋 Phase 5 — "Growth + SEO"

**Goal:** Get organic traffic. Viral sharing.

| # | Task |
|---|---|
| 1 | Shareable paper trade report page (`/share/:reportId`) |
| 2 | SEO meta tags on all pages (OG, Twitter Card) |
| 3 | Sitemap (`/sitemap.xml`) |
| 4 | Stock pages SEO: `<title>RELIANCE NSE Price, Charts, Analysis` |
| 5 | Blog/insights section (`/blog`) — admin publishes articles |
| 6 | Referral system: member invites friend → bonus coins |
| 7 | "Top Gainers Today" public widget (embeddable) |
| 8 | Social share buttons on Today's Picks |

---

### 📋 Phase 6 — "Retention + Completion"

**Goal:** Turn signups into active users. Make premium feel premium.

| # | Task | Status |
|---|---|---|
| 1 | Onboarding checklist widget (new user guide, localStorage steps) | [ ] |
| 2 | Premium Strategy Picks section — admin-curated NSE setups | [ ] |
| 3 | Admin: Premium Picks CRUD (create/publish/edit/delete) | [ ] |
| 4 | Member view: `/premium-picks` (free sees teaser, premium sees full) | [ ] |
| 5 | Paper trade print/export view (`/my-paper-trade/print`) | [ ] |
| 6 | Compile, deploy, verify | [ ] |

---

## 🏗️ Architecture Notes

- **Stack**: Node.js v22 + TypeScript 5.4 + Express 4.18 + SQLite3
- **Views**: Inline HTML template literals in `src/server.ts`
- **Static**: `public/css/style.css`, `public/js/app.js`
- **Auth**: Session-based (express-session) + Google OAuth
- **Email**: Nodemailer via `src/mailer.ts`
- **DB**: SQLite via `src/db.ts`
- **Bot**: Separate process at `C:\Users\LENOVO\trading-bot`
- **VPS**: DigitalOcean Ubuntu `139.59.18.52:4000` · PM2 id 8

## 🚀 Deploy Commands

### Full deploy (TypeScript changed):
```powershell
npx tsc src/server.ts --skipLibCheck --outDir dist --target ES2020 --module commonjs --esModuleInterop 2>&1 | Select-Object -First 5; Write-Host "EXIT:$LASTEXITCODE"
.\pscp.exe -pw "Uvi@janya123Jas" src\server.ts root@139.59.18.52:/root/zeroscreen/src/server.ts
.\pscp.exe -pw "Uvi@janya123Jas" dist\server.js root@139.59.18.52:/root/zeroscreen/dist/server.js
.\plink.exe -batch -pw "Uvi@janya123Jas" root@139.59.18.52 "pm2 restart zeroscreen --update-env && echo DONE"
```

### Static-only deploy (CSS/JS changed):
```powershell
.\pscp.exe -pw "Uvi@janya123Jas" public\css\style.css root@139.59.18.52:/root/zeroscreen/public/css/style.css
.\pscp.exe -pw "Uvi@janya123Jas" public\js\app.js root@139.59.18.52:/root/zeroscreen/public/js/app.js
.\plink.exe -batch -pw "Uvi@janya123Jas" root@139.59.18.52 "pm2 restart zeroscreen --update-env && echo DONE"
```

---

## 💡 Key Principles

1. **Don't over-restrict guests** — they are SEO traffic. Let them see everything, just can't act.
2. **Soft-gate, not hard redirect** — show a modal, not a 401 page.
3. **Member value = tools** — watchlist, paper trade, picks emails.
4. **Premium value = decisions** — live signals, automation, Telegram.
5. **Admin controls everything** — feature flags, user roles, content.
6. **Bot/execution is admin-only** — never expose real trading to public.
7. **Education = retention** — beginners who learn on your platform stay.
