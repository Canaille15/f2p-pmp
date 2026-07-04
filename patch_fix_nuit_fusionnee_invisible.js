// patch_fix_nuit_fusionnee_invisible.js
// DEUX bugs corriges dans bulletinImportController.js, decouverts en testant
// le cas NU + nuit du 20/04 en conditions reelles :
// 1. La periode 'nuit' fusionnee (patch precedent) n'etait jamais marquee
//    note='debut_nuit' -> le frontend (getSchedule) ne reconnait une 2e
//    periode comme etant la nuit QUE grace a ce marqueur precis. Sans lui,
//    elle etait silencieusement ignoree a l'affichage (bien enregistree
//    en base, mais invisible a l'ecran).
// 2. BUG PLUS ANCIEN (preexistant, pas invente aujourd'hui) : la requete
//    d'insertion de planning_periode forcait TOUJOURS note=NULL, quelle
//    que soit la valeur calculee - ce qui cassait aussi potentiellement
//    les imports de deroule previsionnel (meme mecanisme de marqueur).
// Prerequis : bulletinImportController.js doit deja avoir recu
// patch_bulletin_import_fusion_meme_date.js.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_fix_nuit_fusionnee_invisible.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'api', 'api', 'src', 'controllers', 'bulletinImportController.js');
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - ' + 'verifie que patch_bulletin_import_fusion_meme_date.js est bien applique.');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "    periodes: e.periodes.map((p, i) => ({ ...p, ordre: i + 1 })),\n", "    // Le frontend (client.js getSchedule) n'affiche la 2e p\u00e9riode d'un jour QUE\n    // si elle porte le marqueur note='debut_nuit' (c'est ainsi qu'il reconna\u00eet\n    // \"ceci est la nuit qui accompagne ce jour\"). Sans ce marqueur, une 2e\n    // p\u00e9riode nuit fusionn\u00e9e ici serait silencieusement ignor\u00e9e \u00e0 l'affichage,\n    // m\u00eame si elle est bien enregistr\u00e9e en base.\n    periodes: e.periodes.map((p, i) => ({\n      ...p,\n      ordre: i + 1,\n      note: (i > 0 && p.code_equipe === 'N') ? 'debut_nuit' : (p.note || null),\n    })),\n", 'hunk_0_L61');
count++;
content = mustReplaceOnce(content, "          [jour.id, p.ordre || 1, p.code_equipe, p.code_poste || null, p.heure_debut || null, p.heure_fin || null, prive, null, null]\n", "          [jour.id, p.ordre || 1, p.code_equipe, p.code_poste || null, p.heure_debut || null, p.heure_fin || null, prive, p.note || null, null]\n", 'hunk_1_L115');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);
console.log('Redemarre le backend (node server.js) pour appliquer le changement.');