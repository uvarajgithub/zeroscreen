const http = require('http');

function get(path, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const request = http.get({ host: '127.0.0.1', port: 4000, path, headers: { Accept: 'application/json' } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, ms: Date.now() - started, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.setTimeout(timeout, () => request.destroy(new Error(`HTTP timeout: ${path}`)));
    request.on('error', reject);
  });
}
function assert(ok, message) { if (!ok) throw new Error(message); }
function sessionRows(payload, day = '2026-07-31') {
  return (payload.history?.trades || []).filter((row) => row.date === day);
}

(async () => {
  const page = await get('/signals');
  assert(page.status === 200, `/signals returned HTTP ${page.status}`);
  assert(page.body.includes('data-period="TRADES"'), 'Trades tab is missing from /signals');

  const tt = await get('/api/shadow-monitor?strategy=tt1000&instrument=FUTURES');
  assert(tt.status === 200, `TT1000 API returned HTTP ${tt.status}`);
  const ttPayload = JSON.parse(tt.body);
  const ttRows = sessionRows(ttPayload);
  assert(ttPayload.identity?.strategyId === 'tt1000', 'TT1000 strategy did not resolve');
  const strategyIds = (ttPayload.strategies || []).map((row) => row.id);
  assert(strategyIds.includes('body-hold-s1') && strategyIds.includes('body-hold-s2'), 'Body Hold selectors are missing from API');
  assert(ttRows.length === 2 && ttRows.reduce((sum, row) => sum + Number(row.pnl || 0), 0) === 598, 'TT1000 Friday UI history is incorrect');

  const body = await get('/api/shadow-monitor?strategy=body-hold-s2&instrument=OPTIONS');
  assert(body.status === 200, `Body Hold API returned HTTP ${body.status}`);
  const bodyPayload = JSON.parse(body.body);
  const bodyRows = sessionRows(bodyPayload);
  assert(bodyPayload.identity?.strategyId === 'body-hold-s2', 'Body Hold S2 strategy did not resolve');
  assert(bodyRows.length === 1 && Number(bodyRows[0].pnl) === -1991, 'Body Hold S2 corrected option loss is not shown');

  console.log(`PASS /signals HTTP 200 with Trades tab and API Body Hold selectors (${page.ms}ms)`);
  console.log(`PASS TT1000 Friday UI: 2 futures trades, net Rs 598 (${tt.ms}ms)`);
  console.log(`PASS Body Hold S2 Friday option UI: 1 trade, net Rs -1991 (${body.ms}ms)`);
  console.log('UI_RUNTIME_VERIFICATION=OK');
})().catch((error) => {
  console.error(`UI_RUNTIME_VERIFICATION=FAILED:${error.message}`);
  process.exitCode = 1;
});
