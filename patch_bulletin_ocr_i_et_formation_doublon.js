// patch_bulletin_ocr_i_et_formation_doublon.js
// 1. Tolerance a la confusion OCR I/i pour les postes PI/PA (ex: 'PiLNO-'
//    au lieu de 'PILNO-', qui empechait le jour d'etre detecte du tout).
// 2. Formation en doublon sur un poste : le marqueur '/' final (ex:
//    'PIADJX/') est parfois corrompu en 'J' a l'extraction ('PIADJXJ'),
//    faisant classer a tort le jour comme 'Journee' au lieu de garder
//    l'equipe du poste de base (X=Nuit, -=Matin, O=Soir). Corrige : seul
//    un J final PRECEDE d'un -/O/X declenche cette regle (pas un simple
//    code se terminant normalement par O/X/- comme 'PILNO-').
// Valide sur bulletin reel : 30/30 jours desormais correctement detectes
// (le seul 'echec' restant, jour absent du document source, est normal).
// Prerequis : App.jsx doit deja avoir recu patch_bulletin_rpp_et_shift_date.js.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_bulletin_ocr_i_et_formation_doublon.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - ' + 'verifie que patch_bulletin_rpp_et_shift_date.js est bien applique.');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "  if (/^NU$/.test(code)) return \"NU\";\n  if (code.endsWith(\"J\")) return \"J\";\n", "  if (/^NU$/.test(code)) return \"NU\";\n  // Formation en doublon sur un poste : le marqueur \"/\" en fin de code (ex: \"PIADJX/\")\n  // est parfois corrompu en \"J\" \u00e0 l'extraction (\"PIADJXJ\") \u2014 dans ce cas pr\u00e9cis (un\n  // second suffixe -/O/X/J directement apr\u00e8s un premier -/O/X), c'est le PREMIER\n  // suffixe qui donne la v\u00e9ritable \u00e9quipe (ici X = Nuit), pas le second.\n  if (code.length >= 2 && code[code.length - 1] === \"J\" && /[-OX]/.test(code[code.length - 2])) {\n    const base = code[code.length - 2];\n    if (base === \"-\") return \"M\";\n    if (base === \"O\") return \"AM\";\n    return \"N\";\n  }\n  if (code.endsWith(\"J\")) return \"J\";\n", 'hunk_0_L340');
count++;
content = mustReplaceOnce(content, "  const CODE_RE = /\\b(?:RPP|RP|RU|RQ|CA|NU|DISPO|F[0-9V]|F-\\s?[A-Z]{2,5}|C)\\b|\\bRFT\\s?SAM\\b|\\b(?:PI|PA)[A-Z0-9]{2,6}[-OXJ]/g;\n", "  const CODE_RE = /\\b(?:RPP|RP|RU|RQ|CA|NU|DISPO|F[0-9V]|F-\\s?[A-Z]{2,5}|C)\\b|\\bRFT\\s?SAM\\b|\\b(?:P[Ii]|P[Aa])[A-Z0-9]{2,6}[-OXJ]/g;\n", 'hunk_1_L384');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);