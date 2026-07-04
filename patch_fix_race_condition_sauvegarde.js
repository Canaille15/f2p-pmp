// patch_fix_race_condition_sauvegarde.js
// BUG CRITIQUE corrige : le rechargement automatique de synchronisation
// (recuperation du planning depuis Railway juste apres une sauvegarde)
// partait EN PARALLELE de la sauvegarde elle-meme, sans l'attendre. Si
// la sauvegarde (PUT) mettait plus de 500ms a aboutir cote serveur, ce
// rechargement recuperait l'ANCIENNE version et ecrasait silencieusement
// l'affichage correct a l'ecran - obligeant a rafraichir la page (F5)
// pour voir enfin le bon resultat. Corrige : le rechargement de synchro
// n'est desormais declenche qu'APRES confirmation que la sauvegarde a
// bien abouti.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_fix_race_condition_sauvegarde.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - ' + 'le fichier differe de la version attendue.');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "        // Recharger depuis Railway pour synchroniser\r\n        setTimeout(()=>api.planning.getSchedule(agCp).then(entries=>{if(entries)setSchedule(prev=>({...prev,...entries}));}),500);\r\n        // Sauvegarder en base (sequentiel pour eviter deadlock)\r\n        try {\r\n          await api.planning.saveEntry(agCp, dk, fullEntry);\r\n       \r\n", "        // Sauvegarder en base, PUIS seulement recharger depuis Railway pour\r\n        // synchroniser (jamais avant confirmation, sinon on risque de\r\n        // recuperer l'ancienne version et d'ecraser silencieusement l'affichage\r\n        // correct si la sauvegarde met plus de 500ms a aboutir).\r\n        try {\r\n          await api.planning.saveEntry(agCp, dk, fullEntry);\r\n          api.planning.getSchedule(agCp).then(entries=>{if(entries)setSchedule(prev=>({...prev,...entries}));});\r\n", 'hunk_0_L5038');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);