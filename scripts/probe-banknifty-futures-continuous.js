"use strict";

const path = require("path");
const { KiteConnect } = require("kiteconnect");

require("dotenv").config({ path: path.join(process.cwd(), ".env") });

async function main() {
  if (!process.env.API_KEY || !process.env.ACCESS_TOKEN) {
    throw new Error("API_KEY and ACCESS_TOKEN are required in .env");
  }

  const kite = new KiteConnect({ api_key: process.env.API_KEY });
  kite.setAccessToken(process.env.ACCESS_TOKEN);
  const instruments = await kite.getInstruments("NFO");
  const futures = instruments
    .filter((instrument) => instrument.name === "BANKNIFTY" && instrument.instrument_type === "FUT")
    .sort((left, right) => new Date(left.expiry) - new Date(right.expiry));

  if (!futures.length) throw new Error("No active BANKNIFTY futures instrument found");

  const selected = futures[0];
  const probes = [];
  for (const interval of ["15minute", "day"]) {
    try {
      const candles = await kite.getHistoricalData(
        Number(selected.instrument_token),
        interval,
        "2025-08-12",
        "2025-08-14",
        true,
        false,
      );
      probes.push({
        interval,
        ok: true,
        candles: candles.length,
        first: candles[0] || null,
        last: candles.at(-1) || null,
      });
    } catch (error) {
      probes.push({ interval, ok: false, error: error?.message || String(error) });
    }
  }

  console.log(JSON.stringify({
    selected: {
      symbol: selected.tradingsymbol,
      token: Number(selected.instrument_token),
      expiry: selected.expiry,
    },
    probes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
