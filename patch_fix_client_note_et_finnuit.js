// patch_fix_client_note_et_finnuit.js
// DEUX BUGS CRITIQUES corriges dans src/api/client.js :
// 1. saveEntry() n'attachait note_perso QUE sur la periode 'equipe' (si
//    entry.equipe etait rempli). Sur les 2 autres branches (finNuit seul,
//    ou repli total), note_perso n'etait jamais envoye au serveur -> la
//    note etait perdue des qu'aucune equipe n'etait selectionnee au
//    moment de la sauvegarde.
// 2. getSchedule() : le marqueur 'fin_nuit' est utilise pour deux cas tres
//    differents (a: periode 100% synthetique sans equipe reelle quand
//    SEULE la case 'descente de nuit' est cochee ; b: une VRAIE equipe
//    comme RP qui a EN PLUS la case 'descente de nuit' cochee). Le code
//    effacait equipe/jsCode dans les DEUX cas sans distinction, ce qui
//    faisait disparaitre RP (et tout le reste) des qu'on retirait 'nuit
//    ce soir' en gardant 'descente de nuit' coche. Corrige : la remise a
//    null ne s'applique plus qu'au cas (a), jamais a une vraie equipe.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_fix_client_note_et_finnuit.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, "src/api/client.js");
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - ' + "le fichier differe de la version attendue.");
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "      result[`${agentId}-${date}`] = {\n        // Si fin_nuit seule : equipe=null, finNuit=true\n        equipe:   isFinNuit && !p2 ? null : (p1.code_equipe || null),\n        equipe2:  p2 ? 'N' : null,\n        jsCode:   isFinNuit && !p2 ? null : (p1.code_poste || null),\n        jsCode2:  p2 ? (p2.code_poste || null) : null,\n        horaires: isFinNuit ? null : horaires,\n", "      // Le marqueur 'fin_nuit' sert dans deux cas diff\u00e9rents :\n      // (a) periode purement synth\u00e9tique cr\u00e9\u00e9e quand SEULE la case \"descente de\n      //     nuit\" est coch\u00e9e, sans aucune \u00e9quipe r\u00e9elle (code_equipe forc\u00e9 \u00e0 'N'\n      //     comme simple rep\u00e8re) \u2192 dans ce cas seulement, on doit l'ignorer.\n      // (b) une vraie \u00e9quipe (RP, M, CA...) avec EN PLUS la case \"descente de\n      //     nuit\" coch\u00e9e pour ce m\u00eame jour \u2192 il ne faut surtout pas effacer\n      //     cette \u00e9quipe r\u00e9elle.\n      const isFinNuitPlaceholder = isFinNuit && p1.code_equipe === 'N' && !p2;\n      result[`${agentId}-${date}`] = {\n        // Si fin_nuit seule (placeholder) : equipe=null, finNuit=true\n        equipe:   isFinNuitPlaceholder ? null : (p1.code_equipe || null),\n        equipe2:  p2 ? 'N' : null,\n        jsCode:   isFinNuitPlaceholder ? null : (p1.code_poste || null),\n        jsCode2:  p2 ? (p2.code_poste || null) : null,\n        horaires: isFinNuitPlaceholder ? null : horaires,\n", 'hunk_0_L212');
count++;
content = mustReplaceOnce(content, "      });\n    }\n    if (periodes.length === 0) periodes.push({ordre:1, code_equipe:'N', code_poste:null, heure_debut:null, heure_fin:null, prive:false, note:null});\n", "        note_perso: entry.notePerso || null,\n      });\n    }\n    if (periodes.length === 0) periodes.push({ordre:1, code_equipe:'N', code_poste:null, heure_debut:null, heure_fin:null, prive:false, note:null, note_perso: entry.notePerso || null});\n", 'hunk_1_L290');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);