const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldLine = `const scale=2.0; // haute résolution pour meilleur OCR`;
const newLine = `const scale=3.0; // haute résolution pour meilleur OCR`;

if (c.includes(oldLine)) {
  c = c.replace(oldLine, newLine);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - resolution augmentee a 3.0');
} else {
  console.log('ERREUR - ligne non trouvee');
}
