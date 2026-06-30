const mysql = require('mysql2/promise');
const fs = require('fs');

(async () => {
  const sql = fs.readFileSync(__dirname + '/migration_echange.sql', 'utf8');

  const conn = await mysql.createConnection({
    host: 'trolley.proxy.rlwy.net',
    port: 47472,
    user: 'root',
    password: 'cVKgGVWWWYHmJslHyHKKJtHzetNdyKBS',
    database: 'railway',
    multipleStatements: true
  });

  try {
    await conn.query(sql);
    console.log('Migration echange : OK');

    const [rows] = await conn.query("SHOW TABLES LIKE 'echange%'");
    console.log('Tables présentes après migration :');
    rows.forEach(r => console.log(' -', Object.values(r)[0]));
  } catch (e) {
    console.error('Erreur migration :', e.message);
  } finally {
    await conn.end();
  }
})();
