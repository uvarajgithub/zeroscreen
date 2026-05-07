const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./zeroscreen.db');

db.run("UPDATE picks SET status='expired' WHERE status='active' AND created_by IS NULL", function(err) {
  if (err) { console.error('Error:', err.message); process.exit(1); }
  console.log('Expired auto-picks:', this.changes);
  db.get("SELECT count(*) as cnt FROM picks WHERE status='active' AND created_by IS NULL", (err2, row) => {
    console.log('Active auto-picks remaining:', row ? row.cnt : 'error');
    db.close();
    console.log('Done. Restart zeroscreen to trigger regeneration at next scheduler run.');
  });
});
