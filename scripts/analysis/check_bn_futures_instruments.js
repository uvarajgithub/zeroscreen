'use strict';

const { KiteConnect } = require('kiteconnect');
require('dotenv').config({ path: process.env.TRADING_BOT_ENV_PATH || '.env' });

(async () => {
  const kite = new KiteConnect({ api_key: process.env.API_KEY || '' });
  kite.setAccessToken(process.env.ACCESS_TOKEN || '');
  const ins = await kite.getInstruments('NFO');
  const futs = ins.filter(i => i.name === 'BANKNIFTY' && i.instrument_type === 'FUT');
  const expiries = [...new Set(futs.map(i => String(i.expiry).slice(0, 10)))].sort();
  console.log(`futs=${futs.length}`);
  console.log(`expiries=${expiries.length}`);
  console.log(`first=${expiries[0] || ''}`);
  console.log(`last=${expiries[expiries.length - 1] || ''}`);
  console.log(`sample=${futs.slice(0, 10).map(f => `${f.tradingsymbol}:${String(f.expiry).slice(0, 10)}`).join(',')}`);
})();
