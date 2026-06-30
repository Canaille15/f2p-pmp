const fs = require('fs');
const path = './src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const startMarker = 'function EchangesView';
const startIdx = content.indexOf(startMarker);
if (startIdx === -1) { console.error('Marqueur de début introuvable.'); process.exit(1); }
const endMarker = 'function ProfilPersoView';
const endIdx = content.indexOf(endMarker, startIdx);
if (endIdx === -1) { console.error('Marqueur de fin introuvable.'); process.exit(1); }

let block = content.slice(startIdx, endIdx);

const target = 'secteurs:[],';
const count = block.split(target).length - 1;
console.log('Occurrences trouvées : ' + count);

if (count === 2) {
  block = block.split(target).join('');
  console.log('Les 2 occurrences ont été retirées.');
} else {
  console.error('Nombre inattendu (' + count + ', attendu 2). Aucune modification effectuée par sécurité.');
  process.exit(1);
}

content = content.slice(0, startIdx) + block + content.slice(endIdx);
fs.writeFileSync(path, content, 'utf8');
console.log('App.jsx mis à jour avec succès.');
