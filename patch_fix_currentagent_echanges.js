const fs = require('fs');
const path = './src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const target = '{view==="echanges"&&<EchangesView agents={agents} currentAgent={currentAgent}/>}';
const replacement = '{view==="echanges"&&<EchangesView agents={agents} currentAgent={currentAgent||currentUser?.agent}/>}';

const count = content.split(target).length - 1;
console.log('Occurrences trouvées : ' + count);

if (count === 1) {
  content = content.split(target).join(replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Corrigé avec succès.');
} else {
  console.error('Nombre inattendu (' + count + ', attendu 1). Aucune modification effectuée par sécurité.');
  process.exit(1);
}
