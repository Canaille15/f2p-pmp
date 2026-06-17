const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldLine = 'const ag=agents.find(a=>line.toUpperCase().includes(a.nom.toUpperCase()));';
const newLine = `const candidats=agents.filter(a=>line.toUpperCase().includes(a.nom.toUpperCase()));
          const ag=candidats.length<=1?candidats[0]:candidats.find(a=>a.prenom&&line.toUpperCase().includes(a.prenom.toUpperCase()))||candidats[0];`;

if (c.includes(oldLine)) {
  c = c.replace(oldLine, newLine);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - matching nom+prenom ajoute pour eviter doublons');
} else {
  console.log('ERREUR - pattern non trouve');
}
