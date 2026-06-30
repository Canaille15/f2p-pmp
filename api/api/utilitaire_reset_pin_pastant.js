// utilitaire_reset_pin_pastant.js
// Réinitialise le PIN de Maxime Pastant (CP 9207889A) directement en base, en bcrypt
// (même mécanisme que login/changePin), pour contourner le bug du bouton "réinitialiser
// le PIN" dans le Panneau Admin (resetPin manquant côté client.js — bug préexistant,
// sans rapport avec le chantier bulletin).
// Exécution : node utilitaire_reset_pin_pastant.js (depuis api/api, car bcrypt y est installé)

const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: 'trolley.proxy.rlwy.net',
  port: 47472,
  user: 'root',
  password: 'cVKgGVWWWYHmJslHyHKKJtHzetNdyKBS',
  database: 'railway',
};

const CP = '9207889A';
const NOUVEAU_PIN = '1234'; // PIN temporaire de test — à changer par l'agent dès la première connexion

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    const [rows] = await conn.query('SELECT cp_agent FROM auth WHERE cp_agent = ?', [CP]);
    if (!rows.length) {
      console.error(`❌ Aucune entrée auth trouvée pour le CP ${CP}.`);
      return;
    }
    const hash = await bcrypt.hash(NOUVEAU_PIN, 12);
    await conn.query('UPDATE auth SET pin_hash = ? WHERE cp_agent = ?', [hash, CP]);
    console.log(`✅ PIN de l'agent ${CP} réinitialisé à "${NOUVEAU_PIN}" (temporaire, à changer ensuite).`);
  } catch (err) {
    console.error('❌ Erreur :', err.message);
  } finally {
    await conn.end();
  }
}

main();
