const fs = require('fs');
const path = './.env';
let content = fs.readFileSync(path, 'utf8');

const replacements = [
  [/^DB_HOST=.*$/m, 'DB_HOST=trolley.proxy.rlwy.net'],
  [/^DB_PORT=.*$/m, 'DB_PORT=47472'],
  [/^DB_USER=.*$/m, 'DB_USER=root'],
  [/^DB_PASSWORD=.*$/m, 'DB_PASSWORD=cVKgGVWWWYHmJslHyHKKJtHzetNdyKBS'],
  [/^DB_NAME=.*$/m, 'DB_NAME=railway'],
];

let nbChanges = 0;
replacements.forEach(([regex, newLine]) => {
  if (regex.test(content)) {
    content = content.replace(regex, newLine);
    nbChanges++;
  } else {
    console.error('Ligne non trouvée pour : ' + newLine.split('=')[0]);
  }
});

fs.writeFileSync(path, content, 'utf8');
console.log(nbChanges + ' ligne(s) modifiée(s) dans .env — pointe maintenant vers Railway.');
