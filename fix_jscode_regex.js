const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldRegex = 'const jsCodeMatch=line.match(/\\b(PA[A-Z0-9]{2,6}[-OX]?|PI[A-Z0-9]{2,6}[-OX]?)\\b/);';
const newRegex = 'const jsCodeMatch=line.match(/\\b(PA[A-Z0-9]+-?|PI[A-Z0-9]+-?)/);';

if (c.includes(oldRegex)) {
  c = c.replace(oldRegex, newRegex);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - regex jsCode corrigee');
} else {
  console.log('ERREUR - ancien pattern non trouve');
}
