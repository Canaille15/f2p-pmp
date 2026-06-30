const fs = require('fs');
const path = 'src/components/DayEditPopup.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('p.code === "PPRCI" || p.code === "PPAR"')) {
  console.log('Deja present, rien a faire.');
  process.exit(0);
}

const uniqueMarker = 'habCodes.some(h => h.includes(p.code) || p.code.includes(h.slice(0,4)))';
const idxMarker = content.indexOf(uniqueMarker);
if (idxMarker === -1) { console.log('ERREUR: uniqueMarker introuvable'); process.exit(1); }

const newCode = 'p.code === "PPRCI" || p.code === "PPAR" ||\n      ' + uniqueMarker;
content = content.slice(0, idxMarker) + newCode + content.slice(idxMarker + uniqueMarker.length);

fs.writeFileSync(path, content, 'utf8');
console.log('OK - PPRCI/PPAR toujours visibles, peu importe les habilitations');
