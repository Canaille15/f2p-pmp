const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const oldStyle = 'style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 14px",fontSize:11,color:"#64748b",lineHeight:1.5}}';
if (!content.includes(oldStyle)) {
  console.log('ERREUR: style introuvable (deja modifie ?)');
  process.exit(1);
}

const newStyle = 'style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#475569",lineHeight:1.6,maxWidth:620}}';

let count = 0;
let idx;
while ((idx = content.indexOf(oldStyle)) !== -1) {
  content = content.slice(0, idx) + newStyle + content.slice(idx + oldStyle.length);
  count++;
}

if (count === 0) {
  console.log('ERREUR: aucune occurrence trouvee');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('OK - ' + count + ' message(s) ameliore(s) (largeur limitee, police agrandie)');
