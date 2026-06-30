const fs = require('fs');
const path = './src/api/client.js';
let content = fs.readFileSync(path, 'utf8');

const startMarker = 'export const echanges = {';
const startIdx = content.indexOf(startMarker);
if (startIdx === -1) {
  console.error('Marqueur de début introuvable. Aucune modification effectuée.');
  process.exit(1);
}

const endMarker = '\n};';
const endIdx = content.indexOf(endMarker, startIdx);
if (endIdx === -1) {
  console.error('Marqueur de fin introuvable. Aucune modification effectuée.');
  process.exit(1);
}
const endOfBlock = endIdx + endMarker.length;

const oldBlock = content.slice(startIdx, endOfBlock);
console.log('Ancien bloc détecté :\n' + oldBlock + '\n');

const newBlock = `export const echanges = {
  /** Toutes les demandes d'échange, triées par date la plus proche */
  getAll: () => apiFetch('/echanges'),

  /** Liste des agents intéressés par une demande */
  getInteresses: (id) => apiFetch(\`/echanges/\${id}/interesses\`),

  /** Créer une demande d'échange pour une journée */
  create: (data) =>
    apiFetch('/echanges', { method: 'POST', body: JSON.stringify(data) }),

  /** Modifier les critères d'une demande (seul le demandeur, tant qu'ouverte) */
  update: (id, data) =>
    apiFetch(\`/echanges/\${id}\`, { method: 'PUT', body: JSON.stringify(data) }),

  /** Se déclarer intéressé / retirer son intérêt (bascule) */
  toggleInteret: (id) =>
    apiFetch(\`/echanges/\${id}/interet\`, { method: 'POST' }),

  /** Clôturer la demande en précisant avec qui l'échange a eu lieu */
  cloturer: (id, cpEchangeAvec) =>
    apiFetch(\`/echanges/\${id}/cloturer\`, {
      method: 'POST',
      body: JSON.stringify({ cp_echange_avec: cpEchangeAvec }),
    }),

  /** Supprimer une demande (seul le demandeur, à tout moment) */
  delete: (id) =>
    apiFetch(\`/echanges/\${id}\`, { method: 'DELETE' }),
};`;

content = content.slice(0, startIdx) + newBlock + content.slice(endOfBlock);
fs.writeFileSync(path, content, 'utf8');
console.log('client.js mis à jour avec succès.');
