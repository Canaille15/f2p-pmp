const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'trolley.proxy.rlwy.net',
    port: 47472,
    user: 'root',
    password: 'cVKgGVWWWYHmJslHyHKKJtHzetNdyKBS',
    database: 'railway'
  });

  try {
    await conn.query('ALTER TABLE echange DROP FOREIGN KEY fk_ech_poste');
    console.log('Contrainte fk_ech_poste supprimée avec succès.');
  } catch (e) {
    console.error('Erreur :', e.message);
  }

  await conn.end();
})();
