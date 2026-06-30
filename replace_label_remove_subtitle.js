const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('label:"Pauseur CCL"')) {
  console.log('Deja modifie, rien a faire.');
  process.exit(0);
}

const replacements = [
  ['label:"Pauseur PA1", subtitle:"Pauseur CCL",', 'label:"Pauseur CCL",'],
  ['label:"Pauseur PA2", subtitle:"Pauseur Adjoint",', 'label:"Pauseur Adjoint",'],
  ['label:"Pauseur PA3", subtitle:"Pauseur VGD",', 'label:"Pauseur VGD",'],
];

replacements.forEach(([oldStr, newStr]) => {
  const idx = content.indexOf(oldStr);
  if (idx === -1) { console.log('ERREUR: motif introuvable: ' + oldStr); process.exit(1); }
  content = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
  console.log('OK - remplace: ' + oldStr.slice(0, 40) + '...');
});

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
