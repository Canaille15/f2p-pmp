// patch_fete_badge_lisible.js
// Badge des fetes legales (F1..F9, F0, FV) agrandi et plus lisible sur
// ordinateur, en Vue Mois ET Vue Semaine - il etait beaucoup plus petit
// que les autres badges (aucun libelle de poste pour occuper la case).
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_fete_badge_lisible.js

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
content = mustReplaceOnce(content, "                <span>{CODES_FETES[code]?`\ud83e\ude77 ${code}`:(eq?.label||code)}</span>\r\n", "                <span style={CODES_FETES[code]?{fontSize:15,fontWeight:800}:undefined}>{CODES_FETES[code]?`\ud83e\ude77 ${code}`:(eq?.label||code)}</span>\r\n", 'hunk_0_L4828');
count++;
content = mustReplaceOnce(content, "                borderRadius:5, padding:\"2px 5px\",\r\n                fontSize:9, fontWeight:700, lineHeight:1.4,\r\n                display:\"flex\", flexDirection:\"column\",\r\n              }}>\r\n                <span>{CODES_FETES[code]?(\"\ud83e\ude77 \"+code):(EQ_COLORS[code]?.label||code)?.slice(0,5)}</span>\r\n                {posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}\r\n                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:8,fontWeight:700,color:\"#fff\",background:getColor(\"NOTE\"),borderRadius:4,padding:\"1px 4px\",marginTop:1,display:\"inline-block\"}}>\ud83d\udcdd {en.notePerso}</span>}\n", "                borderRadius:5, padding:CODES_FETES[code]?\"4px 7px\":\"2px 5px\",\r\n                fontSize:9, fontWeight:700, lineHeight:1.4,\r\n                display:\"flex\", flexDirection:\"column\",\r\n              }}>\r\n                <span style={CODES_FETES[code]?{fontSize:14,fontWeight:800}:undefined}>{CODES_FETES[code]?(\"\ud83e\ude77 \"+code):(EQ_COLORS[code]?.label||code)?.slice(0,5)}</span>\r\n                {posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}\r\n                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:8,fontWeight:700,color:\"#fff\",background:getColor(\"NOTE\"),borderRadius:4,padding:\"1px 4px\",marginTop:1,display:\"inline-block\"}}>\ud83d\udcdd {en.notePerso}</span>}\r\n", 'hunk_1_L4979');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);