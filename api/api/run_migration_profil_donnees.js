// Migration : ajoute la colonne profil_agent.donnees_json
// À lancer depuis le dossier api/api : node run_migration_profil_donnees.js
// Utilise le même pool que le serveur (src/config/db.js), donc le même .env
// déjà en place — pas de mot de passe à saisir ici.
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/db');

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migration_profil_donnees.sql'), 'utf8');
  try {
    const [existing] = await pool.query(`SHOW COLUMNS FROM profil_agent LIKE 'donnees_json'`);
    if (existing.length > 0) {
      console.log('Colonne donnees_json déjà présente sur profil_agent — rien à faire.');
      console.log(existing[0]);
      return;
    }

    console.log('Exécution de la migration...');
    await pool.query(sql);
    console.log('OK — colonne ajoutée.');

    const [cols] = await pool.query(`SHOW COLUMNS FROM profil_agent LIKE 'donnees_json'`);
    if (cols.length > 0) {
      console.log('Vérification : colonne donnees_json présente sur profil_agent.');
      console.log(cols[0]);
    } else {
      console.log('ATTENTION : colonne donnees_json introuvable après migration.');
    }
  } catch (e) {
    console.error('Erreur migration:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
