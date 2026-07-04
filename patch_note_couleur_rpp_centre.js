// patch_note_couleur_rpp_centre.js
// Corrections suite aux retours :
// 1. La Note perso s'affiche desormais avec son VRAI texte, en permanence,
//    dans les 3 vues (Mois, Semaine, Planning) - avant, sur un jour vide,
//    seule une icone etait visible et le texte n'apparaissait qu'au survol
//    (info-bulle navigateur), ce qui donnait l'impression que ca 'disparaissait'.
// 2. Bug corrige : la Vue Semaine affichait le mot fixe 'Note' au lieu du
//    vrai contenu ecrit par l'agent sur un jour vide.
// 3. La couleur de la Note est desormais personnalisable (nouveau groupe
//    'Note perso' dans le selecteur de couleurs), au lieu d'une couleur fixe.
// 4. Le badge rond RPP (Vue Mois) est maintenant centre horizontalement
//    dans la case au lieu d'etre colle en haut a gauche.
// Prerequis : App.jsx doit deja avoir recu patch_note_perso_et_rpp.js.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_note_couleur_rpp_centre.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, "src/App.jsx");
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - le fichier differe de la version attendue (verifie que patch_note_perso_et_rpp.js est bien applique).');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "  FOR:\"#b45309\", DISPO:\"#059669\",\r\n", "  FOR:\"#b45309\", DISPO:\"#059669\", NOTE:\"#b45309\",\r\n", 'hunk_0_L2016');
count++;
content = mustReplaceOnce(content, "    FETE:\"F\u00eates l\u00e9gales\",\r\n", "    FETE:\"F\u00eates l\u00e9gales\", NOTE:\"Note perso\",\r\n", 'hunk_1_L2038');
count++;
content = mustReplaceOnce(content, "      note:\"Couleur appliqu\u00e9e \u00e0 tous les codes F1, F2\u2026 dans l'agenda\",\r\n    },\r\n", "      note:\"Couleur appliqu\u00e9e \u00e0 tous les codes F1, F2\u2026 dans l'agenda\",\r\n    },\r\n    {\r\n      id:\"note\",\r\n      label:\"\ud83d\udcdd Note perso\",\r\n      codes:[\"NOTE\"],\r\n      note:\"Couleur du badge/texte affich\u00e9 pour ta note personnelle dans le planning\",\r\n    },\r\n", 'hunk_2_L2090');
count++;
content = mustReplaceOnce(content, "                  {isOwnProfile&&schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]?.notePerso&&<div style={{fontSize:11,color:\"#b45309\",background:\"#fffbeb\",borderRadius:6,padding:\"2px 8px\",marginBottom:4,display:\"inline-flex\",alignItems:\"center\",gap:4,fontWeight:700}}>\ud83d\udcdd {schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`].notePerso}</div>}\r\n", "                  {isOwnProfile&&schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]?.notePerso&&<div style={{fontSize:11,color:getColor(\"NOTE\"),background:getColor(\"NOTE\")+\"1a\",border:`1px solid ${getColor(\"NOTE\")}55`,borderRadius:6,padding:\"2px 8px\",marginBottom:4,display:\"inline-flex\",alignItems:\"center\",gap:4,fontWeight:700}}>\ud83d\udcdd {schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`].notePerso}</div>}\r\n", 'hunk_3_L3923');
count++;
content = mustReplaceOnce(content, "              {isOwnProfile&&en?.notePerso&&!code&&<div title={en.notePerso} style={{\r\n                background:\"#fffbeb\",color:\"#b45309\",\r\n                borderRadius:5,padding:\"2px 6px\",\r\n                fontSize:10,fontWeight:700,\r\n                display:\"inline-flex\",alignItems:\"center\",gap:4,\r\n                alignSelf:\"flex-start\",\r\n              }}>\ud83d\udcdd Note</div>}\r\n", "              {isOwnProfile&&en?.notePerso&&!code&&<div style={{\r\n                background:getColor(\"NOTE\")+\"22\",color:getColor(\"NOTE\"),\r\n                border:`1px solid ${getColor(\"NOTE\")}55`,\r\n                borderRadius:5,padding:\"3px 7px\",\r\n                fontSize:10,fontWeight:700,lineHeight:1.3,\r\n                display:\"flex\",alignItems:\"flex-start\",gap:4,\r\n              }}>\ud83d\udcdd <span>{en.notePerso}</span></div>}\r\n", 'hunk_4_L4773');
count++;
content = mustReplaceOnce(content, "                {en?.jsCode&&![\"M\",\"AM\",\"N\",\"J\",\"RP\",\"RU\",\"RQ\",\"CA\",\"CP\",\"MA\",\"VT\",\"ABS\",\"FOR\",\"DISPO\",\"NU\",\"TC\",\"TY\",\"RN\",\"JF\"].includes(en.jsCode)&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{getPosteLabelFromCode(en.jsCode)||en.jsCode}</span>}\r\n                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:8,opacity:.85,fontWeight:500,fontStyle:\"italic\"}}>\ud83d\udcdd {en.notePerso}</span>}\r\n              </div>}\r\n", "                {en?.jsCode&&![\"M\",\"AM\",\"N\",\"J\",\"RP\",\"RU\",\"RQ\",\"CA\",\"CP\",\"MA\",\"VT\",\"ABS\",\"FOR\",\"DISPO\",\"NU\",\"TC\",\"TY\",\"RN\",\"JF\"].includes(en.jsCode)&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{getPosteLabelFromCode(en.jsCode)||en.jsCode}</span>}\r\n                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:9,opacity:.95,fontWeight:600,fontStyle:\"italic\",color:getColor(\"NOTE\")}}>\ud83d\udcdd {en.notePerso}</span>}\r\n              </div>}\r\n", 'hunk_5_L4789');
count++;
content = mustReplaceOnce(content, "              {isOwnProfile&&en?.notePerso&&!code&&<div title={en.notePerso} style={{\r\n                background:\"#fffbeb\", color:\"#b45309\",\r\n                borderRadius:5, padding:\"2px 6px\",\r\n                fontSize:10, fontWeight:700,\r\n                display:\"inline-flex\", alignItems:\"center\", gap:4,\r\n                alignSelf:\"flex-start\",\r\n              }}>\r\n                \ud83d\udcdd\r\n", "              {isOwnProfile&&en?.notePerso&&!code&&<div style={{\r\n                background:getColor(\"NOTE\")+\"22\", color:getColor(\"NOTE\"),\r\n                border:`1px solid ${getColor(\"NOTE\")}55`,\r\n                borderRadius:5, padding:\"2px 5px\",\r\n                fontSize:8, fontWeight:600, lineHeight:1.25,\r\n                display:\"flex\", alignItems:\"flex-start\", gap:3,\r\n                alignSelf:\"stretch\",\r\n              }}>\r\n                \ud83d\udcdd <span style={{overflow:\"hidden\",textOverflow:\"ellipsis\",display:\"-webkit-box\",WebkitLineClamp:2,WebkitBoxOrient:\"vertical\"}}>{en.notePerso}</span>\r\n", 'hunk_6_L4910');
count++;
content = mustReplaceOnce(content, "                {posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}\r\n                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:8,opacity:.85,fontWeight:500,fontStyle:\"italic\"}}>\ud83d\udcdd {en.notePerso}</span>}\r\n              </div>}\r\n", "                {posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}\r\n                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:8,opacity:.95,fontWeight:600,fontStyle:\"italic\",color:getColor(\"NOTE\")}}>\ud83d\udcdd {en.notePerso}</span>}\r\n              </div>}\r\n", 'hunk_7_L4928');
count++;
content = mustReplaceOnce(content, "                fontSize:9, fontWeight:800, alignSelf:\"flex-start\",\r\n                flexShrink:0,\r\n", "                fontSize:9, fontWeight:800, alignSelf:\"center\",\r\n                flexShrink:0, margin:\"2px auto\",\r\n", 'hunk_8_L4937');
count++;
content = mustReplaceOnce(content, "                fontSize:8, color:\"#94a3b8\", fontStyle:\"italic\", marginTop:-2,\r\n", "                fontSize:8, color:getColor(\"NOTE\"), fontStyle:\"italic\", fontWeight:600,\r\n                textAlign:\"center\", display:\"block\",\r\n", 'hunk_9_L4943');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);