// ZeroScreen — frontend JS

// ── Page Loader ────────────────────────────────────────────────────────────────
(function () {
  const MIN_MS = 400; // minimum display time

  const div = document.createElement('div');
  div.id = 'page-loader';
  div.innerHTML = [
    '<div class="loader-brand">Zero<span>Screen</span></div>',
    '<div class="loader-ring"></div>',
    '<div class="loader-dots"><span></span><span></span><span></span></div>',
    '<div class="loader-tagline">India\'s sharpest NSE screener</div>',
  ].join('');
  document.documentElement.appendChild(div);

  // ── On NEW page load: if sessionStorage has a start time, show loader immediately
  var _navAt = 0;
  try { _navAt = parseInt(sessionStorage.getItem('zs-loader-at') || '0', 10) || 0; } catch(_) {}
  if (_navAt) {
    var elapsed = Date.now() - _navAt;
    var remaining = Math.max(0, MIN_MS - elapsed);
    if (remaining > 50) {
      div.classList.add('show');
      setTimeout(function () { div.classList.remove('show'); }, remaining);
    }
    try { sessionStorage.removeItem('zs-loader-at'); } catch(_) {}
  }

  // ── On link click: save timestamp and show loader on current page
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto') ||
        a.hasAttribute('download') || a.target === '_blank' || href.startsWith('/api/')) return;
    try { sessionStorage.setItem('zs-loader-at', String(Date.now())); } catch(_) {}
    div.classList.add('show');
  });

  document.addEventListener('submit', function (e) {
    if (e.target && e.target.method && e.target.method.toLowerCase() === 'get') {
      try { sessionStorage.setItem('zs-loader-at', String(Date.now())); } catch(_) {}
      div.classList.add('show');
    }
  });

  // Safety: hide after page fully loads
  window.addEventListener('load', function () {
    setTimeout(function () { div.classList.remove('show'); }, 500);
  });
})();

// ── Dark mode (init before paint to avoid flash) ───────────────────────────────
(function () {
  if (localStorage.getItem('zs-dark') === '1') {
    document.documentElement.classList.add('dark');
  }
})();

function toggleDarkMode() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('zs-dark', isDark ? '1' : '0');
  const btn = document.getElementById('dark-toggle');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

// Sync button icon on load
(function () {
  const btn = document.getElementById('dark-toggle');
  if (btn && document.documentElement.classList.contains('dark')) btn.textContent = '☀️';
})();

// Load DB stats into nav
async function loadStats() {
  try {
    const r = await fetch('/api/stats');
    const d = await r.json();
    const el = document.getElementById('db-stats');
    if (el) {
      el.textContent = `${d.fetched}/${d.total} stocks cached · prices: ${d.lastPriceUpdate ? new Date(d.lastPriceUpdate).toLocaleDateString('en-IN') : 'never'}`;
    }
  } catch {}
}

loadStats();

// ── News Ticker ────────────────────────────────────────────────────────────────
async function loadTicker() {
  const track = document.getElementById('ticker-track');
  if (!track) return;
  try {
    const r = await fetch('/api/news');
    const items = await r.json();
    if (!items.length) { track.textContent = 'No news available'; return; }
    // Build items — duplicate for seamless loop
    const html = items.map(n =>
      `<a class="ticker-item" href="${n.link}" target="_blank" rel="noopener">
        <span class="ticker-dot">●</span>${n.title}
        <span class="ticker-src">${n.source}</span>
      </a>`
    ).join('');
    track.innerHTML = html + html; // duplicate for seamless loop
    // Set animation duration based on content width
    const fullWidth = track.scrollWidth / 2;
    const speed = Math.max(30, fullWidth / 80); // ~80px per second
    track.style.animationDuration = speed + 's';
  } catch {
    const track2 = document.getElementById('ticker-track');
    if (track2) track2.textContent = 'Market news unavailable';
  }
}

loadTicker();
setInterval(loadTicker, 5 * 60 * 1000);

