const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

const old = `schedule[\`\${agent.id}-\${l.dk}\`]?.equipe2==="N"&&l.showData&&`;
const newC = `schedule[\`\${agent.id}-\${l.dk}\`]?.equipe2==="N"&&l.code!=="N"&&l.showData&&`;

if(c.includes(old)) {
  c = c.replace(old, newC);
  console.log('OK - doublon nuit corrigé');
} else {
  console.log('ERREUR - condition non trouvée');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
