// patch_fix_note_seule_supprimee.js
// BUG CRITIQUE trouve : quand un jour n'a NI equipe, NI equipe2, NI
// finNuit, le code considerait la case 'entierement vide' et la
// supprimait automatiquement (local + backend via deleteEntry) - SANS
// tenir compte de la Note perso. Resultat : poser une note sur un jour
// autrement vide (le cas d'usage principal du pense-bete) l'effacait
// immediatement au lieu de la sauvegarder. Corrige : une Note compte
// desormais comme du contenu, empeche la suppression de la case.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_fix_note_seule_supprimee.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
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
content = mustReplaceOnce(content, "        // Si tout vide (pas d'equipe, pas de nuit, pas de finNuit) : supprimer la case\r\n        const hasContent = !!(fullEntry.equipe || fullEntry.equipe2 || fullEntry.finNuit);\r\n", "        // Si tout vide (pas d'equipe, pas de nuit, pas de finNuit, pas de note) : supprimer la case\r\n        const hasContent = !!(fullEntry.equipe || fullEntry.equipe2 || fullEntry.finNuit || fullEntry.notePerso);\r\n", 'note_seule_hascontent_fix');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacement applique sur ' + filePath);