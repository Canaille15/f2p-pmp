// patch_bulletin_33_dump_texte.js
// Ajoute un console.log qui dump le texte COMPLET extrait du déroulé,
// pour analyser la vraie structure et corriger le parser.
// Exécution : node patch_bulletin_33_dump_texte.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('DUMP_TEXTE_COMPLET')) {
  console.log('⚠️  Log déjà présent.');
  process.exit(0);
}

// Insérer juste après isDeroule = true
const anchor = 'const isDeroule = /D.+roul.+Pr.+visionnel/i.test(text)';
const idx = content.indexOf(anchor);
if (idx === -1) throw new Error("Ancre isDeroule introuvable.");

const insertion = `console.log("DUMP_TEXTE_COMPLET", JSON.stringify(text));
        `;

content = content.slice(0, idx) + insertion + content.slice(idx);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : log DUMP_TEXTE_COMPLET ajouté.');
