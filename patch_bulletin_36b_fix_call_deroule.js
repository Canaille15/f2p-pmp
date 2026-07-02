// patch_bulletin_36b_fix_call_deroule.js
// Corrige l'appel à parseDeroulePrevisionnel(text) → parseDeroulePrevisionnel(items)
// Exécution : node patch_bulletin_36b_fix_call_deroule.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('extraireItemsPdfAvecPositions(b64)')) {
  console.log('⚠️  Appel déjà corrigé — aucune modification appliquée.');
  process.exit(0);
}

const CALL = 'const res = parseDeroulePrevisionnel(text);';
const idx = content.indexOf(CALL);
if (idx === -1) throw new Error("Appel parseDeroulePrevisionnel(text) introuvable.");

const newCall = `const items = await extraireItemsPdfAvecPositions(b64);
          const res = parseDeroulePrevisionnel(items);`;

content = content.slice(0, idx) + newCall + content.slice(idx + CALL.length);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : parseDeroulePrevisionnel() appelé avec items (positions x).');
