const fs = require('fs');
const path = 'src/components/AdminPanel.jsx';
let content = fs.readFileSync(path, 'utf8');

// ETAPE 1 : ajouter onAgentsChanged a la signature
const anchor1 = 'export default function AdminPanel({ currentUser }) {';
const idx1 = content.indexOf(anchor1);
if (idx1 === -1) {
  console.log('ERREUR: anchor1 introuvable (deja modifie ?)');
} else {
  const new1 = 'export default function AdminPanel({ currentUser, onAgentsChanged }) {';
  content = content.slice(0, idx1) + new1 + content.slice(idx1 + anchor1.length);
  console.log('Etape 1 OK - onAgentsChanged ajoute a la signature');
}

// ETAPE 2 : appeler onAgentsChanged apres handleCreate (juste apres charger())
const idxHandleCreate = content.indexOf('async function handleCreate(data) {');
if (idxHandleCreate === -1) { console.log('ERREUR: handleCreate introuvable'); process.exit(1); }
const idxChargerInCreate = content.indexOf('charger();', idxHandleCreate);
if (idxChargerInCreate === -1) { console.log('ERREUR: charger() dans handleCreate introuvable'); process.exit(1); }
const insertAt2 = idxChargerInCreate + 'charger();'.length;
content = content.slice(0, insertAt2) + '\n      onAgentsChanged?.();' + content.slice(insertAt2);
console.log('Etape 2 OK - onAgentsChanged appele apres creation');

// ETAPE 3 : appeler onAgentsChanged apres handleDelete (juste apres charger())
const idxHandleDelete = content.indexOf('async function handleDelete(agent) {');
if (idxHandleDelete === -1) { console.log('ERREUR: handleDelete introuvable'); process.exit(1); }
const idxChargerInDelete = content.indexOf('charger();', idxHandleDelete);
if (idxChargerInDelete === -1) { console.log('ERREUR: charger() dans handleDelete introuvable'); process.exit(1); }
const insertAt3 = idxChargerInDelete + 'charger();'.length;
content = content.slice(0, insertAt3) + '\n      onAgentsChanged?.();' + content.slice(insertAt3);
console.log('Etape 3 OK - onAgentsChanged appele apres suppression');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
