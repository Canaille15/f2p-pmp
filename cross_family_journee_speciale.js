const fs = require('fs');
const path = 'src/components/DayEditPopup.jsx';
let content = fs.readFileSync(path, 'utf8');

// ETAPE 1 : simplifier le libelle PPAR
const anchor1 = '{code:"PPAR", label:"PPAR (journee speciale)", types:["J"]},';
const idx1 = content.indexOf(anchor1);
if (idx1 === -1) {
  console.log('Etape 1: deja simplifie ou introuvable, on ignore');
} else {
  const new1 = '{code:"PPAR", label:"PPAR", types:["J"]},';
  content = content.slice(0, idx1) + new1 + content.slice(idx1 + anchor1.length);
  console.log('Etape 1 OK - libelle PPAR simplifie');
}

// ETAPE 2 : ajouter PPAR dans POSTES_PRCI (pour que les agents PRCI le voient aussi)
if (content.includes('PPAR (croise PRCI)') || (content.match(/code:"PPAR"/g) || []).length >= 2) {
  console.log('Etape 2: deja present dans les deux listes, on ignore');
} else {
  const anchor2 = '{code:"PPRCI",label:"PPRCI",       types:["J","M","AM"]},';
  const idx2 = content.indexOf(anchor2);
  if (idx2 === -1) { console.log('ERREUR: anchor2 introuvable'); process.exit(1); }
  const new2 = anchor2 + '\n  {code:"PPAR", label:"PPAR", types:["J"]},';
  content = content.slice(0, idx2) + new2 + content.slice(idx2 + anchor2.length);
  console.log('Etape 2 OK - PPAR ajoute dans POSTES_PRCI');

  // ETAPE 3 : ajouter PPRCI dans POSTES_PAR (pour que les agents PAR le voient aussi)
  const anchor3 = '{code:"PPAR", label:"PPAR", types:["J"]},';
  const idx3 = content.lastIndexOf(anchor3); // la version dans POSTES_PAR (deja simplifiee a l'etape 1)
  if (idx3 === -1) { console.log('ERREUR: anchor3 introuvable'); process.exit(1); }
  const new3 = anchor3 + '\n  {code:"PPRCI", label:"PPRCI", types:["J"]},';
  content = content.slice(0, idx3) + new3 + content.slice(idx3 + anchor3.length);
  console.log('Etape 3 OK - PPRCI ajoute dans POSTES_PAR');
}

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
