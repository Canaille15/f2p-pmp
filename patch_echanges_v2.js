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

// 1. Libellé poste lisible au lieu du code brut
const before1 = block;
block = block.split('{e.code_poste||"Poste"}').join('{e.poste_label||e.code_poste||"Poste"}');
console.log(before1 === block ? 'Aucun remplacement poste_label effectué (vérifier).' : 'Libellé poste_label ajouté.');

// 2. Tailles de police agrandies (+2px partout dans ce composant)
let nbFont = 0;
block = block.replace(/fontSize:(\d+)/g, (m, d) => { nbFont++; return 'fontSize:' + (parseInt(d, 10) + 2); });
console.log(nbFont + ' valeurs fontSize agrandies.');

// 3. Paddings agrandis (+2px sur chaque dimension)
let nbPad = 0;
block = block.replace(/padding:"(\d+)px (\d+)px"/g, (m, a, b) => { nbPad++; return 'padding:"' + (parseInt(a,10)+2) + 'px ' + (parseInt(b,10)+2) + 'px"'; });
console.log(nbPad + ' valeurs padding agrandies.');

// 4. Avatars légèrement plus grands
block = block.split('size={26}').join('size={30}');

content = content.slice(0, startIdx) + block + content.slice(endIdx);
fs.writeFileSync(path, content, 'utf8');
console.log('App.jsx mis à jour avec succès.');
