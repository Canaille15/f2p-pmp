// patch_rpp_import_pdf.js
// RPP est un code recent, cree apres l'ecriture des parseurs d'import PDF
// (bulletin de commande et deroule previsionnel). Il n'etait reconnu par
// AUCUNE des regex/listes de codes valides -> un RPP present sur un
// bulletin scanne etait ignore silencieusement (ni detecte, ni confondu
// avec RP). Ce patch ajoute RPP partout ou RP est reconnu dans les
// parseurs : deriveCodeEquipeBulletin, CODE_RE (extraction), estCodeSpecial,
// CODE_VALID + SPECIAL (deroule previsionnel), NUIT_LINE_RE (nuits
// orphelines), et CODES_PRIVES (coherence generale).
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_rpp_import_pdf.js

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
content = mustReplaceOnce(content, "function deriveCodeEquipeBulletin(code, heureDebut) {\n  if (/^RP$/.test(code)) return \"RP\";\n", "function deriveCodeEquipeBulletin(code, heureDebut) {\n  if (/^RPP$/.test(code)) return \"RPP\";\n  if (/^RP$/.test(code)) return \"RP\";\n", 'hunk_0_L332');
count++;
content = mustReplaceOnce(content, "  const CODE_RE = /\\b(?:RP|RU|RQ|CA|DISPO|F[0-9V]|F-\\s?[A-Z]{2,5}|C)\\b|\\b(?:PI|PA)[A-Z0-9]{2,6}[-OXJ]/g;\n", "  const CODE_RE = /\\b(?:RPP|RP|RU|RQ|CA|DISPO|F[0-9V]|F-\\s?[A-Z]{2,5}|C)\\b|\\b(?:PI|PA)[A-Z0-9]{2,6}[-OXJ]/g;\n", 'hunk_1_L383');
count++;
content = mustReplaceOnce(content, "    const estCodeSpecial = /^(RP|RU|RQ|C|CA|DISPO)$/.test(code) || /^F[0-9V]$/.test(code) || /^F-[A-Z]{2,5}$/.test(code);\n", "    const estCodeSpecial = /^(RPP|RP|RU|RQ|C|CA|DISPO)$/.test(code) || /^F[0-9V]$/.test(code) || /^F-[A-Z]{2,5}$/.test(code);\n", 'hunk_2_L466');
count++;
content = mustReplaceOnce(content, "  const CODE_VALID = /^(RP|RU|RQ|CA|C|DISPO|F[0-9V]|F-[A-Z]{2,}|PI[A-Z0-9-]{2,}|PA[A-Z0-9-]{2,})$/;\n  const SPECIAL = new Set([\"RP\",\"RU\",\"RQ\",\"CA\",\"C\",\"DISPO\"]);\n", "  const CODE_VALID = /^(RPP|RP|RU|RQ|CA|C|DISPO|F[0-9V]|F-[A-Z]{2,}|PI[A-Z0-9-]{2,}|PA[A-Z0-9-]{2,})$/;\n  const SPECIAL = new Set([\"RPP\",\"RP\",\"RU\",\"RQ\",\"CA\",\"C\",\"DISPO\"]);\n", 'hunk_3_L592');
count++;
content = mustReplaceOnce(content, "  const NUIT_LINE_RE = /^[ \\t]*(RP|RU)\\s+(PICC[A-Z0-9-]+|PICO[A-Z0-9-]+)/;\n", "  const NUIT_LINE_RE = /^[ \\t]*(RPP|RP|RU)\\s+(PICC[A-Z0-9-]+|PICO[A-Z0-9-]+)/;\n", 'hunk_4_L659');
count++;
content = mustReplaceOnce(content, "const CODES_PRIVES = new Set([\"RP\",\"RU\",\"RQ\",\"RN\",\"TC\",\"TY\",\"CA\",\"CP\",\"MA\",\"ABS\",\"VT\",\"VM\",\"NU\",...Object.keys(CODES_FETES),\"JF\"]);\r\n", "const CODES_PRIVES = new Set([\"RP\",\"RPP\",\"RU\",\"RQ\",\"RN\",\"TC\",\"TY\",\"CA\",\"CP\",\"MA\",\"ABS\",\"VT\",\"VM\",\"NU\",...Object.keys(CODES_FETES),\"JF\"]);\r\n", 'hunk_5_L4159');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);