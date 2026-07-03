// patch_planning_controller_note_perso_privacy.js
// Corrige une fuite de confidentialite : le champ note_perso (Note
// personnelle) etait renvoye par l'API pour TOUTE ligne de planning
// visible (y compris les jours publics M/AM/N/J vus par un admin ou
// un collegue via la Vue Equipe), meme si le frontend ne l'affichait
// pas a l'ecran. Desormais note_perso n'est JAMAIS renvoyee par le
// serveur sauf si l'agent consulte son propre planning (isSelf),
// quel que soit le statut admin ou public/prive de la ligne.
// Fichier : api/api/src/controllers/planningController.js
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_planning_controller_note_perso_privacy.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'api', 'api', 'src', 'controllers', 'planningController.js');
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - le fichier differe de la version attendue.');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "              pp.heure_debut, pp.heure_fin, pp.prive, pp.note, pp.note_perso\n", "              pp.heure_debut, pp.heure_fin, pp.prive, pp.note,\n              CASE WHEN ? THEN pp.note_perso ELSE NULL END AS note_perso\n", 'hunk_0_L13');
count++;
content = mustReplaceOnce(content, "      [cp, from||null, from||null, to||null, to||null, isSelf?1:0, isAdmin?1:0]);\n", "      [isSelf?1:0, cp, from||null, from||null, to||null, to||null, isSelf?1:0, isAdmin?1:0]);\n", 'hunk_1_L21');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);
console.log('Redemarre le backend (node server.js) pour appliquer le changement.');