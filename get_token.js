const db = require('/root/zeroscreen/dist/db.js');
db.getSetting('kite_access_token').then(t => {
  if (t) {
    console.log('TOKEN:' + t);
  } else {
    console.log('NO_TOKEN');
  }
}).catch(e => console.log('ERR:' + e.message));
