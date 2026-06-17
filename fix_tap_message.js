const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

const old = `{codeActif\r\n          ? \`\u270f\ufe0f Mode saisie : tap sur un jour pour appliquer "\${codeActif}" \u2014 tap \u00e0 nouveau pour effacer\`\r\n          : "\ud83d\udca1 Tap sur un jour pour faire d\u00e9filer les statuts \u00b7 Ou s\u00e9lectionne un code ci-dessus"\r\n        }`;

const newMsg = `codeActif ? \`\u270f\ufe0f Mode saisie : tap sur un jour pour appliquer "\${codeActif}" \u2014 tap \u00e0 nouveau pour effacer\` : ""`;

if(c.includes(old)) {
  c = c.replace(old, newMsg);
  console.log('OK - message tap supprimé');
} else {
  console.log('ERREUR - message non trouvé');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
