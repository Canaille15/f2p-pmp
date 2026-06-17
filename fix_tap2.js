const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

const old = `        codeActif ? \`\u270f\ufe0f Mode saisie : tap sur un jour pour appliquer "\${codeActif}" \u2014 tap \u00e0 nouveau pour effacer\` : ""\r\n      </div>`;

const newMsg = `        {codeActif ? \`\u270f\ufe0f Mode saisie : tap sur un jour pour appliquer "\${codeActif}" \u2014 tap \u00e0 nouveau pour effacer\` : ""}\r\n      </div>`;

if(c.includes(old)) {
  c = c.replace(old, newMsg);
  console.log('OK - accolades remises');
} else {
  console.log('ERREUR non trouvé');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