// ── Hamburger menu ─────────────────────────────────────────────────────────────
(function () {
  const btn      = document.getElementById('hamburger');
  const links    = document.getElementById('nav-links');
  const overlay  = document.getElementById('nav-overlay');
  const closeBtn = document.getElementById('nav-mob-close');
  if (!btn || !links) return;
  function openMenu() {
    links.classList.add('open');
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    if (overlay) overlay.classList.add('open');
    document.body.classList.add('nav-open');
  }
  function closeMenu() {
    links.classList.remove('open');
    btn.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (overlay) overlay.classList.remove('open');
    document.body.classList.remove('nav-open');
  }
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    links.classList.contains('open') ? closeMenu() : openMenu();
  });
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  if (overlay)  overlay.addEventListener('click', closeMenu);
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeMenu(); });
})();

// ── Avatar dropdown ────────────────────────────────────────────────────────────
(function () {
  const wrap = document.getElementById('nav-user-menu');
  const btn  = document.getElementById('nav-user-btn');
  if (!wrap || !btn) return;
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    const open = wrap.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', function(e) {
    if (!wrap.contains(e.target)) {
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
})();

// ── "More" / tier dropdowns — generic handler for all .nav-more elements ──────
(function () {
  // Handle all nav-more dropdowns generically
  document.querySelectorAll('.nav-more').forEach(function(wrap) {
    var btn  = wrap.querySelector('.nav-more-btn');
    var drop = wrap.querySelector('.nav-more-drop');
    if (!btn || !drop) return;
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var isOpen = wrap.classList.contains('open');
      // Close all dropdowns first
      document.querySelectorAll('.nav-more.open').forEach(function(w) {
        w.classList.remove('open');
        w.querySelector('.nav-more-btn').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        wrap.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.nav-more')) {
      document.querySelectorAll('.nav-more.open').forEach(function(w) {
        w.classList.remove('open');
        var b = w.querySelector('.nav-more-btn');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
    }
  });
})();

// ── Nav search autocomplete ───────────────────────────────────────────────────
(function () {
  const searchInput = document.getElementById('nav-search');
  const searchResults = document.getElementById('nav-search-results');
  if (!searchInput || !searchResults) return;

  let searchTimer = null;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.length < 1) {
      searchResults.innerHTML = '';
      searchResults.style.display = 'none';
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/search?q=' + encodeURIComponent(q));
        if (!res.ok) return;
        const items = await res.json();
        if (!items.length) { searchResults.style.display = 'none'; return; }
        searchResults.innerHTML = items.map(s =>
          `<a href="/stock/${encodeURIComponent(s.symbol)}" class="search-result-item">` +
          `<span class="sr-sym">${s.symbol}</span>` +
          `<span class="sr-co">${s.company_name || ''}</span>` +
          `</a>`
        ).join('');
        searchResults.style.display = 'block';
      } catch (_) {}
    }, 200);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchResults.style.display = 'none'; searchInput.blur(); }
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.style.display = 'none';
    }
  });
})();

