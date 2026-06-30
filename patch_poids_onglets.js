const fs = require('fs');
const path = './src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const target = 'fontSize:"clamp(11px,1.6vw,15px)",fontWeight:actif?800:600,';
const replacement = 'fontSize:"clamp(11px,1.6vw,15px)",fontWeight:700,';

const count = content.split(target).length - 1;
console.log('Occurrences trouvées : ' + count);

if (count === 1) {
  content = content.split(target).join(replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Poids de police harmonisé avec succès.');
} else {
  console.error('Nombre inattendu (' + count + ', attendu 1). Aucune modification effectuée par sécurité.');
  process.exit(1);
}
