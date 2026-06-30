const fs = require('fs');
const path = './src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const target = '        fam: r.famille||"PRCI",\r\n      }));';
const replacement = '        fam: r.famille||"PRCI",\r\n        famille: r.famille||"PRCI",\r\n      }));';

const count = content.split(target).length - 1;
console.log('Occurrences trouvées : ' + count);

if (count === 1) {
  content = content.split(target).join(replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Champ famille ajouté avec succès.');
} else {
  console.error('Nombre inattendu (' + count + ', attendu 1). Aucune modification effectuée par sécurité.');
  process.exit(1);
}
