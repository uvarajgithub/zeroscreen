'use strict';
// Fetch REAL premium data from Kite API
// Strategy: fetch active/recent futures + options contracts
// For 5yr full picture: use mathematical proof (premium change ≈ 0 over many trades)

const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: process.env.TRADING_BOT_ENV_PATH || path.join(process.cwd(), '.env') });

const { KiteConnect } = require('kiteconnect');
const kite = new KiteConnect({ api_key: process.env.API_KEY || '' });
kite.setAccessToken(process.env.ACCESS_TOKEN || '');

const CACHE_DIR = path.join(process.cwd(), 'cache');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log('\n FETCHING REAL PREMIUM DATA FROM KITE');
  console.log('━'.repeat(60));

  // Get all NFO instruments (active + recent)
  const instruments = await kite.getInstruments('NFO');
  const bnFuts = instruments.filter(i => i.name === 'BANKNIFTY' && i.instrument_type === 'FUT')
    .sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
  const bnOpts = instruments.filter(i => i.name === 'BANKNIFTY' && (i.instrument_type === 'CE' || i.instrument_type === 'PE'));

  console.log(`\n Available BankNifty futures: ${bnFuts.map(f => f.tradingsymbol).join(', ')}`);
  console.log(`\n Available BankNifty options: ${[...new Set(bnOpts.map(o => new Date(o.expiry).toISOString().slice(0,10)))].join(', ')}`);

  // ── Fetch futures OHLC for each available contract ─────────────────────────
  const futuresCache = {};
  for (const fut of bnFuts) {
    const sym   = fut.tradingsymbol;
    const from  = new Date(new Date(fut.expiry).getFullYear(), new Date(fut.expiry).getMonth(), 1);
    const to    = new Date(fut.expiry);
    const fromS = from.toISOString().slice(0,10);
    const toS   = to.toISOString().slice(0,10);

    console.log(`\n Fetching ${sym}: ${fromS} → ${toS}`);
    try {
      const data = await kite.getHistoricalData(fut.instrument_token, '15minute', fromS, toS, false);
      await sleep(400);

      // Group by date
      for (const candle of data) {
        const ist = new Date(new Date(candle.date).getTime() + 5.5*3600000);
        const dateStr = ist.toISOString().slice(0,10);
        if (!futuresCache[dateStr]) futuresCache[dateStr] = [];
        futuresCache[dateStr].push({
          time: ist.toISOString().slice(11,16),
          open: candle.open, high: candle.high, low: candle.low, close: candle.close,
          h: ist.getUTCHours(), m: ist.getUTCMinutes(), sym
        });
      }
      console.log(`   Got ${data.length} candles for ${sym}`);
    } catch (e) {
      console.log(`   Error: ${e.message}`);
    }
  }

  // ── Fetch ATM options closing prices for each available expiry ─────────────
  const optionsCache = {};
  const expiries = [...new Set(bnOpts.map(o => o.expiry))].sort();

  for (const expiry of expiries) {
    const exDate  = new Date(expiry);
    const fromD   = new Date(exDate.getFullYear(), exDate.getMonth(), 1);
    const fromStr = fromD.toISOString().slice(0,10);
    const toStr   = exDate.toISOString().slice(0,10);

    console.log(`\n Fetching options for expiry ${toStr}...`);

    // Get unique strikes available
    const expiryOpts = bnOpts.filter(o => o.expiry === expiry);
    const strikes = [...new Set(expiryOpts.map(o => o.strike))].sort((a,b) => a-b);
    console.log(`   Strikes: ${strikes.slice(0,5).join(', ')}...${strikes.slice(-3).join(', ')} (${strikes.length} total)`);

    // Fetch daily OHLC for CE and PE of a few ATM strikes
    // We'll fetch for strikes around current ATM (54000-55000 range)
    const atmStrikes = strikes.filter(s => s >= 52000 && s <= 56000).slice(0, 10);

    for (const strike of atmStrikes) {
      const ceOpt = expiryOpts.find(o => o.instrument_type === 'CE' && o.strike === strike);
      const peOpt = expiryOpts.find(o => o.instrument_type === 'PE' && o.strike === strike);
      if (!ceOpt || !peOpt) continue;

      try {
        const [ceD, peD] = await Promise.all([
          kite.getHistoricalData(ceOpt.instrument_token, 'day', fromStr, toStr, false),
          kite.getHistoricalData(peOpt.instrument_token, 'day', fromStr, toStr, false),
        ]);
        await sleep(700);

        for (let i = 0; i < ceD.length; i++) {
          const dateStr = new Date(ceD[i].date).toISOString().slice(0,10);
          if (!optionsCache[dateStr]) optionsCache[dateStr] = {};
          if (!optionsCache[dateStr][strike]) {
            optionsCache[dateStr][strike] = {
              ce: ceD[i].close,
              pe: peD[i]?.close ?? 0,
              expiry: toStr
            };
          }
        }
        process.stdout.write('.');
      } catch(e) {
        process.stdout.write('x');
        await sleep(300);
      }
    }
    console.log();
  }

  // Save
  fs.writeFileSync(path.join(CACHE_DIR, 'banknifty_futures_recent.json'), JSON.stringify(futuresCache, null, 1));
  fs.writeFileSync(path.join(CACHE_DIR, 'banknifty_options_recent.json'), JSON.stringify(optionsCache, null, 1));

  const futDates  = Object.keys(futuresCache).sort();
  const optDates  = Object.keys(optionsCache).sort();
  console.log(`\n Futures data: ${futDates[0]} → ${futDates[futDates.length-1]} (${futDates.length} days)`);
  console.log(` Options data: ${optDates[0]} → ${optDates[optDates.length-1]} (${optDates.length} days)`);
  console.log('\n Running premium-based backtest... (see bt_premium.js)');
}

main().catch(e => { console.error('Fatal:', e.message); });
