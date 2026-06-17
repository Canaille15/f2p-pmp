const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// Ajouter showData dans le return de lignes
const old = `return {dk, code, eq, label, plage, couleur, tc, isWE, isToday, dow, jsCode,`;
const newR = `return {dk, code, eq, label, plage, couleur, tc, isWE, isToday, dow, jsCode, showData,`;

if(c.includes(old)) {
  c = c.replace(old, newR);
  console.log('OK - showData ajouté dans return');
} else {
  console.log('ERREUR - return non trouvé');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
