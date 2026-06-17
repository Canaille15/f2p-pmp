const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'components', 'DayEditPopup.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// Corriger isNuitSeule pour gérer equipe="N" + equipe2="N" (anciennes données)
const oldInit = `const isNuitSeule = entry?.equipe === "N" && !entry?.equipe2;`;
const newInit = `// Nuit seule = equipe="N" sans journée (equipe2=null OU equipe2="N" avec equipe="N")
  const isNuitSeule = entry?.equipe === "N" && (entry?.equipe2 === "N" || !entry?.equipe2);`;

if(c.includes(oldInit)) {
  c = c.replace(oldInit, newInit);
  console.log('OK - isNuitSeule corrigé');
} else {
  console.log('ERREUR - isNuitSeule non trouvé');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
