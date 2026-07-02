// patch_bulletin_36_fix_call_deroule.js
// Corrige l'appel à parseDeroulePrevisionnel dans BulletinImportButton :
// utilise extraireItemsPdfAvecPositions(b64) au lieu de text.
// Exécution : node patch_bulletin_36_fix_call_deroule.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('extraireItemsPdfAvecPositions(b64)')) {
  console.log('⚠️  Appel déjà corrigé — aucune modification appliquée.');
  process.exit(0);
}

// Repère stable : chercher parseDeroulePrevisionnel(text) dans le contexte isDeroule
const START = 'function parseDeroulePrevisionnel(items) {';
const CALL  = 'const res = parseDeroulePrevisionnel(text);';

const callIdx = content.indexOf(CALL);
if (callIdx === -1) throw new Error("Appel parseDeroulePrevisionnel(text) introuvable.");

// Vérifier qu'on est bien dans le bloc isDeroule (pas dans la définition)
const defIdx = content.indexOf(START);
if (callIdx > defIdx) {
  throw new Error("L'appel est après la définition — structure inattendue.");
}

const before = content.slice(0, callIdx);
const after  = content.slice(callIdx + CALL.length);

const newCall = `// Pour le déroulé : extraction avec positions x pour assignation correcte des colonnes
          const items = await extraireItemsPdfAvecPositions(b64);
          const res = parseDeroulePrevisionnel(items);`;

content = before + newCall + after;
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : parseDeroulePrevisionnel() appelé avec items (positions x).');
