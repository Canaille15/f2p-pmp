// patch_bulletin_01_sql.js
// Ajoute la prise en charge des imports de bulletin/déroulé sur planning_jour :
//  - étend l'ENUM source pour accepter 'bulletin'
//  - ajoute la colonne source_edition_date (date d'édition du document source)
// Exécution : node patch_bulletin_01_sql.js  (depuis la racine du projet, ou api/api/)

const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: 'trolley.proxy.rlwy.net',
  port: 47472,
  user: 'root',
  password: 'cVKgGVWWWYHmJslHyHKKJtHzetNdyKBS',
  database: 'railway',
};

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    console.log('Connexion établie. Vérification de la structure actuelle...');
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA='railway' AND TABLE_NAME='planning_jour'
         AND COLUMN_NAME IN ('source','source_edition_date')`
    );
    const hasSourceEditionDate = cols.some(c => c.COLUMN_NAME === 'source_edition_date');
    const sourceCol = cols.find(c => c.COLUMN_NAME === 'source');
    console.log('Colonnes trouvées :', cols);

    if (sourceCol && /'bulletin'/.test(sourceCol.COLUMN_TYPE)) {
      console.log("L'ENUM source contient déjà 'bulletin' — pas de modification nécessaire sur ce point.");
    } else {
      console.log("Extension de l'ENUM source pour ajouter 'bulletin'...");
      await conn.query(
        `ALTER TABLE planning_jour
         MODIFY source ENUM('manuel','previsionnel','import','bulletin') NOT NULL DEFAULT 'manuel'`
      );
      console.log('✅ ENUM source mis à jour.');
    }

    if (hasSourceEditionDate) {
      console.log('La colonne source_edition_date existe déjà — pas de modification nécessaire.');
    } else {
      console.log('Ajout de la colonne source_edition_date...');
      await conn.query(
        `ALTER TABLE planning_jour
         ADD COLUMN source_edition_date DATETIME DEFAULT NULL
         COMMENT 'Date+heure d edition du bulletin/deroule source, pour arbitrer les imports concurrents'`
      );
      console.log('✅ Colonne source_edition_date ajoutée.');
    }

    console.log('\nMigration terminée avec succès.');
  } catch (err) {
    console.error('❌ Erreur migration :', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
