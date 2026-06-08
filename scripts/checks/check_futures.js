const { KiteConnect } = require('kiteconnect');
const fs  = require('fs');
const env = require('dotenv').parse(fs.readFileSync('.env'));
const kite = new KiteConnect({ api_key: env.API_KEY });
kite.setAccessToken(env.ACCESS_TOKEN);
kite.getInstruments('NFO').then(ins => {
  const fut = ins.filter(i => i.name === 'BANKNIFTY' && i.instrument_type === 'FUT');
  fut.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  fut.slice(0, 3).forEach(i => console.log(i.tradingsymbol, '| expiry:', i.expiry, '| lot:', i.lot_size));
}).catch(e => console.error(e.message));
