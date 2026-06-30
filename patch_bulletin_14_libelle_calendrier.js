// patch_bulletin_14_libelle_calendrier.js
// Dans la case du calendrier (vue Mois de Mon Planning), le poste s'affichait déjà
// sous "Matinée"/"Soirée"/"Nuit", mais avec le code brut complet (ex. "PILNE-").
// On le remplace par le libellé court lisible (ex. "LNE") via getPosteLabelFromCode,
// avec repli sur le code brut si jamais le libellé n'est pas trouvé (aucune régression).
// S'applique à toute saisie ayant un poste, manuelle comme importée.
// Exécution : node patch_bulletin_14_libelle_calendrier.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

function mustReplaceOnce(content, search, replace, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[${label}] Ancre trouvée ${count} fois (attendu 1). Abandon sans modification.`);
  }
  return content.replace(search, replace);
}

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('function getPosteLabelFromCode')) {
  throw new Error("getPosteLabelFromCode introuvable — lance d'abord patch_bulletin_13_diagnostic_et_libelles.js");
}

const oldBlock = "            const posteNuitLabel = en?.jsCode2 || null;\r\n            const posteLabel = en?.jsCode && [\"M\",\"AM\",\"N\",\"J\",\"RP\",\"RU\",\"RQ\",\"CA\",\"CP\",\"MA\",\"VT\",\"ABS\",\"FOR\",\"DISPO\",\"NU\",\"TC\",\"TY\",\"RN\",\"JF\"].includes(en.jsCode)===false ? en.jsCode : null;";

// L'ancre ci-dessus tente une variante ; on vérifie aussi la version la plus probable (avec !...includes(...))
const oldBlockAlt = "            const posteNuitLabel = en?.jsCode2 || null;\r\n            const posteLabel = en?.jsCode && !\[\"M\",\"AM\",\"N\",\"J\",\"RP\",\"RU\",\"RQ\",\"CA\",\"CP\",\"MA\",\"VT\",\"ABS\",\"FOR\",\"DISPO\",\"NU\",\"TC\",\"TY\",\"RN\",\"JF\"\].includes(en.jsCode) ? en.jsCode : null;";

let used = null;
if (content.includes(oldBlockAlt)) used = oldBlockAlt;
else if (content.includes(oldBlock)) used = oldBlock;

if (!used) {
  throw new Error("Bloc posteLabel/posteNuitLabel introuvable tel quel — la version exacte du code a peut-être changé.");
}

const codesGeneriques = '["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","DISPO","NU","TC","TY","RN","JF"]';
const newBlock = "            const posteNuitLabel = en?.jsCode2 ? (getPosteLabelFromCode(en.jsCode2) || en.jsCode2) : null;\r\n            const posteLabel = en?.jsCode && !" + codesGeneriques + ".includes(en.jsCode) ? (getPosteLabelFromCode(en.jsCode) || en.jsCode) : null;";

content = mustReplaceOnce(content, used, newBlock, 'App.jsx libellé poste dans case calendrier');
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : le calendrier affiche maintenant le libellé court du poste (ex. "LNE") au lieu du code brut, pour toute saisie (manuelle ou importée).');
