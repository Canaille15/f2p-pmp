const fs = require('fs');
const path = require('path');

const filePath = path.join('C:\\Users\\olive\\Desktop\\f2p-pmp\\src\\api\\client.js');

let content = fs.readFileSync(filePath, 'utf8');

// Ancre stable : la dernière méthode du module agents (setPartagePrevisionnel)
const anchor = "setPartagePrevisionnel: (cp, actif) =>\r\n    apiFetch(`/agents/${cp}`, { method: 'PATCH', body: JSON.stringify({ partage_previsionnel: actif }) }),";

if (!content.includes(anchor)) {
  // Essayer LF
  const anchorLF = anchor.replace(/\r\n/g, '\n');
  if (!content.includes(anchorLF)) {
    console.error('ANCRE INTROUVABLE. Contenu autour de setPartagePrevisionnel :');
    const idx = content.indexOf('setPartagePrevisionnel');
    console.error(JSON.stringify(content.slice(idx, idx + 200)));
    process.exit(1);
  }
  const replacement = anchorLF + '\n\n  /**\n   * Réinitialiser le PIN d\'un agent (admin uniquement)\n   * Utilise la route PUT /profil/:cp/pin existante\n   * @param {string} cp     — CP de l\'agent cible\n   * @param {string} newPin — nouveau PIN en clair (4 chiffres)\n   */\n  resetPin: (cp, newPin) =>\n    apiFetch(`/profil/${cp}/pin`, { method: \'PUT\', body: JSON.stringify({ pin: newPin }) }),';
  content = content.replace(anchorLF, replacement);
} else {
  const replacement = anchor + '\r\n\r\n  /**\r\n   * R\u00e9initialiser le PIN d\'un agent (admin uniquement)\r\n   * Utilise la route PUT /profil/:cp/pin existante\r\n   * @param {string} cp     \u2014 CP de l\'agent cible\r\n   * @param {string} newPin \u2014 nouveau PIN en clair (4 chiffres)\r\n   */\r\n  resetPin: (cp, newPin) =>\r\n    apiFetch(`/profil/${cp}/pin`, { method: \'PUT\', body: JSON.stringify({ pin: newPin }) }),';
  content = content.replace(anchor, replacement);
}

// Vérifier que l'ajout est bien là
if (!content.includes('resetPin')) {
  console.error('ECHEC : resetPin non inséré');
  process.exit(1);
}

fs.writeFileSync(filePath, content);
console.log('OK — agents.resetPin ajouté dans client.js');
