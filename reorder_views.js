const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

// Reperer chaque ligne individuellement (robuste aux variations d'encodage/retours ligne)
const marker = 'const VIEWS=[';
const idxMarker = content.indexOf(marker);
if (idxMarker === -1) {
  console.log('ERREUR: marker VIEWS introuvable');
  process.exit(1);
}
const idxEnd = content.indexOf('];', idxMarker);
if (idxEnd === -1) {
  console.log('ERREUR: fin du tableau VIEWS introuvable');
  process.exit(1);
}

const oldArrayContent = content.slice(idxMarker, idxEnd + 2);
console.log('Contenu actuel trouve:');
console.log(oldArrayContent);

// Construire le nouveau tableau en deplacant previsionnel en 2e position
const newArray = `const VIEWS=[
    {k:"personal",l:"📊 Mon planning"},
    {k:"previsionnel", l:"\\u{1F4C5} Planning Prévisionnel"},
    {k:"global",  l:"📋 CPS Officiel"},
    {k:"echanges",l:"🔄 Échanges"},
    {k:"profil",  l:"👤 Mon profil"},
    ...(isAdmin ? [{k:"admin", l:"\\u{1F451} Admin"}] : [])
  ];`;

content = content.slice(0, idxMarker) + newArray + content.slice(idxEnd + 2);
fs.writeFileSync(path, content, 'utf8');
console.log('OK - ordre des onglets mis a jour');
