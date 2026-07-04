// patch_note_contraste_toutes_vues.js
// Ameliore le contraste de la Note perso dans les 3 vues (Mois, Semaine,
// Planning) : badges a fond plein (couleur personnalisee + texte blanc)
// au lieu de teintes pales peu lisibles, notamment sur mobile.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_note_contraste_toutes_vues.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, "src/App.jsx");
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - ' + "le fichier differe de la version attendue (verifie que le chantier Note/RPP est bien applique).");
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "                  {isOwnProfile&&schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]?.notePerso&&<div style={{fontSize:11,color:getColor(\"NOTE\"),background:getColor(\"NOTE\")+\"1a\",border:`1px solid ${getColor(\"NOTE\")}55`,borderRadius:6,padding:\"2px 8px\",marginBottom:4,display:\"inline-flex\",alignItems:\"center\",gap:4,fontWeight:700}}>\ud83d\udcdd {schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`].notePerso}</div>}\r\n", "                  {isOwnProfile&&schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]?.notePerso&&<div style={{fontSize:11,color:\"#fff\",background:getColor(\"NOTE\"),borderRadius:6,padding:\"3px 9px\",marginBottom:4,display:\"inline-flex\",alignItems:\"center\",gap:4,fontWeight:700}}>\ud83d\udcdd {schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`].notePerso}</div>}\r\n", 'hunk_0_L3929');
count++;
content = mustReplaceOnce(content, "                background:getColor(\"NOTE\")+\"22\",color:getColor(\"NOTE\"),\r\n                border:`1px solid ${getColor(\"NOTE\")}55`,\r\n", "                background:getColor(\"NOTE\"),color:\"#fff\",\r\n", 'hunk_1_L4780');
count++;
content = mustReplaceOnce(content, "                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:9,opacity:.95,fontWeight:600,fontStyle:\"italic\",color:getColor(\"NOTE\")}}>\ud83d\udcdd {en.notePerso}</span>}\r\n", "                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:9,fontWeight:700,color:\"#fff\",background:getColor(\"NOTE\"),borderRadius:4,padding:\"1px 5px\",marginTop:1}}>\ud83d\udcdd {en.notePerso}</span>}\r\n", 'hunk_2_L4796');
count++;
content = mustReplaceOnce(content, "                background:getColor(\"NOTE\")+\"22\", color:getColor(\"NOTE\"),\r\n                border:`1px solid ${getColor(\"NOTE\")}55`,\r\n                borderRadius:5, padding:\"2px 5px\",\r\n                fontSize:8, fontWeight:600, lineHeight:1.25,\r\n                display:\"flex\", alignItems:\"flex-start\", gap:3,\r\n                alignSelf:\"stretch\",\r\n              }}>\r\n                \ud83d\udcdd <span style={{overflow:\"hidden\",textOverflow:\"ellipsis\",display:\"-webkit-box\",WebkitLineClamp:2,WebkitBoxOrient:\"vertical\"}}>{en.notePerso}</span>\r\n", "                background:getColor(\"NOTE\"), color:\"#fff\",\r\n                borderRadius:5, padding:\"2px 5px\",\r\n                fontSize:8, fontWeight:700, lineHeight:1.25,\r\n                display:\"flex\", alignItems:\"flex-start\", gap:3,\r\n                alignSelf:\"stretch\", width:\"100%\", boxSizing:\"border-box\",\r\n              }}>\r\n                \ud83d\udcdd <span style={{overflow:\"hidden\",textOverflow:\"ellipsis\",display:\"-webkit-box\",WebkitLineClamp:2,WebkitBoxOrient:\"vertical\",flex:1,minWidth:0}}>{en.notePerso}</span>\r\n", 'hunk_3_L4917');
count++;
content = mustReplaceOnce(content, "                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:8,opacity:.95,fontWeight:600,fontStyle:\"italic\",color:getColor(\"NOTE\")}}>\ud83d\udcdd {en.notePerso}</span>}\r\n              </div>}\r\n\r\n", "                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:8,fontWeight:700,color:\"#fff\",background:getColor(\"NOTE\"),borderRadius:4,padding:\"1px 4px\",marginTop:1,display:\"inline-block\"}}>\ud83d\udcdd {en.notePerso}</span>}\n              </div>}\n\n", 'hunk_4_L4936');
count++;
content = mustReplaceOnce(content, "                fontSize:8, color:getColor(\"NOTE\"), fontStyle:\"italic\", fontWeight:600,\r\n                textAlign:\"center\", display:\"block\",\r\n", "                fontSize:8, color:\"#fff\", fontWeight:700,\r\n                background:getColor(\"NOTE\"), borderRadius:4, padding:\"1px 5px\",\r\n                textAlign:\"center\", display:\"block\", margin:\"0 auto\",\r\n", 'hunk_5_L4950');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);