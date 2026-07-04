// patch_rpp_recentrer_semaine.js
// Correction du patch precedent : RPP redevient CENTRE en Vue Semaine
// (comme en Vue Mois). Seule la Vue Planning reste a sa place normale,
// sans etre recentree.
// Prerequis : App.jsx doit deja avoir recu patch_rpp_rond_sans_centrage.js.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_rpp_recentrer_semaine.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - ' + 'verifie que patch_rpp_rond_sans_centrage.js est bien applique.');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "              {/* ZONE 2bis \u2014 RPP : badge rond d\u00e9di\u00e9, \u00e0 sa place normale, palette dissoci\u00e9e de RP */}\r\n              {code===\"RPP\"&&showData&&<div style={{\r\n                display:\"flex\", alignItems:\"center\", justifyContent:\"center\",\r\n                width:32, height:32, borderRadius:\"50%\",\r\n                background:getColor(\"RPP\"), color:getTc(\"RPP\"),\r\n                fontSize:10, fontWeight:800,\r\n                flexShrink:0,\r\n", "              {/* ZONE 2bis \u2014 RPP : badge rond d\u00e9di\u00e9, centr\u00e9, palette dissoci\u00e9e de RP */}\r\n              {code===\"RPP\"&&showData&&<div style={{\r\n                display:\"flex\", alignItems:\"center\", justifyContent:\"center\",\r\n                width:32, height:32, borderRadius:\"50%\",\r\n                background:getColor(\"RPP\"), color:getTc(\"RPP\"),\r\n                fontSize:10, fontWeight:800, alignSelf:\"center\",\r\n                flexShrink:0, margin:\"2px auto\",\r\n", 'hunk_0_L4808');
count++;
content = mustReplaceOnce(content, "                display:\"inline-block\",\r\n", "                textAlign:\"center\", display:\"block\", margin:\"0 auto\",\r\n", 'hunk_1_L4821');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);