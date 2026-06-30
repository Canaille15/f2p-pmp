const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const oldStyle = '{pJ?.subtitle&&<div style={{fontSize:9,color:"#94a3b8",fontStyle:"italic"}}>{pJ.subtitle}</div>}';
const idx = content.indexOf(oldStyle);
if (idx === -1) {
  console.log('ERREUR: style introuvable (deja modifie ?)');
  process.exit(1);
}

const newStyle = '{pJ?.subtitle&&<div style={{fontSize:10,color:"#1e293b",fontWeight:600,fontStyle:"italic"}}>{pJ.subtitle}</div>}';
content = content.slice(0, idx) + newStyle + content.slice(idx + oldStyle.length);
fs.writeFileSync(path, content, 'utf8');
console.log('OK - contraste du sous-titre ameliore');
