// patch_bulletin_15_debug_log.js
// Ajoute un console.log temporaire du texte extrait + des entrées parsées juste avant
// l'envoi au serveur, pour diagnostiquer le bug d'horaires (heure_fin stockée comme heure_debut).
// À RETIRER une fois le bug résolu (voir patch de nettoyage ultérieur).
// Exécution : node patch_bulletin_15_debug_log.js (depuis la racine du projet)

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

if (content.includes('console.log("DEBUG_BULLETIN_ENTRIES"')) {
  console.log('⚠️  Le log de debug est déjà présent — aucune modification appliquée.');
  process.exit(0);
}

const anchor = `        const resp = await api.planning.importBulletin(agentCp, entries, "bulletin");`;

const replacement = `        console.log("DEBUG_BULLETIN_TEXTE_EXTRAIT", text);
        console.log("DEBUG_BULLETIN_ENTRIES", entries);
        const resp = await api.planning.importBulletin(agentCp, entries, "bulletin");`;

content = mustReplaceOnce(content, anchor, replacement, 'App.jsx ajout log debug');
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : log de diagnostic ajouté (à retirer une fois le bug corrigé).');
