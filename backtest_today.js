// Today's backtest: LOCK50 + TRAIL + SCALP1 simulation using real Kite candles
'use strict';
require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const API_KEY = process.env.KITE_API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