// ── FAQ Chatbot ────────────────────────────────────────────────────────────────
(function () {
  var btn     = document.getElementById('chat-bubble-btn');
  var win     = document.getElementById('chat-window');
  var closeBtn= document.getElementById('chat-close');
  var input   = document.getElementById('chat-input');
  var sendBtn = document.getElementById('chat-send');
  var msgs    = document.getElementById('chat-messages');
  if (!btn || !win) return;

  // ── FAQ data ── (no strategy secrets, no bot logic, only platform info)
  var faqs = [
    { k: ['paper trade','virtual','practice','1 lakh','₹1','paper money','risk free','no risk','lose money','afraid'],
      a: "📋 <strong>Paper Trade</strong> lets you practice trading with ₹1,00,000 virtual money — zero real money at risk! Trade any NSE stock at live market prices. It's perfect if you're new or afraid of losing money. <a href='/my-paper-trade'>Start here →</a>" },
    { k: ['beginner','new','start','afraid','scared','learn','first time','how to begin'],
      a: "🌱 <strong>New to trading?</strong> Start with Paper Trade — get ₹1,00,000 virtual money to practice on real NSE stocks without any risk. Find a strategy that works for <em>you</em> before going live. <a href='/paper-trade'>See how it works →</a>" },
    { k: ['screener','filter','search stocks','find stocks','nse stocks'],
      a: "🔍 <strong>NSE Screener</strong> covers 1,700+ stocks. Filter by ROCE, ROE, D/E ratio, P/E, promoter %, market cap, sector, and more. Or click any of the 14 strategy preset cards for instant results. <a href='/'>Open Screener →</a>" },
    { k: ['free','cost','price','subscription','pay','premium'],
      a: "✅ <strong>ZeroScreen is free forever</strong> for all screener features, signals, and paper trade. Premium (₹499/month) unlocks unlimited paper trades beyond the free 10-trade limit. <a href='/premium'>See plans →</a>" },
    { k: ['get started','sign up','signup','register','create account'],
      a: "🚀 <strong>Getting started is easy:</strong> Create a free account in 30 seconds — no credit card, no broker account needed. Or browse as a guest first! <a href='/signup'>Sign up free →</a>" },
    { k: ['roce','return on capital'],
      a: "📊 <strong>ROCE (Return on Capital Employed)</strong> measures how efficiently a company uses its capital to generate profit. ROCE > 15% is generally good; > 20% is excellent. Use the screener to filter by ROCE." },
    { k: ['roe','return on equity'],
      a: "📊 <strong>ROE (Return on Equity)</strong> shows how much profit is earned per rupee of shareholder equity. ROE > 15% is generally considered strong performance." },
    { k: ['d/e','debt','debt to equity','leverage'],
      a: "⚖️ <strong>D/E Ratio (Debt to Equity)</strong> measures financial risk. Lower is safer — D/E < 1 means more equity than debt. You can filter for 'Debt-Free' stocks directly in the screener." },
    { k: ['p/e','pe ratio','valuation'],
      a: "📈 <strong>P/E Ratio (Price to Earnings)</strong> shows how much you pay for each rupee of earnings. Lower P/E may mean undervalued, but compare within the same sector for best results." },
    { k: ['live bot','signals','banknifty','options bot','live signals'],
      a: "🤖 <strong>Live Bot</strong> shows real BANKNIFTY options trades made by our automated system — refreshes every 8 seconds with live P&L and confidence score. <a href='/signals'>Watch live →</a>" },
    { k: ['strategy','strategies','preset','blue chip','growth','value','dividend'],
      a: "🎯 ZeroScreen has <strong>14 one-click strategy presets</strong>: Quality Blue Chips, Debt-Free, Growth, Value, High ROCE, Dividend, Promoter, Small Cap, Penny, and more. Click any preset on the screener home page for instant results!" },
    { k: ['intraday','holding','swing','positional'],
      a: "📋 <strong>Intraday</strong> trades open and close on the same day. <strong>Holding</strong> trades can stay open for multiple days (positional). You can set your default in Paper Trade Settings." },
    { k: ['watchlist','watch list','save stocks'],
      a: "⭐ <strong>Watchlists</strong> let you save your favorite stocks and track their live prices. Create unlimited watchlists after signing in. <a href='/watchlists'>Go to Watchlists →</a>" },
    { k: ['alert','email alert','notification','notify'],
      a: "🔔 <strong>Alerts</strong> send you a morning email on weekdays when stocks match your saved screener filters. Set up alerts after signing in. <a href='/alerts'>Set up Alerts →</a>" },
    { k: ['compare','comparison','side by side'],
      a: "⚖️ <strong>Compare</strong> lets you pit 2–5 NSE stocks side-by-side on all key fundamentals — ROCE, ROE, D/E, P/E, EPS, Book Value, and more. <a href='/compare'>Compare stocks →</a>" },
    { k: ['dashboard','backtest','performance','win rate','equity curve'],
      a: "📊 <strong>Dashboard</strong> shows bot analytics with 5-year backtest data, monthly P&L charts, win rates, and a live equity curve. <a href='/dashboard'>View Dashboard →</a>" },
    { k: ['login','sign in','password','forgot','reset'],
      a: "🔐 You can <a href='/login'>sign in here</a> with email/password or Google. Forgot your password? Use the <a href='/forgot-password'>reset link</a>." },
    { k: ['contact','help','support'],
      a: "📬 Need more help? Visit our <a href='/contact'>Contact page</a> and send us a message. We usually respond within 24 hours." },
  ];

  function findAnswer(q) {
    q = q.toLowerCase();
    for (var i = 0; i < faqs.length; i++) {
      for (var j = 0; j < faqs[i].k.length; j++) {
        if (q.includes(faqs[i].k[j])) return faqs[i].a;
      }
    }
    return "🤔 I'm not sure about that one. Try asking about <strong>paper trade</strong>, <strong>screener</strong>, <strong>ROCE/ROE</strong>, <strong>alerts</strong>, or <strong>watchlists</strong>. Or visit our <a href='/contact'>Contact page</a> for more help!";
  }

  function addMsg(text, role) {
    var m = document.createElement('div');
    m.className = 'chat-msg ' + role;
    m.innerHTML = text;
    msgs.appendChild(m);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function handleSend() {
    var q = input.value.trim();
    if (!q) return;
    addMsg(q, 'user');
    input.value = '';
    var ans = findAnswer(q);
    setTimeout(function () { addMsg(ans, 'bot'); }, 320);
  }

  btn.addEventListener('click', function () {
    var isOpen = win.style.display !== 'none';
    win.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen) { setTimeout(function () { input.focus(); }, 50); }
  });
  if (closeBtn) closeBtn.addEventListener('click', function () { win.style.display = 'none'; });
  if (sendBtn) sendBtn.addEventListener('click', handleSend);
  if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleSend(); });

  // Chip clicks
  msgs.addEventListener('click', function (e) {
    var chip = e.target.closest('.chat-chip');
    if (!chip) return;
    var q = chip.getAttribute('data-q') || chip.textContent;
    addMsg(q, 'user');
    var ans = findAnswer(q);
    setTimeout(function () { addMsg(ans, 'bot'); }, 320);
  });

  // Close when clicking outside
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.chat-widget')) {
      win.style.display = 'none';
    }
  });
})();

