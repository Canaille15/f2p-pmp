const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const idx = c.indexOf('view==="echanges"');
const idxEnd = c.indexOf('}', c.indexOf('/>}', idx)) + 1;

// On cherche plus precisement la fin exacte de cette ligne (le "}" final apres "/>")
const lineEndMarker = '/>}';
const lineEndIdx = c.indexOf(lineEndMarker, idx) + lineEndMarker.length;

if (idx === -1) {
  console.log('ERREUR - marqueur non trouve');
  process.exit(1);
}

const insertion = `\r\n      {view==="profil"&&<ProfilPersoView currentAgent={currentAgent}/>}`;

c = c.slice(0, lineEndIdx) + insertion + c.slice(lineEndIdx);
fs.writeFileSync('src/App.jsx', c, 'utf8');
console.log('OK - affichage conditionnel ProfilPersoView branche');
