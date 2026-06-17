const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'api', 'api', 'src', 'controllers', 'profilController.js');
let c = fs.readFileSync(filePath, 'utf8');

const old = `function updateProfil(req, res) {`;
const newCode = `async function updateProfil(req, res) {`;

if(c.includes(old)) {
  c = c.replace(old, newCode);
  console.log('OK - async ajouté');
} else {
  console.log('ERREUR - fonction non trouvée');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
