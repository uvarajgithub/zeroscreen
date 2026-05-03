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
