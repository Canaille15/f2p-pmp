// patch_rpp_rond_sans_centrage.js
// Correction : RPP reste ROND en Vue Semaine et Vue Planning, mais NE
// SE DEPLACE PLUS - il garde sa place normale dans le flux (comme les
// autres badges), au lieu d'etre recentre dans la case/ligne. Seule la
// Vue Mois reste centree (comportement voulu et deja valide la-bas).
// Prerequis : App.jsx doit deja avoir recu patch_rpp_rond_semaine_planning.js.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_rpp_rond_sans_centrage.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - ' + 'verifie que patch_rpp_rond_semaine_planning.js est bien applique.');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "                      <div style={{display:\"flex\",alignItems:\"center\",gap:6,marginBottom:4,justifyContent:l.code===\"RPP\"?\"center\":\"flex-start\"}}>\r\n", "                      <div style={{display:\"flex\",alignItems:\"center\",gap:6,marginBottom:4}}>\r\n", 'hunk_0_L3933');
count++;
content = mustReplaceOnce(content, "              {/* ZONE 2bis \u2014 RPP : badge rond d\u00e9di\u00e9, centr\u00e9, palette dissoci\u00e9e de RP */}\r\n              {code===\"RPP\"&&showData&&<div style={{\r\n                display:\"flex\", alignItems:\"center\", justifyContent:\"center\",\r\n                width:32, height:32, borderRadius:\"50%\",\r\n                background:getColor(\"RPP\"), color:getTc(\"RPP\"),\r\n                fontSize:10, fontWeight:800, alignSelf:\"center\",\r\n                flexShrink:0, margin:\"2px auto\",\r\n", "              {/* ZONE 2bis \u2014 RPP : badge rond d\u00e9di\u00e9, \u00e0 sa place normale, palette dissoci\u00e9e de RP */}\r\n              {code===\"RPP\"&&showData&&<div style={{\r\n                display:\"flex\", alignItems:\"center\", justifyContent:\"center\",\r\n                width:32, height:32, borderRadius:\"50%\",\r\n                background:getColor(\"RPP\"), color:getTc(\"RPP\"),\r\n                fontSize:10, fontWeight:800,\r\n                flexShrink:0,\r\n", 'hunk_1_L4808');
count++;
content = mustReplaceOnce(content, "                background:getColor(\"NOTE\"), borderRadius:4, padding:\"1px 6px\",\r\n                textAlign:\"center\", display:\"block\", margin:\"0 auto\",\r\n              }}>\ud83d\udcdd {en.notePerso}</span>}\r\n", "                background:getColor(\"NOTE\"), borderRadius:4, padding:\"1px 6px\",\r\n                display:\"inline-block\",\r\n              }}>\ud83d\udcdd {en.notePerso}</span>}\r\n", 'hunk_2_L4820');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);