// Migration : module Formation (colonne profil_agent.is_afo + 4 tables).
// À lancer depuis le dossier api/api : node run_migration_formation.js
// Utilise le même pool que le serveur (src/config/db.js), donc le même .env
// déjà en place — pas de mot de passe à saisir ici.
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/db');

async function run() {
  try {
    // 1) Colonne is_afo sur profil_agent (idempotent, même style que
    // run_migration_profil_donnees.js).
    const [existingCol] = await pool.query(`SHOW COLUMNS FROM profil_agent LIKE 'is_afo'`);
    if (existingCol.length > 0) {
      console.log('Colonne is_afo déjà présente sur profil_agent — rien à faire.');
    } else {
      console.log('Ajout de la colonne is_afo...');
      await pool.query(`ALTER TABLE profil_agent ADD COLUMN is_afo TINYINT(1) NOT NULL DEFAULT 0 AFTER is_reserve`);
      console.log('OK — colonne is_afo ajoutée.');
    }

    // 2) Les 4 tables (CREATE TABLE IF NOT EXISTS, déjà idempotent).
    // pool n'a pas multipleStatements activé -> on exécute chaque instruction
    // séparément plutôt que le fichier .sql entier d'un coup.
    // Retire d'abord les lignes de commentaire (sinon un bloc "-- ...\nCREATE
    // TABLE..." dans le même chunk avant le premier ";" se faisait filtrer
    // en entier par erreur, statement invisible pour la boucle ci-dessous —
    // formation_catalogue n'était jamais créée, faisant échouer la FK de
    // formation_session juste après).
    const sql = fs.readFileSync(path.join(__dirname, 'add_formation_module.sql'), 'utf8')
      .split(/\r?\n/).filter(line => !line.trim().startsWith('--')).join('\n');
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      const tableMatch = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
      const label = tableMatch ? tableMatch[1] : stmt.slice(0, 40) + '...';
      console.log('Exécution :', label);
      await pool.query(stmt);
    }

    // 3) Vérification finale.
    console.log('\nVérification :');
    const [cols] = await pool.query(`SHOW COLUMNS FROM profil_agent LIKE 'is_afo'`);
    console.log('profil_agent.is_afo :', cols[0] || 'ABSENTE (problème)');
    for (const table of ['formation_catalogue', 'formation_session', 'formation_session_formateur', 'formation_enrollment']) {
      const [rows] = await pool.query(`SHOW TABLES LIKE '${table}'`);
      console.log(table, ':', rows.length > 0 ? 'OK' : 'ABSENTE (problème)');
    }
    console.log('\nMigration terminée.');
  } catch (e) {
    console.error('Erreur migration:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
