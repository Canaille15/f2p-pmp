// patch_bulletin_39_dump_items.js
// Ajoute un log qui dump les 50 premiers items pdfjs (x, y, text) du déroulé
// pour voir les vraies coordonnées et calibrer le parser.
// Exécution : node patch_bulletin_39_dump_items.js (depuis la racine)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const anchor = 'const items = await extraireItemsPdfAvecPositions(b64);';
const idx = content.indexOf(anchor);
if (idx === -1) throw new Error("Ancre introuvable.");

if (content.includes('DUMP_ITEMS_BRUTS')) {
  console.log('⚠️  Log déjà présent.');
  process.exit(0);
}

const insertion = `const items = await extraireItemsPdfAvecPositions(b64);
          console.log("DUMP_ITEMS_BRUTS", JSON.stringify(items.slice(0, 80).map(i => ({x: Math.round(i.x), y: Math.round(i.y), t: i.text}))));`;

content = content.replace(anchor, insertion);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Log DUMP_ITEMS_BRUTS ajouté.');
