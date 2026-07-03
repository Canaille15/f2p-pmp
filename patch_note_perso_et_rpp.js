// patch_note_perso_et_rpp.js
// Ajoute le code RPP (variante de RP : meme comportement, meme compteur RP,
// palette dissociee personnalisable, badge rond dedie dans la vue Mois).
// Generalise la note perso 'pense-bete' (renommee 'Note') : disponible sur
// tout type de jour (plus limitee a PPRCI/PPAR), affichee dans Vue Mois,
// Vue Semaine ET Vue Planning (liste), strictement verrouillee a isOwnProfile
// (jamais visible par un admin en consultation d'un autre agent, meme sur
// un jour au code public). Aucun impact sur les compteurs pour la note.
// Doit etre lance en complement de patch_notes_dayeditpopup.js (DayEditPopup.jsx).
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_note_perso_et_rpp.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, "src/App.jsx");
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - le fichier differe de la version attendue (dernier commit connu: c80ee7f).');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "  { code:\"RP\",   label:\"RP\",         heures:\"\",            color:\"#16a34a\", textColor:\"#fff\", dot:\"#bbf7d0\", prive:true,  compteur:\"RP\",      bg:\"#16a34a\" },\r\n", "  { code:\"RP\",   label:\"RP\",         heures:\"\",            color:\"#16a34a\", textColor:\"#fff\", dot:\"#bbf7d0\", prive:true,  compteur:\"RP\",      bg:\"#16a34a\" },\n  { code:\"RPP\",  label:\"RPP\",        heures:\"\",            color:\"#0d9488\", textColor:\"#fff\", dot:\"#99f6e4\", prive:true,  compteur:\"RP\",      bg:\"#0d9488\" },\r\n", 'hunk_0_L260');
count++;
content = mustReplaceOnce(content, "  RP:\"#16a34a\", RU:\"#ca8a04\", RQ:\"#ca8a04\", TC:\"#0284c7\", TY:\"#0284c7\", RN:\"#4338ca\",\r\n", "  RP:\"#16a34a\", RPP:\"#0d9488\", RU:\"#ca8a04\", RQ:\"#ca8a04\", TC:\"#0284c7\", TY:\"#0284c7\", RN:\"#4338ca\",\r\n", 'hunk_1_L2012');
count++;
content = mustReplaceOnce(content, "    RP:\"RP\", RU:\"RU\", RQ:\"RQ\", TC:\"TC\", TY:\"TY\", RN:\"RN\",\r\n", "    RP:\"RP\", RPP:\"RPP\", RU:\"RU\", RQ:\"RQ\", TC:\"TC\", TY:\"TY\", RN:\"RN\",\r\n", 'hunk_2_L2034');
count++;
content = mustReplaceOnce(content, "      codes:[\"RP\",\"RU\",\"RQ\",\"TC\",\"TY\",\"RN\"],\r\n      note:\"RP = Repos P\u00e9riodique \u00b7 RU/RQ = Repos Utilisation \u00b7 TC/TY = Temps Compens\u00e9 \u00b7 RN = Repos Nuit\",\r\n", "      codes:[\"RP\",\"RPP\",\"RU\",\"RQ\",\"TC\",\"TY\",\"RN\"],\r\n      note:\"RP = Repos P\u00e9riodique \u00b7 RPP = variante RP (palette dissoci\u00e9e) \u00b7 RU/RQ = Repos Utilisation \u00b7 TC/TY = Temps Compens\u00e9 \u00b7 RN = Repos Nuit\",\r\n", 'hunk_3_L2052');
count++;
content = mustReplaceOnce(content, "      if(c[eq]!==undefined) c[eq]++;\r\n", "      // RPP alimente le m\u00eame compteur que RP (palette dissoci\u00e9e, m\u00eame comptabilisation)\r\n      const eqCompteur = eq===\"RPP\" ? \"RP\" : eq;\r\n      if(c[eqCompteur]!==undefined) c[eqCompteur]++;\r\n", 'hunk_4_L2268');
count++;
content = mustReplaceOnce(content, "                  {schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]?.finNuit&&<div style={{fontSize:11,color:\"#0369a1\",background:\"#f0f9ff\",borderRadius:6,padding:\"2px 8px\",marginBottom:4,display:\"inline-flex\",alignItems:\"center\",gap:4,fontWeight:700}}>\ud83c\udf19 Descente de nuit</div>}\r\n", "                  {schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]?.finNuit&&<div style={{fontSize:11,color:\"#0369a1\",background:\"#f0f9ff\",borderRadius:6,padding:\"2px 8px\",marginBottom:4,display:\"inline-flex\",alignItems:\"center\",gap:4,fontWeight:700}}>\ud83c\udf19 Descente de nuit</div>}\n                  {isOwnProfile&&schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]?.notePerso&&<div style={{fontSize:11,color:\"#b45309\",background:\"#fffbeb\",borderRadius:6,padding:\"2px 8px\",marginBottom:4,display:\"inline-flex\",alignItems:\"center\",gap:4,fontWeight:700}}>\ud83d\udcdd {schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`].notePerso}</div>}\r\n", 'hunk_5_L3919');
count++;
content = mustReplaceOnce(content, "              }}>\ud83c\udf19</div>}\r\n\r\n", "              }}>\ud83c\udf19</div>}\r\n              {isOwnProfile&&en?.notePerso&&!code&&<div title={en.notePerso} style={{\r\n                background:\"#fffbeb\",color:\"#b45309\",\r\n                borderRadius:5,padding:\"2px 6px\",\r\n                fontSize:10,fontWeight:700,\r\n                display:\"inline-flex\",alignItems:\"center\",gap:4,\r\n                alignSelf:\"flex-start\",\r\n              }}>\ud83d\udcdd Note</div>}\r\n\r\n", 'hunk_6_L4768');
count++;
content = mustReplaceOnce(content, "                {en?.jsCode&&![\"M\",\"AM\",\"N\",\"J\",\"RP\",\"RU\",\"RQ\",\"CA\",\"CP\",\"MA\",\"VT\",\"ABS\",\"FOR\",\"DISPO\",\"NU\",\"TC\",\"TY\",\"RN\",\"JF\"].includes(en.jsCode)&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{getPosteLabelFromCode(en.jsCode)||en.jsCode}</span>}\r\n              </div>}\r\n", "                {en?.jsCode&&![\"M\",\"AM\",\"N\",\"J\",\"RP\",\"RU\",\"RQ\",\"CA\",\"CP\",\"MA\",\"VT\",\"ABS\",\"FOR\",\"DISPO\",\"NU\",\"TC\",\"TY\",\"RN\",\"JF\"].includes(en.jsCode)&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{getPosteLabelFromCode(en.jsCode)||en.jsCode}</span>}\r\n                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:8,opacity:.85,fontWeight:500,fontStyle:\"italic\"}}>\ud83d\udcdd {en.notePerso}</span>}\r\n              </div>}\r\n", 'hunk_7_L4778');
count++;
content = mustReplaceOnce(content, "              {/* ZONE 1 \u2014 \ud83c\udf19 descente de nuit (toujours en haut) */}\r\n", "              {/* ZONE 1 \u2014 \ud83c\udf19 descente de nuit + \ud83d\udcdd note perso (toujours en haut) */}\r\n", 'hunk_8_L4888');
count++;
content = mustReplaceOnce(content, "\r\n       {/* ZONE 2 \u2014 Utilisation journ\u00e9e (milieu) */}\r\n              {code&&showData&&code!==\"N\"&&<div style={{\r\n", "              {isOwnProfile&&en?.notePerso&&!code&&<div title={en.notePerso} style={{\r\n                background:\"#fffbeb\", color:\"#b45309\",\r\n                borderRadius:5, padding:\"2px 6px\",\r\n                fontSize:10, fontWeight:700,\r\n                display:\"inline-flex\", alignItems:\"center\", gap:4,\r\n                alignSelf:\"flex-start\",\r\n              }}>\r\n                \ud83d\udcdd\r\n              </div>}\r\n\r\n       {/* ZONE 2 \u2014 Utilisation journ\u00e9e (milieu) */}\r\n              {code&&showData&&code!==\"N\"&&code!==\"RPP\"&&<div style={{\r\n", 'hunk_9_L4898');
count++;
content = mustReplaceOnce(content, "                {en?.notePerso&&<span style={{fontSize:8,opacity:.85,fontWeight:500,fontStyle:\"italic\"}}>{en.notePerso}</span>}\r\n              </div>}\r\n", "                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:8,opacity:.85,fontWeight:500,fontStyle:\"italic\"}}>\ud83d\udcdd {en.notePerso}</span>}\r\n              </div>}\r\n\r\n              {/* ZONE 2bis \u2014 RPP : badge rond d\u00e9di\u00e9, palette dissoci\u00e9e de RP */}\r\n              {code===\"RPP\"&&showData&&<div title={isOwnProfile?(en?.notePerso||\"\"):\"\"} style={{\r\n                display:\"flex\", alignItems:\"center\", justifyContent:\"center\",\r\n                width:26, height:26, borderRadius:\"50%\",\r\n                background:getColor(\"RPP\"), color:getTc(\"RPP\"),\r\n                fontSize:9, fontWeight:800, alignSelf:\"flex-start\",\r\n                flexShrink:0,\r\n              }}>\r\n                RPP\r\n              </div>}\r\n              {code===\"RPP\"&&showData&&isOwnProfile&&en?.notePerso&&<span style={{\r\n                fontSize:8, color:\"#94a3b8\", fontStyle:\"italic\", marginTop:-2,\r\n              }}>\ud83d\udcdd {en.notePerso}</span>}\r\n", 'hunk_10_L4908');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);