const fs = require("fs");
const http = require("http");
const { KiteConnect } = require("/home/ubuntu/trading-bot/node_modules/kiteconnect");
const { config } = require("/home/ubuntu/trading-bot/dist/src/config.js");

const botDir = "/home/ubuntu/trading-bot";
const tokenAgeMinutes = Math.round((Date.now() - fs.statSync(`${botDir}/access_token.txt`).mtimeMs) / 60000);
const istNow = new Date(Date.now() + 5.5 * 3600000);
const today = istNow.toISOString().slice(0, 10);
const istMinute = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
const sessionDate = istMinute < 570
  ? new Date(istNow.getTime() - 86400000).toISOString().slice(0, 10)
  : today;
const kite = new KiteConnect({ api_key: config.apiKey });
kite.setAccessToken(config.accessToken);

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, response => {
      let body = "";
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body }));
    }).on("error", reject);
  });
}

(async () => {
  const ltp = await kite.getLTP(["NSE:NIFTY BANK", "NSE:NIFTY 50"]);
  const bankPrice = Number(ltp?.["NSE:NIFTY BANK"]?.last_price || 0);
  const niftyPrice = Number(ltp?.["NSE:NIFTY 50"]?.last_price || 0);
  const candleResult = await kite.getHistoricalData(260105, "15minute", `${sessionDate} 09:15:00`, `${sessionDate} 23:59:00`, false);
  const candles = Array.isArray(candleResult) ? candleResult : (Array.isArray(candleResult?.data) ? candleResult.data : []);
  const api = await get("http://127.0.0.1:4000/api/shadow-monitor?strategy=tt1030&instrument=FUTURES&underlying=BANKNIFTY");
  let apiSummary = `http=${api.status}`;
  try {
    const payload = JSON.parse(api.body);
    apiSummary += ` health=${payload.health?.overall || "UNKNOWN"} market=${payload.market?.status || "UNKNOWN"}`;
  } catch {
    apiSummary += " non_json=true";
  }
  console.log(`TOKEN_AGE_MINUTES=${tokenAgeMinutes}`);
  console.log(`BROKER_LTP_OK=${bankPrice > 0 && niftyPrice > 0} bank=${bankPrice} nifty=${niftyPrice}`);
  console.log(`BANKNIFTY_CANDLES=${Array.isArray(candles) ? candles.length : 0} sessionDate=${sessionDate}`);
  console.log(`DASHBOARD_API=${apiSummary}`);
  if (!(bankPrice > 0 && niftyPrice > 0) || !Array.isArray(candles) || candles.length < 20 || api.status !== 200) process.exitCode = 1;
})().catch(error => {
  console.error(`READINESS_ERROR=${error?.message || String(error)}`);
  process.exitCode = 1;
});