// ── Guest Soft-Gate Modal ─────────────────────────────────────────────────────
(function () {
  var nav = document.querySelector('.topnav');
  if (!nav || nav.getAttribute('data-auth') === 'member') return;

  // Links that require login — intercept guest clicks
  var gatedHrefs = ['/watchlists', '/alerts', '/my-paper-trade', '/paper-trade/config', '/profile'];
  var gatedSelectors = gatedHrefs.map(function(h){ return 'a[href="' + h + '"]'; }).join(',');

  // Also intercept links that start with these paths
  function isGated(href) {
    return gatedHrefs.some(function(g){ return href === g || href.startsWith(g + '/'); });
  }

  function showGateModal(icon, title, sub) {
    if (document.querySelector('.sg-overlay')) return; // already shown
    var overlay = document.createElement('div');
    overlay.className = 'sg-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = [
      '<div class="sg-sheet" style="position:relative">',
        '<div class="sg-pill"></div>',
        '<div class="sg-icon">' + icon + '</div>',
        '<div class="sg-title">' + title + '</div>',
        '<div class="sg-sub">' + sub + '</div>',
        '<div class="sg-perks">',
          '<span class="sg-perk">📋 ₹1L Paper Trade</span>',
          '<span class="sg-perk">⭐ Watchlists</span>',
          '<span class="sg-perk">🔔 Email Alerts</span>',
          '<span class="sg-perk">📬 Daily Picks</span>',
        '</div>',
        '<div class="sg-btns">',
          '<a href="/signup" class="sg-btn-primary">⚡ Create Free Account</a>',
          '<a href="/login" class="sg-btn-secondary">Already have an account? Sign in</a>',
        '</div>',
        '<button class="sg-close" aria-label="Close">✕</button>',
      '</div>',
    ].join('');

    overlay.querySelector('.sg-close').addEventListener('click', function(){ overlay.remove(); });
    overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  document.addEventListener('click', function(e) {
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (isGated(href)) {
      e.preventDefault();
      var map = {
        '/watchlists':   ['⭐', 'Save stocks to Watchlist', 'Create a free account to build and manage unlimited watchlists.'],
        '/alerts':       ['🔔', 'Get Stock Alerts', 'Sign up free to set email alerts on your custom screener filters.'],
        '/my-paper-trade': ['📋', 'Start Paper Trading', 'Create a free account to get ₹1,00,000 virtual money and trade any NSE stock risk-free.'],
      };
      var key = Object.keys(map).find(function(k){ return href.startsWith(k); });
      var m = key ? map[key] : ['🔐', 'Sign in required', 'Create a free account to access this feature.'];
      showGateModal(m[0], m[1], m[2]);
    }
  }, true);
})();

