const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('en?.notePerso&&<span')) {
  console.log('Deja present, rien a faire.');
  process.exit(0);
}

const anchor = '{posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}';
const idx = content.indexOf(anchor);
if (idx === -1) {
  console.log('ERREUR: anchor introuvable');
  process.exit(1);
}

const newCode = anchor + '\n                {en?.notePerso&&<span style={{fontSize:8,opacity:.85,fontWeight:500,fontStyle:"italic"}}>{en.notePerso}</span>}';
content = content.slice(0, idx) + newCode + content.slice(idx + anchor.length);
fs.writeFileSync(path, content, 'utf8');
console.log('OK - note pense-bete affichee dans la case du planning perso');
