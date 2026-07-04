// patch_fix_note_perso_privacy_v2.js
// Corrige un bug introduit par patch_planning_controller_note_perso_privacy.js :
// le CASE WHEN ? THEN pp.note_perso ELSE NULL END avec un parametre lie
// pouvait faire renvoyer NULL en permanence, MEME pour le titulaire du
// planning (donc la Note disparaissait partout, pour tout le monde).
// Nouvelle methode : la requete SQL renvoie note_perso normalement, et
// le filtrage de confidentialite (jamais visible par quelqu'un d'autre
// que le titulaire, meme un admin, meme sur un jour public) est fait
// en JavaScript juste apres, ce qui est fiable quel que soit le driver/
// version MariaDB.
// Fichier : api/api/src/controllers/planningController.js
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_fix_note_perso_privacy_v2.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'api', 'api', 'src', 'controllers', 'planningController.js');
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - verifie que patch_planning_controller_note_perso_privacy.js a bien ete applique avant celui-ci.');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "              pp.heure_debut, pp.heure_fin, pp.prive, pp.note,\n              CASE WHEN ? THEN pp.note_perso ELSE NULL END AS note_perso\n", "              pp.heure_debut, pp.heure_fin, pp.prive, pp.note, pp.note_perso\n", 'hunk_0_L13');
count++;
content = mustReplaceOnce(content, "      [isSelf?1:0, cp, from||null, from||null, to||null, to||null, isSelf?1:0, isAdmin?1:0]);\n", "      [cp, from||null, from||null, to||null, to||null, isSelf?1:0, isAdmin?1:0]);\n    // note_perso est une donnee strictement personnelle : jamais renvoyee\n    // a quelqu'un d'autre que le titulaire du planning, meme un admin,\n    // meme sur une ligne publique (M/AM/N/J...). Filtrage fait ici en JS\n    // plutot qu'en SQL pour eviter tout comportement incertain d'un\n    // parametre lie a l'interieur d'un CASE WHEN selon le driver/version.\n    if (!isSelf) {\n      for (const row of rows) row.note_perso = null;\n    }\n", 'hunk_1_L22');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);
console.log('Redemarre le backend (node server.js) pour appliquer le changement.');