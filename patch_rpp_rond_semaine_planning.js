// patch_rpp_rond_semaine_planning.js
// RPP s'affiche desormais en badge ROND et CENTRE dans les vues Semaine
// et Planning (comme deja fait hier pour la Vue Mois), avec sa note
// associee affichee juste en-dessous si presente.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_rpp_rond_semaine_planning.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, "src/App.jsx");
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - ' + "verifie que tous les patchs precedents de la session sont bien appliques.");
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "                      <div style={{display:\"flex\",alignItems:\"center\",gap:6,marginBottom:4}}>\r\n", "                      <div style={{display:\"flex\",alignItems:\"center\",gap:6,marginBottom:4,justifyContent:l.code===\"RPP\"?\"center\":\"flex-start\"}}>\r\n                        {l.code===\"RPP\"?(\r\n                          <span style={{\r\n                            display:\"flex\",alignItems:\"center\",justifyContent:\"center\",\r\n                            width:36,height:36,borderRadius:\"50%\",\r\n                            background:l.couleur,color:l.tc,\r\n                            fontSize:11,fontWeight:800,\r\n                            boxShadow:\"0 1px 3px rgba(0,0,0,.12)\",\r\n                          }}>RPP</span>\r\n                        ):(\r\n", 'hunk_0_L3933');
count++;
content = mustReplaceOnce(content, "                        {l.jsCode&&![\"M\",\"AM\",\"N\",\"J\",\"RP\",\"RU\",\"RQ\",\"CA\",\"CP\",\"MA\",\"VT\",\"ABS\",\"FOR\",\"DISPO\",\"NU\",\"TC\",\"TY\",\"RN\",\"JF\"].includes(l.jsCode)?<span style={{fontSize:10,opacity:.8}}> / {l.jsCode}</span>:null}</span>\r\n                        {l.eq?.heures&&<span style={{\r\n", "                        {l.jsCode&&![\"M\",\"AM\",\"N\",\"J\",\"RP\",\"RU\",\"RQ\",\"CA\",\"CP\",\"MA\",\"VT\",\"ABS\",\"FOR\",\"DISPO\",\"NU\",\"TC\",\"TY\",\"RN\",\"JF\"].includes(l.jsCode)?<span style={{fontSize:10,opacity:.8}}> / {l.jsCode}</span>:null}</span>\r\n                        )}\r\n                        {l.eq?.heures&&<span style={{\r\n", 'hunk_1_L3941');
count++;
content = mustReplaceOnce(content, "              {code&&showData&&code!==\"N\"&&<div style={{\r\n", "              {code&&showData&&code!==\"N\"&&code!==\"RPP\"&&<div style={{\r\n", 'hunk_2_L4787');
count++;
content = mustReplaceOnce(content, "                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:9,fontWeight:700,color:\"#fff\",background:getColor(\"NOTE\"),borderRadius:4,padding:\"1px 5px\",marginTop:1}}>\ud83d\udcdd {en.notePerso}</span>}\r\n              </div>}\r\n\r\n              {/* ZONE 3 \u2014 Nuit (bas) */}\r\n", "                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:9,fontWeight:700,color:\"#fff\",background:getColor(\"NOTE\"),borderRadius:4,padding:\"1px 5px\",marginTop:1}}>\ud83d\udcdd {en.notePerso}</span>}\r\n              </div>}\r\n\r\n              {/* ZONE 2bis \u2014 RPP : badge rond d\u00e9di\u00e9, centr\u00e9, palette dissoci\u00e9e de RP */}\r\n              {code===\"RPP\"&&showData&&<div style={{\r\n                display:\"flex\", alignItems:\"center\", justifyContent:\"center\",\r\n                width:32, height:32, borderRadius:\"50%\",\r\n                background:getColor(\"RPP\"), color:getTc(\"RPP\"),\r\n                fontSize:10, fontWeight:800, alignSelf:\"center\",\r\n                flexShrink:0, margin:\"2px auto\",\r\n              }}>\r\n                RPP\r\n              </div>}\r\n              {code===\"RPP\"&&showData&&isOwnProfile&&en?.notePerso&&<span style={{\r\n                fontSize:9, color:\"#fff\", fontWeight:700,\r\n                background:getColor(\"NOTE\"), borderRadius:4, padding:\"1px 6px\",\r\n                textAlign:\"center\", display:\"block\", margin:\"0 auto\",\r\n              }}>\ud83d\udcdd {en.notePerso}</span>}\r\n\r\n              {/* ZONE 3 \u2014 Nuit (bas) */}\r\n", 'hunk_3_L4795');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);