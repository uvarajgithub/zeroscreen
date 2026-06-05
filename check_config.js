const c = require('./dist/src/config.js');
console.log('Strategy:', c.config.activeStrategy || c.config.mode);
console.log('DailyLossCap:', c.config.risk?.dailyLossCap);
console.log('MaxTrades:', c.config.risk?.maxTradesPerDay);
console.log('Mode:', c.config.mode);
