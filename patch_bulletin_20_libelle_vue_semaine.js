// patch_bulletin_20_libelle_vue_semaine.js
// La vue Semaine n'affichait jamais le poste tenu (juste "Matinée"/"Soirée"), contrairement
// à la vue Mois. On ajoute le libellé court du poste (ex. "LNE", "CCL") sous le badge
// matin/soir/journée, et on corrige aussi la case Nuit pour utiliser le libellé court au
// lieu du code brut (jsCode complet). S'applique à toute saisie, manuelle ou importée.
// Exécution : node patch_bulletin_20_libelle_vue_semaine.js (depuis la racine du projet)

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

// ── 1. Zone "Matinée/Soirée/Journée" : ajout du libellé poste sous le badge ──
const oldZone2 = "              {/* ZONE 2 — Utilisation journée (milieu) */}\r\n              {code&&showData&&code!==\"N\"&&<div style={{\r\n                background:getColor(code),color:getTc(code),\r\n                borderRadius:8,padding:\"4px 8px\",\r\n                fontSize:10,fontWeight:700,textAlign:\"center\",\r\n              }}>\r\n                {CODES_FETES[code]?`🩷 ${code}`:(eq?.label||code)}\r\n              </div>}";

if (!content.includes(oldZone2)) {
  throw new Error("Zone 2 (Matinée/Soirée) introuvable telle quelle dans la vue Semaine — vérifie qu'aucune modification manuelle n'a eu lieu.");
}

const CODES_GENERIQUES = '["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","DISPO","NU","TC","TY","RN","JF"]';

const newZone2 = "              {/* ZONE 2 — Utilisation journée (milieu) */}\r\n              {code&&showData&&code!==\"N\"&&<div style={{\r\n                background:getColor(code),color:getTc(code),\r\n                borderRadius:8,padding:\"4px 8px\",\r\n                fontSize:10,fontWeight:700,textAlign:\"center\",\r\n                display:\"flex\",flexDirection:\"column\",gap:2,\r\n              }}>\r\n                <span>{CODES_FETES[code]?`🩷 ${code}`:(eq?.label||code)}</span>\r\n                {en?.jsCode&&!" + CODES_GENERIQUES + ".includes(en.jsCode)&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{getPosteLabelFromCode(en.jsCode)||en.jsCode}</span>}\r\n              </div>}";

content = mustReplaceOnce(content, oldZone2, newZone2, 'App.jsx semaine zone2 libelle poste');

// ── 2. Zone "Nuit" : libellé court au lieu du code brut ──
const oldZone3Line = "                {(code===\"N\"?en?.jsCode:en?.jsCode2)&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{code===\"N\"?en?.jsCode:en?.jsCode2}</span>}";

if (content.includes(oldZone3Line)) {
  const newZone3Line = "                {(code===\"N\"?en?.jsCode:en?.jsCode2)&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{getPosteLabelFromCode(code===\"N\"?en?.jsCode:en?.jsCode2)||(code===\"N\"?en?.jsCode:en?.jsCode2)}</span>}";
  content = mustReplaceOnce(content, oldZone3Line, newZone3Line, 'App.jsx semaine zone3 libelle poste nuit');
} else {
  console.log('⚠️  Ligne Zone 3 (Nuit) introuvable telle quelle — étape 2 ignorée (vérifie manuellement si besoin).');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : la vue Semaine affiche maintenant le libellé du poste (Matinée/Soirée/Nuit), comme la vue Mois.');