// ── Site Footer (injected on all pages) ───────────────────────────────────────
(function () {
  // Skip auth/landing pages (no nav = no footer needed)
  if (!document.querySelector('.topnav')) return;

  var footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = [
    '<div class="sf-inner">',

      // ── Stats bar ──────────────────────────────────────────────────────────
      '<div class="sf-stats">',
        '<div class="sf-stat"><strong>1,700+</strong><span>NSE Stocks</span></div>',
        '<div class="sf-stat"><strong>14</strong><span>Strategies</span></div>',
        '<div class="sf-stat"><strong>5 Yrs</strong><span>Backtest Data</span></div>',
        '<div class="sf-stat"><strong>8s</strong><span>Bot Refresh</span></div>',
        '<div class="sf-stat"><strong>Free</strong><span>Core Features</span></div>',
      '</div>',

      '<div class="sf-divider-thin"></div>',

      // ── Main footer grid ───────────────────────────────────────────────────
      '<div class="sf-top">',

        // Brand column
        '<div class="sf-brand">',
          '<div class="sf-brand-name">Zero<em>Screen</em></div>',
          '<p class="sf-brand-desc">India\'s sharpest NSE stock screener &amp; BANKNIFTY trading platform. Built by traders, for Indian retail investors.</p>',
          '<a href="mailto:support@zeroscreen.in" class="sf-email">✉ support@zeroscreen.in</a>',
          '<div class="sf-social">',
            '<a href="https://twitter.com/zeroscreen_in" target="_blank" rel="noopener" class="sf-soc" title="Twitter/X">𝕏</a>',
            '<a href="https://t.me/zeroscreen" target="_blank" rel="noopener" class="sf-soc" title="Telegram">✈</a>',
            '<a href="https://youtube.com/@zeroscreen" target="_blank" rel="noopener" class="sf-soc" title="YouTube">▶</a>',
          '</div>',
        '</div>',

        // Platform links
        '<div class="sf-col">',
          '<div class="sf-col-title">Platform</div>',
          '<a href="/">🔍 NSE Screener</a>',
          '<a href="/today">🔥 Today\'s Picks</a>',
          '<a href="/signals">🤖 Live Bot</a>',
          '<a href="/paper-trade">📋 Paper Trade</a>',
          '<a href="/strategies">⚙️ Strategies</a>',
        '</div>',

        // Tools links
        '<div class="sf-col">',
          '<div class="sf-col-title">Tools</div>',
          '<a href="/compare">⚖️ Compare Stocks</a>',
          '<a href="/dashboard">📊 Bot Analytics</a>',
          '<a href="/strategy-builder">🔨 Strategy Builder</a>',
          '<a href="/my-paper-trade">💼 My Portfolio</a>',
          '<a href="/watchlists">⭐ Watchlists</a>',
        '</div>',

        // Company links
        '<div class="sf-col">',
          '<div class="sf-col-title">Company</div>',
          '<a href="/about">ℹ️ About Us</a>',
          '<a href="/contact">📬 Contact</a>',
          '<a href="/premium">⚡ Premium Plans</a>',
          '<a href="/privacy">🔒 Privacy Policy</a>',
          '<a href="/terms">📄 Terms of Use</a>',
        '</div>',

      '</div>',

      '<div class="sf-divider"></div>',

      // ── Disclaimer ─────────────────────────────────────────────────────────
      '<div class="sf-disclaimer">',
        '<span class="sf-disc-badge">⚠️ Disclaimer</span>',
        '<span>ZeroScreen is <strong>not SEBI registered</strong>. All content is for <strong>educational &amp; informational purposes only</strong> and does not constitute investment advice. Paper trading uses <strong>virtual money — no real capital at risk</strong>. Prices are from NSE data and updated periodically. Past performance is not indicative of future results. Trading in derivatives and equities involves substantial risk of loss. Please consult a qualified financial advisor before making any investment decisions.</span>',
      '</div>',

      // ── Bottom bar ─────────────────────────────────────────────────────────
      '<div class="sf-bottom">',
        '<span class="sf-copy">© 2026 ZeroScreen · All rights reserved · Built with ❤️ in India 🇮🇳</span>',
        '<div class="sf-bottom-links">',
          '<a href="/privacy">Privacy</a>',
          '<a href="/terms">Terms</a>',
          '<a href="/sitemap">Sitemap</a>',
          '<a href="/contact">Contact</a>',
        '</div>',
      '</div>',

    '</div>',
  ].join('');

  var existing = document.querySelector('.site-footer');
  if (existing) {
    existing.replaceWith(footer);
  } else {
    document.body.appendChild(footer);
  }
})();

