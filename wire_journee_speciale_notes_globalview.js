const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('journeeSpecialeNotes={journeeSpecialeNotes}')) {
  console.log('Deja present, rien a faire.');
  process.exit(0);
}

// ETAPE 1 : appel CPS Officiel (premiere occurrence de previsionnelSignalements={[]} setPrevisionnelSignalements={()=>{}})
const anchor1 = 'previsionnelSignalements={[]} setPrevisionnelSignalements={()=>{}}';
const idx1 = content.indexOf(anchor1);
if (idx1 === -1) { console.log('ERREUR: anchor1 introuvable'); process.exit(1); }
const new1 = anchor1 + ' journeeSpecialeNotes={journeeSpecialeNotes} setJourneeSpecialeNotes={setJourneeSpecialeNotes}';
content = content.slice(0, idx1) + new1 + content.slice(idx1 + anchor1.length);
console.log('Etape 1 OK - journeeSpecialeNotes ajoute a l\'appel CPS Officiel');

// ETAPE 2 : appel Previsionnel
const anchor2 = 'previsionnelSignalements={previsionnelSignalements} setPrevisionnelSignalements={setPrevisionnelSignalements}/>}';
const idx2 = content.indexOf(anchor2);
if (idx2 === -1) { console.log('ERREUR: anchor2 introuvable'); process.exit(1); }
const new2 = 'previsionnelSignalements={previsionnelSignalements} setPrevisionnelSignalements={setPrevisionnelSignalements} journeeSpecialeNotes={journeeSpecialeNotes} setJourneeSpecialeNotes={setJourneeSpecialeNotes}/>}';
content = content.slice(0, idx2) + new2 + content.slice(idx2 + anchor2.length);
console.log('Etape 2 OK - journeeSpecialeNotes ajoute a l\'appel Previsionnel');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
