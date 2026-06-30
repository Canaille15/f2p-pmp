const fs = require('fs');
const path = './src/config/db.js';
let content = fs.readFileSync(path, 'utf8');

const oldLine = "charset: 'utf8mb4',";
const newLine = "charset: 'utf8mb4',\n  dateStrings: ['DATE'], // évite le décalage d'un jour dû au fuseau horaire sur les colonnes DATE";

if (content.indexOf(oldLine) === -1) {
  console.error('Ligne de référence introuvable. Aucune modification effectuée.');
  process.exit(1);
}

content = content.replace(oldLine, newLine);
fs.writeFileSync(path, content, 'utf8');
console.log('db.js corrigé : les colonnes DATE seront désormais renvoyées sans décalage de fuseau horaire.');
