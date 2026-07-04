// Patch 1/5 — Annuaire : monte la route /api/annuaire dans server.js
// Usage : node patch_annuaire_1_server_mount.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp\api\api

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'server.js');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error(`[${label}] Ancre introuvable dans ${FILE}`);
  if (count > 1) throw new Error(`[${label}] Ancre trouvée ${count} fois (doit être unique) dans ${FILE}`);
  return content.replace(oldStr, newStr);
}

let content = fs.readFileSync(FILE).toString('utf-8');

const old1 = "app.use('/api/journee-speciale-notes', require('./src/routes/journeeSpecialeNotes'));";
const new1 = old1 + "\napp.use('/api/annuaire',      require('./src/routes/annuaire'));";
content = mustReplaceOnce(content, old1, new1, 'mount-annuaire-route');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — server.js patché (route /api/annuaire montée)');
