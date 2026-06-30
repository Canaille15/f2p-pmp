// patch_bulletin_12_backend_safety.js
// Garde-fou : si un jour extrait n'a pas pu être rattaché à un code_equipe valide
// (cas imprévu de parsing), on l'ignore proprement (ajouté à la liste "ignores")
// au lieu de faire planter toute la transaction d'import avec une erreur SQL.
// Exécution : node patch_bulletin_12_backend_safety.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

function mustReplaceOnce(content, search, replace, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[${label}] Ancre trouvée ${count} fois (attendu 1). Abandon sans modification.`);
  }
  return content.replace(search, replace);
}

const filePath = path.join(__dirname, 'api', 'api', 'src', 'controllers', 'bulletinImportController.js');
let content = fs.readFileSync(filePath, 'utf8');

const oldBlock = `      await conn.query(
        \`INSERT INTO planning_jour (cp_agent, date_jour, source, source_edition_date)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE source=VALUES(source), source_edition_date=VALUES(source_edition_date), modifie_le=NOW()\`,
        [cp, e.date_jour, sourceDb, newEdition]
      );`;

if (!content.includes(oldBlock)) {
  throw new Error("Bloc attendu introuvable dans bulletinImportController.js — vérifie si une modification manuelle a eu lieu.");
}

const newBlock = `      if (!e.code_equipe) {
        ignores.push({ date: e.date_jour, motif: 'code_equipe_manquant' });
        continue;
      }

      await conn.query(
        \`INSERT INTO planning_jour (cp_agent, date_jour, source, source_edition_date)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE source=VALUES(source), source_edition_date=VALUES(source_edition_date), modifie_le=NOW()\`,
        [cp, e.date_jour, sourceDb, newEdition]
      );`;

content = mustReplaceOnce(content, oldBlock, newBlock, 'bulletinImportController.js garde-fou code_equipe');
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ bulletinImportController.js mis à jour : les jours sans code_equipe valide sont maintenant ignorés proprement (au lieu de faire planter tout l\u2019import).');
