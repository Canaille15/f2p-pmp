// patch_bulletin_25_fix_garde_fou.js
// Corrige le garde-fou "if (!e.code_equipe)" dans bulletinImportController.js :
// pour les entrées du déroulé prévisionnel, le code_equipe est dans e.periodes[0]
// et non dans e.code_equipe directement — le check doit le prendre en compte.
// Exécution : node patch_bulletin_25_fix_garde_fou.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

function mustReplaceOnce(content, search, replace, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[${label}] Ancre trouvée ${count} fois (attendu 1). Abandon sans modification.`);
  }
  return content.replace(search, replace);
}

const ctrlPath = path.join(__dirname, 'api', 'api', 'src', 'controllers', 'bulletinImportController.js');
let ctrl = fs.readFileSync(ctrlPath, 'utf8');

if (ctrl.includes('hasPeriodes')) {
  console.log('⚠️  Garde-fou déjà corrigé — aucune modification appliquée.');
  process.exit(0);
}

const oldCheck =
`      if (!e.code_equipe) {
        ignores.push({ date: e.date_jour, motif: 'code_equipe_manquant' });
        continue;
      }`;

const newCheck =
`      // Accepter les entrées multi-périodes (déroulé prévisionnel) ou entrées directes (bulletin)
      const hasPeriodes = e.periodes && e.periodes.length > 0 && e.periodes[0].code_equipe;
      if (!e.code_equipe && !hasPeriodes) {
        ignores.push({ date: e.date_jour, motif: 'code_equipe_manquant' });
        continue;
      }`;

ctrl = mustReplaceOnce(ctrl, oldCheck, newCheck, 'bulletinImportController.js garde-fou periodes');
fs.writeFileSync(ctrlPath, ctrl, 'utf8');
console.log('✅ bulletinImportController.js corrigé : garde-fou compatible multi-périodes (déroulé).');
