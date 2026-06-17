const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// Dans getRCFetesDuJour, supprimer l'ajout des fêtes de type "fete" 
// (déjà visibles via ZONE 2 du calendrier)
const old = `  // 1. Code fête saisi directement dans le planning ce jour\r\n  const entry = schedule[\`\${agentId}-\${dk}\`];\r\n  if(entry?.equipe && CODES_FETES[entry.equipe]){\r\n    result.push({code: entry.equipe, label: CODES_FETES[entry.equipe], type:\"fete\"});\r\n    dejaPush.add(entry.equipe);\r\n  }`;

const newCode = `  // 1. Code fête saisi directement — pas affiché en pastille (déjà visible via badge journée)\r\n  const entry = schedule[\`\${agentId}-\${dk}\`];\r\n  if(entry?.equipe && CODES_FETES[entry.equipe]){\r\n    dejaPush.add(entry.equipe); // marquer comme déjà traité sans ajouter la pastille\r\n  }`;

if(c.includes(old)) {
  c = c.replace(old, newCode);
  console.log('OK - doublon fête supprimé');
} else {
  console.log('ERREUR - bloc non trouvé');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
