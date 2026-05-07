const bcrypt = require('bcrypt');
bcrypt.hash('Test1234', 12).then(h => { console.log(h); process.exit(0); });
