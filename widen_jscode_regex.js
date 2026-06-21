const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldLine = `const jsCodeMatch=line.match(/\\b(PA[A-Z0-9]+-?|PI[A-Z0-9]+-?)/);`;
const newLine = `const jsCodeMatch=line.match(/\\b(PA[A-Z0-9]+-?|PI[A-Z0-9]+-?|SD%|F-PRCI|AFOPRCI|CAF|PPRCI|VM|AFO PAR|K-PAR|F-PAR|K-PRCI|A-PRCI)\\b/);`;

if (c.includes(oldLine)) {
  c = c.replace(oldLine, newLine);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - regex jsCode elargie aux codes speciaux');
} else {
  console.log('ERREUR - ligne non trouvee');
}
