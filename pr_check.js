const d = require('./paper-records.json');
d.daily.slice(0,3).forEach(r => console.log(JSON.stringify(r)));