// ── Onboarding Checklist ───────────────────────────────────────────────────────
(function () {
  // Only show when logged in (server injects window._zsUid via nav())
  var userId = (typeof window._zsUid !== 'undefined') ? String(window._zsUid) : '';
  var userRole = (typeof window._zsRole !== 'undefined') ? String(window._zsRole) : 'guest';
  if (!userId) return;

  var KEY      = 'zs-onboard-done-' + userId;
  var HIDE_KEY = 'zs-onboard-hidden-' + userId;

  // Define steps: { id, label, done: fn() -> bool, href }
  var steps = [
    { id: 'signup',  label: 'Create your account',       done: function() { return true; },                                      href: null },
    { id: 'trade',   label: 'Make your first paper trade', done: function() { return localStorage.getItem('zs-did-trade-'+userId)==='1'; }, href: '/my-paper-trade' },
    { id: 'watch',   label: 'Add a stock to watchlist',   done: function() { return localStorage.getItem('zs-did-watch-'+userId)==='1'; }, href: '/watchlists' },
    { id: 'invite',  label: 'Invite a friend (earn ₹10k)', done: function() { return localStorage.getItem('zs-did-invite-'+userId)==='1'; }, href: '/my-referrals' },
    { id: 'premium', label: 'Try Premium →',              done: function() { return userRole==='premium'||userRole==='admin'; }, href: '/premium' },
  ];

  function allDone() { return steps.every(function(s) { return s.done(); }); }

  if (localStorage.getItem(HIDE_KEY) === '1') return;

  var doneCount = steps.filter(function(s) { return s.done(); }).length;

  if (doneCount >= steps.length) {
    localStorage.setItem(HIDE_KEY, '1');
    return;
  }

  if (window.location.pathname.startsWith('/admin')) return;

  var widget = document.createElement('div');
  widget.id  = 'onboard-widget';
  widget.className = 'onboard-widget';
  widget.setAttribute('role', 'complementary');
  widget.setAttribute('aria-label', 'Getting started checklist');

  var progressPct = Math.round((doneCount / steps.length) * 100);

  widget.innerHTML = [
    '<div class="onb-header">',
      '<div>',
        '<div class="onb-title">🚀 Getting Started</div>',
        '<div class="onb-sub">' + doneCount + ' of ' + steps.length + ' done</div>',
      '</div>',
      '<button class="onb-close" onclick="document.getElementById(\'onboard-widget\').remove();localStorage.setItem(\''+HIDE_KEY+'\',\'1\')" aria-label="Dismiss checklist">✕</button>',
    '</div>',
    '<div class="onb-progress-bar"><div class="onb-progress-fill" style="width:'+progressPct+'%"></div></div>',
    '<ul class="onb-steps">',
      steps.map(function(s) {
        var done = s.done();
        return [
          '<li class="onb-step' + (done ? ' done' : '') + '">',
            '<span class="onb-check">' + (done ? '✓' : '') + '</span>',
            s.href && !done
              ? '<a class="onb-label" href="' + s.href + '">' + s.label + '</a>'
              : '<span class="onb-label">' + s.label + '</span>',
          '</li>',
        ].join('');
      }).join(''),
    '</ul>',
  ].join('');

  document.body.appendChild(widget);

  setTimeout(function() {
    if (allDone()) { widget.remove(); localStorage.setItem(HIDE_KEY, '1'); }
  }, 1000);
})();

// ── Mark paper-trade done (called by my-paper-trade page) ─────────────────────
function zsMarkTradeDone() {
  if (typeof window._zsUid !== 'undefined') localStorage.setItem('zs-did-trade-' + window._zsUid, '1');
}
function zsMarkWatchDone() {
  if (typeof window._zsUid !== 'undefined') localStorage.setItem('zs-did-watch-' + window._zsUid, '1');
}
function zsMarkInviteDone() {
  if (typeof window._zsUid !== 'undefined') localStorage.setItem('zs-did-invite-' + window._zsUid, '1');
}


