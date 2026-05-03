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
  const btn = document.getElementById('hamburger');
  const links = document.getElementById('nav-links');
  if (!btn || !links) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = links.classList.toggle('open');
    btn.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !links.contains(e.target)) {
      links.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
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

