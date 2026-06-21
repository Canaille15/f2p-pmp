const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldLine = '<button onClick={()=>onImport(ag)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,opacity:.4,padding:1}}>✏️</button>';

console.log('Pattern trouve:', c.includes(oldLine));

if (c.includes(oldLine)) {
  c = c.replace(oldLine, '');
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - bouton stylo retire de CPS Officiel');
} else {
  console.log('ERREUR - bouton non trouve');
}
