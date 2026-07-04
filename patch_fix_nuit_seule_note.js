// patch_fix_nuit_seule_note.js
// Bug trouve : quand une NUIT SEULE est saisie (pas de journee avant, avec
// ou sans nom de poste), la periode 'nuit ce soir' devient la SEULE
// periode du jour (periode n1), mais n'incluait jamais note_perso -> la
// note etait perdue specifiquement dans ce cas de figure. Corrige :
// cette periode porte desormais la note quand elle est la seule du jour.
// Prerequis : client.js doit deja avoir recu patch_fix_client_note_et_finnuit.js.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_fix_nuit_seule_note.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'api', 'client.js');
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - ' + 'verifie que patch_fix_client_note_et_finnuit.js est bien applique.');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "    if (entry.equipe2 === 'N') {\n      periodes.push({\n", "    if (entry.equipe2 === 'N') {\n      const estPeriodeUnique = periodes.length === 0; // cas \"nuit seule\" : pas de journ\u00e9e avant\n      periodes.push({\n", 'hunk_0_L277');
count++;
content = mustReplaceOnce(content, "        note: 'debut_nuit',\n      });\n", "        note: 'debut_nuit',\n        // Si nuit seule, cette periode fait office de periode N\u00b01 : elle doit\n        // porter la note (sinon la note n'a nulle part ou etre sauvegardee).\n        ...(estPeriodeUnique ? {note_perso: entry.notePerso || null} : {}),\n      });\n", 'hunk_1_L285');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);