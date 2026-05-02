// ZeroScreen — frontend JS

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
