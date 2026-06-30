// patch_bulletin_17_remove_debug_log.js
// Retire le console.log temporaire ajouté par patch_bulletin_15_debug_log.js
// (debug du bug d'horaires terminé et corrigé par patch_bulletin_16).
// Exécution : node patch_bulletin_17_remove_debug_log.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

function mustReplaceOnce(content, search, replace, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[${label}] Ancre trouvée ${count} fois (attendu 1). Abandon sans modification.`);
  }
  return content.replace(search, replace);
}

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const oldBlock = `        console.log("DEBUG_BULLETIN_TEXTE_EXTRAIT", text);
        console.log("DEBUG_BULLETIN_ENTRIES", entries);
        const resp = await api.planning.importBulletin(agentCp, entries, "bulletin");`;

if (!content.includes(oldBlock)) {
  console.log('⚠️  Le log de debug est déjà absent — aucune modification appliquée.');
  process.exit(0);
}

const newBlock = `        const resp = await api.planning.importBulletin(agentCp, entries, "bulletin");`;

content = mustReplaceOnce(content, oldBlock, newBlock, 'App.jsx retrait log debug');
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : log de diagnostic temporaire retiré.');
