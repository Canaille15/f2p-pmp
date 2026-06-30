const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const anchor = '<span style={{fontFamily:"monospace",fontSize:10,fontWeight:800,color:"#fff",background:fam?.color||"#7c3aed",borderRadius:5,padding:"2px 7px"}}>{row.jsCode}</span>';
const idx = content.indexOf(anchor);
if (idx === -1) {
  console.log('ERREUR: anchor introuvable');
  process.exit(1);
}

const wrapped = '{!row.isJourneeSpeciale&&' + anchor + '}';
content = content.slice(0, idx) + wrapped + content.slice(idx + anchor.length);
fs.writeFileSync(path, content, 'utf8');
console.log('OK - badge jsCode masque sur la ligne Journee speciale');
