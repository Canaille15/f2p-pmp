// patch_bulletin_07_label.js
// Met à jour le libellé du bouton d'import : "Importer un bulletin" -> "Importer un bulletin de commande / roulement"
// Exécution : node patch_bulletin_07_label.js (depuis la racine du projet)

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

const oldLabel = '{busy ? "⏳ Analyse…" : "📥 Importer un bulletin"}';
const newLabel = '{busy ? "⏳ Analyse…" : "📥 Importer un bulletin de commande / roulement"}';

if (content.includes(newLabel)) {
  console.log('⚠️  Le libellé est déjà à jour — aucune modification appliquée.');
} else {
  content = mustReplaceOnce(content, oldLabel, newLabel, 'App.jsx libellé bouton bulletin');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Libellé du bouton mis à jour : "Importer un bulletin de commande / roulement".');
}
