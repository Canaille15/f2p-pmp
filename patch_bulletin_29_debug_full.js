// patch_bulletin_29_debug_full.js
// Remplace le log DEBUG_DEROULE_DETECT par un dump complet (texte entier + flat list
// du parseur) pour voir exactement ce que pdfjs extrait et combien d'entrées sont détectées.
// Exécution : node patch_bulletin_29_debug_full.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Retirer l'ancien debug si présent
if (content.includes('DEBUG_DEROULE_DETECT')) {
  const oldDebug = `console.log("DEBUG_DEROULE_DETECT", {
          textLen: text.length,
          textStart: text.slice(0, 200),
          isDerouleTest1: /D.+roul.+Pr.+visionnel/i.test(text),
          isDerouleTest2: /Affectations de l.agent/i.test(text),
        });
        `;
  content = content.replace(oldDebug, '');
  console.log('✅ Ancien log DEBUG_DEROULE_DETECT retiré.');
}

// Retirer l'ancien log d'erreur
if (content.includes('console.error("DEBUG_DEROULE_ERROR"')) {
  content = content.replace(
    'console.error("DEBUG_DEROULE_ERROR", err);\n        ',
    ''
  );
  console.log('✅ Ancien log DEBUG_DEROULE_ERROR retiré.');
}

// Ajouter un log complet DANS parseDeroulePrevisionnel, juste avant le return final
const anchor = '  return { editionDate, jours: joursUniques, echecs: [] };';
const idx = content.indexOf(anchor);
if (idx === -1) throw new Error("Ancre return dans parseDeroulePrevisionnel introuvable.");

if (!content.includes('DEBUG_DEROULE_FULL')) {
  const debugBlock = `  console.log("DEBUG_DEROULE_FULL", {
    textFull: text,
    bloc2Idx: text.indexOf("07/" + annee),
    joursCount: joursUniques.length,
  });
  `;
  content = content.slice(0, idx) + debugBlock + content.slice(idx);
  console.log('✅ Log DEBUG_DEROULE_FULL ajouté dans parseDeroulePrevisionnel.');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour.');
