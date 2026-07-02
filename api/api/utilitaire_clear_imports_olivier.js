// utilitaire_clear_imports_olivier.js
// Supprime tous les jours source='bulletin' ou source='previsionnel' du planning
// d'Olivier (CP 6810186B) pour permettre un test propre du déroulé prévisionnel.
// NE touche PAS aux jours source='manuel'.
// Exécution : node utilitaire_clear_imports_olivier.js (depuis api/api)

const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: 'trolley.proxy.rlwy.net',
  port: 47472,
  user: 'root',
  password: 'cVKgGVWWWYHmJslHyHKKJtHzetNdyKBS',
  database: 'railway',
};

const CP = '6810186B';

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    const [rows] = await conn.query(
      `SELECT COUNT(*) as nb FROM planning_jour WHERE cp_agent=? AND source IN ('bulletin','previsionnel')`,
      [CP]
    );
    console.log(`Jours importés trouvés : ${rows[0].nb}`);
    const [result] = await conn.query(
      `DELETE FROM planning_jour WHERE cp_agent=? AND source IN ('bulletin','previsionnel')`,
      [CP]
    );
    console.log(`✅ ${result.affectedRows} jour(s) supprimés (source=bulletin/previsionnel).`);
    console.log('Les jours saisis manuellement (source=manuel) sont préservés.');
  } catch (err) {
    console.error('❌ Erreur :', err.message);
  } finally {
    await conn.end();
  }
}
main();
