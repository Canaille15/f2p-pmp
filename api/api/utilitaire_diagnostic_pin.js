// utilitaire_diagnostic_pin.js
// Vérifie et corrige le pin_hash pour le CP 6810186B
// Exécution : node utilitaire_diagnostic_pin.js (depuis api/api)

const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: 'trolley.proxy.rlwy.net',
  port: 47472,
  user: 'root',
  password: 'cVKgGVWWWYHmJslHyHKKJtHzetNdyKBS',
  database: 'railway',
};

const CP = '6810186B';
const NOUVEAU_PIN = '1234';

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    // Vérifier auth
    const [authRows] = await conn.query('SELECT * FROM auth WHERE cp_agent = ?', [CP]);
    console.log('Lignes auth trouvées:', authRows.length);
    if (authRows.length > 0) {
      const row = authRows[0];
      console.log('cp_agent:', row.cp_agent);
      console.log('pin_hash type:', typeof row.pin_hash);
      console.log('pin_hash value:', row.pin_hash === null ? 'NULL' : row.pin_hash === undefined ? 'UNDEFINED' : `"${String(row.pin_hash).slice(0,20)}..."`);
      console.log('is_admin:', row.is_admin);
    }

    // Vérifier agent
    const [agentRows] = await conn.query('SELECT cp FROM agent WHERE cp = ?', [CP]);
    console.log('Lignes agent trouvées:', agentRows.length);

    // Forcer la mise à jour du PIN
    console.log('\nForce update du PIN...');
    const hash = await bcrypt.hash(NOUVEAU_PIN, 12);
    console.log('Hash généré:', hash.slice(0, 20) + '...');
    const [result] = await conn.query('UPDATE auth SET pin_hash = ? WHERE cp_agent = ?', [hash, CP]);
    console.log('Rows affected:', result.affectedRows);

    // Relire pour confirmer
    const [check] = await conn.query('SELECT pin_hash FROM auth WHERE cp_agent = ?', [CP]);
    console.log('Après update, pin_hash:', check[0]?.pin_hash?.slice(0,20) + '...');
    console.log(`\n✅ PIN "${NOUVEAU_PIN}" configuré. Essaie de te connecter maintenant.`);
  } catch (err) {
    console.error('❌ Erreur :', err.message);
  } finally {
    await conn.end();
  }
}
main();
