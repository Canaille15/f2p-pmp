// patch_bulletin_03_client.js
// Ajoute api.planning.importBulletin(agentId, entries, sourceType) dans src/api/client.js
// Exécution : node patch_bulletin_03_client.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

function mustReplaceOnce(content, search, replace, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[${label}] Ancre trouvée ${count} fois (attendu 1). Abandon sans modification.`);
  }
  return content.replace(search, replace);
}

const filePath = path.join(__dirname, 'src', 'api', 'client.js');
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('importBulletin:')) {
  console.log('⚠️  importBulletin existe déjà dans client.js — aucune modification appliquée.');
} else {
  const anchor = "  deleteEntry: (agentId, date) =>\r\n    apiFetch(`/planning/${agentId}/${date}`, { method: 'DELETE' }),";

  const replacement = `  deleteEntry: (agentId, date) =>
    apiFetch(\`/planning/\${agentId}/\${date}\`, { method: 'DELETE' }),
  /**
   * Importer un lot de jours extraits d'un bulletin de commande ou d'un déroulé prévisionnel.
   * @param {string} agentId - CP de l'agent (toujours l'agent connecté lui-même)
   * @param {Array}  entries - [{date_jour, code_equipe, code_poste, heure_debut, heure_fin, source_edition_date}]
   * @param {string} sourceType - 'bulletin' | 'previsionnel'
   * @returns {Promise<{message, nb_appliques, appliques, ignores}>}
   */
  importBulletin: (agentId, entries, sourceType) =>
    apiFetch(\`/planning/\${agentId}/import-bulletin\`, {
      method: 'POST',
      body: JSON.stringify({ entries, source_type: sourceType || 'bulletin' }),
    }),`;

  content = mustReplaceOnce(content, anchor, replacement, 'client.js importBulletin');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ client.js mis à jour : api.planning.importBulletin ajouté.');
}
