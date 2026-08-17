const { KiteConnect } = require("/home/ubuntu/trading-bot/node_modules/kiteconnect");
const { config } = require("/home/ubuntu/trading-bot/dist/src/config.js");
const kite = new KiteConnect({ api_key: config.apiKey });
kite.setAccessToken(config.accessToken);

const now = new Date();
const ist = new Date(now.getTime() + 5.5 * 3600000);
const day = ist.toISOString().slice(0, 10);
const hhmm = ist.toISOString().slice(11, 16);
const cases = [
  ["NIFTY-string", 256265, `${day} 09:15:00`, `${day} ${hhmm}:00`],
  ["BANK-string", 260105, `${day} 09:15:00`, `${day} ${hhmm}:00`],
  ["NIFTY-date", 256265, new Date(now.getTime() - 14 * 86400000), new Date(now.getTime() - 60000)],
  ["BANK-date", 260105, new Date(now.getTime() - 14 * 86400000), new Date(now.getTime() - 60000)],
];

(async () => {
  for (const [name, token, from, to] of cases) {
    try {
      const result = await kite.getHistoricalData(token, "15minute", from, to, false);
      const rows = Array.isArray(result) ? result : (Array.isArray(result?.data) ? result.data : []);
      const todayRows = rows.filter(row => new Date(row.date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === day);
      console.log(JSON.stringify({ name, rows: rows.length, todayRows: todayRows.length, first: rows[0]?.date || null, last: rows.at(-1)?.date || null }));
    } catch (error) {
      console.log(JSON.stringify({ name, error: error?.message || String(error) }));
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
