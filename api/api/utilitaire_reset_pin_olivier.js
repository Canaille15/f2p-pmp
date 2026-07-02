// utilitaire_reset_pin_olivier.js
// Réinitialise le PIN d'Olivier Beffaral (CP 6810186B) directement en base.
// Exécution : node utilitaire_reset_pin_olivier.js (depuis api/api)

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
const NOUVEAU_PIN = '1234'; // PIN temporaire — à changer immédiatement après connexion

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    const [rows] = await conn.query('SELECT cp_agent, pin_hash FROM auth WHERE cp_agent = ?', [CP]);
    if (!rows.length) { console.error(`❌ Aucune entrée auth pour CP ${CP}.`); return; }
    console.log('pin_hash actuel:', rows[0].pin_hash ? 'OK (non null)' : 'NULL (problème détecté)');
    const hash = await bcrypt.hash(NOUVEAU_PIN, 12);
    await conn.query('UPDATE auth SET pin_hash = ? WHERE cp_agent = ?', [hash, CP]);
    console.log(`✅ PIN de ${CP} réinitialisé à "${NOUVEAU_PIN}".`);
  } catch (err) {
    console.error('❌ Erreur :', err.message);
  } finally {
    await conn.end();
  }
}
main();
