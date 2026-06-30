const fs = require('fs');
const path = 'server.js';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('journee-speciale-notes')) {
  console.log('Deja monte, rien a faire.');
  process.exit(0);
}

const anchor = "app.use('/api/previsionnel-signalements', require('./src/routes/previsionnelSignalements'));";
const idx = content.indexOf(anchor);
if (idx === -1) {
  console.log('ERREUR: anchor introuvable');
  process.exit(1);
}

const newLine = anchor + "\napp.use('/api/journee-speciale-notes', require('./src/routes/journeeSpecialeNotes'));";
content = content.slice(0, idx) + newLine + content.slice(idx + anchor.length);
fs.writeFileSync(path, content, 'utf8');
console.log('OK - route journee-speciale-notes montee');
