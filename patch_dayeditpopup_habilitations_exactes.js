// Patch — DayEditPopup.jsx : remplace la comparaison approximative
// ("un code contient l'autre") par une vraie table de correspondance exacte
// entre les codes courts locaux à ce fichier (ex: "ASMP", "CCL") et les
// codes réellement enregistrés dans les habilitations (ex: "PAASMJ",
// "PICCL"). L'ancienne comparaison ne fonctionnait que par coïncidence pour
// certains postes (CCL apparaît dans PICCL) et jamais pour d'autres (ASMP
// n'a aucun rapport textuel avec PAASMJ) — d'où "ASMTE PAR" jamais proposé
// malgré l'habilitation bien enregistrée. Aucun renommage des codes
// existants : les données déjà enregistrées ne sont pas affectées.
//
// Usage : node patch_dayeditpopup_habilitations_exactes.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'components', 'DayEditPopup.jsx');
const NL = '\r\n';

function mustReplaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error(`[${label}] Ancre introuvable dans ${FILE}`);
  if (count > 1) throw new Error(`[${label}] Ancre trouvée ${count} fois (doit être unique) dans ${FILE}`);
  return content.replace(oldStr, newStr);
}

let content = fs.readFileSync(FILE).toString('utf-8');

const old1 = 'const HORAIRES_DEFAUT = { M:"06h10–14h17", AM:"14h05–22h17", N:"22h15–06h17", J:"08h00–17h45" };';
const new1 = [
  old1,
  '',
  '// Table de correspondance exacte : code court local (ce fichier) → code',
  '// réellement enregistré dans les habilitations (AgentHeader.jsx / backend).',
  '// PPRCI et PPAR sont volontairement absents : toujours proposés sans',
  '// condition d\'habilitation (poste générique de famille).',
  'const CODE_VERS_HAB = {',
  '  // PRCI',
  '  "CCL":"PICCL", "ADJ":"PIADJ", "LNE":"PILNE", "LNO":"PILNO", "VGD":"PIVGD", "LC":"PILCL",',
  '  "PA1J":"PIPA1J", "PA2J":"PIPA2J", "PA3J":"PIPA3J", "DPXJ":"PIDPXJ", "ASSJ":"PIASSJ",',
  '  "AFOPR":"AFOPRCI",',
  '  // PAR',
  '  "AC1":"PAAC1-", "AC2":"PAAC2-", "ACXX":"PAACXX", "PARJ":"PAPAUJ", "DPXP":"PADPXJ",',
  '  "ASMP":"PAASMJ",',
  '};',
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'table-correspondance');

const old2 = [
  '    return postes.filter(p =>',
  '      p.code === "PPRCI" || p.code === "PPAR" ||',
].join(NL) + '\n' + '      habCodes.some(h => h.includes(p.code) || p.code.includes(h.slice(0,4)))' + NL + '    );';

const new2 = [
  '    return postes.filter(p =>',
  '      p.code === "PPRCI" || p.code === "PPAR" ||',
].join(NL) + '\n' + '      habCodes.includes(CODE_VERS_HAB[p.code] || p.code)' + NL + '    );';

content = mustReplaceOnce(content, old2, new2, 'comparaison-exacte');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — DayEditPopup.jsx patché (correspondance exacte des habilitations, plus de comparaison approximative)');
