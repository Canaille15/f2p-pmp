// patch_fix_repli_total_faux_nuit.js
// BUG SERIEUX corrige : quand il ne reste plus QUE la note (repli total,
// ex: on retire une 'nuit seule' en gardant la note), le code utilisait
// code_equipe='N' comme simple valeur technique de remplissage - mais
// rien ne le distinguait d'une VRAIE nuit. Au rechargement, ce 'N' de
// remplissage etait interprete comme une vraie nuit active : impossible
// de vraiment la supprimer, et la note ne s'affichait plus (la case
// n'etait plus consideree comme vide). Corrige : ce cas porte desormais
// un marqueur distinct ('note_seule') traite comme un simple repere,
// jamais comme une nuit reelle.
// Prerequis : client.js doit deja avoir recu patch_fix_client_note_et_finnuit.js
// et patch_fix_nuit_seule_note.js.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_fix_repli_total_faux_nuit.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'api', 'client.js');
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - ' + 'verifie que les patches precedents sont bien appliques dans l ordre.');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "      // Le marqueur 'fin_nuit' sert dans deux cas diff\u00e9rents :\n      // (a) periode purement synth\u00e9tique cr\u00e9\u00e9e quand SEULE la case \"descente de\n      //     nuit\" est coch\u00e9e, sans aucune \u00e9quipe r\u00e9elle (code_equipe forc\u00e9 \u00e0 'N'\n      //     comme simple rep\u00e8re) \u2192 dans ce cas seulement, on doit l'ignorer.\n      // (b) une vraie \u00e9quipe (RP, M, CA...) avec EN PLUS la case \"descente de\n      //     nuit\" coch\u00e9e pour ce m\u00eame jour \u2192 il ne faut surtout pas effacer\n      //     cette \u00e9quipe r\u00e9elle.\n      const isFinNuitPlaceholder = isFinNuit && p1.code_equipe === 'N' && !p2;\n      result[`${agentId}-${date}`] = {\n        // Si fin_nuit seule (placeholder) : equipe=null, finNuit=true\n        equipe:   isFinNuitPlaceholder ? null : (p1.code_equipe || null),\n        equipe2:  p2 ? 'N' : null,\n        jsCode:   isFinNuitPlaceholder ? null : (p1.code_poste || null),\n        jsCode2:  p2 ? (p2.code_poste || null) : null,\n        horaires: isFinNuitPlaceholder ? null : horaires,\n", "      // Deux marqueurs synth\u00e9tiques diff\u00e9rents peuvent forcer code_equipe='N'\n      // sans que ce soit une vraie nuit :\n      // (a) 'fin_nuit' : SEULE la case \"descente de nuit\" est coch\u00e9e.\n      // (b) 'note_seule' : il ne reste QUE la note, plus aucun contenu du tout\n      //     (repli total dans saveEntry c\u00f4t\u00e9 sauvegarde).\n      // Dans les deux cas, ce 'N' est un simple rep\u00e8re technique, pas une\n      // vraie nuit \u2192 il faut l'ignorer. Mais si une VRAIE \u00e9quipe (RP, M...)\n      // a en plus la case \"descente de nuit\" coch\u00e9e, il ne faut surtout pas\n      // effacer cette \u00e9quipe r\u00e9elle (d'o\u00f9 la condition code_equipe==='N').\n      const isPlaceholder = (p1.note === 'fin_nuit' || p1.note === 'note_seule') && p1.code_equipe === 'N' && !p2;\n      result[`${agentId}-${date}`] = {\n        equipe:   isPlaceholder ? null : (p1.code_equipe || null),\n        equipe2:  p2 ? 'N' : null,\n        jsCode:   isPlaceholder ? null : (p1.code_poste || null),\n        jsCode2:  p2 ? (p2.code_poste || null) : null,\n        horaires: isPlaceholder ? null : horaires,\n", 'hunk_0_L212');
count++;
content = mustReplaceOnce(content, "    if (periodes.length === 0) periodes.push({ordre:1, code_equipe:'N', code_poste:null, heure_debut:null, heure_fin:null, prive:false, note:null, note_perso: entry.notePerso || null});\n", "    if (periodes.length === 0) periodes.push({ordre:1, code_equipe:'N', code_poste:null, heure_debut:null, heure_fin:null, prive:false, note:'note_seule', note_perso: entry.notePerso || null});\n", 'hunk_1_L305');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);