// patch_note_bandeau_voyant.js
// DayEditPopup.jsx : bandeau Note beaucoup plus contraste/voyant - fond
// sombre uni quand actif (comme Descente de nuit) au lieu d'une simple
// teinte pale, bordure et pastille dans la couleur personnalisee.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_note_bandeau_voyant.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, "src/components/DayEditPopup.jsx");
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - ' + "le fichier differe de la version attendue (verifie que le chantier Note/RPP est bien applique).");
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "            background: notePerso ? noteColor+\"15\" : \"#f8fafc\",\n            border: notePerso ? `2px solid ${noteColor}` : \"1.5px dashed #cbd5e1\",\n", "            background: notePerso ? \"#1a1207\" : \"#f8fafc\",\n            border: `2px solid ${notePerso ? noteColor : \"#cbd5e1\"}`,\n            borderStyle: notePerso ? \"solid\" : \"dashed\",\n", 'hunk_0_L285');
count++;
content = mustReplaceOnce(content, "                border: `1.5px solid ${notePerso ? noteColor+\"66\" : \"#e2e8f0\"}`,\n", "                border: `1.5px solid ${notePerso ? noteColor : \"#e2e8f0\"}`,\n", 'hunk_1_L312');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);