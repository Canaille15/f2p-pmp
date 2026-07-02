// patch_bulletin_26_debug_deroule.js
// Ajoute un console.log temporaire pour voir ce qui se passe dans BulletinImportButton
// lors de l'import du déroulé (texte extrait, isDeroule, erreur éventuelle).
// À retirer une fois le bug corrigé.
// Exécution : node patch_bulletin_26_debug_deroule.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('DEBUG_DEROULE_DETECT')) {
  console.log('⚠️  Log debug déroulé déjà présent.');
  process.exit(0);
}

// Repère : juste avant la détection isDeroule
const START = 'const isDeroule = /D.+roul.+Pr.+visionnel/i.test(text)';
const idx = content.indexOf(START);
if (idx === -1) throw new Error("Marqueur isDeroule introuvable.");

const before = content.slice(0, idx);
const after  = content.slice(idx);

const debugBlock = `console.log("DEBUG_DEROULE_DETECT", {
          textLen: text.length,
          textStart: text.slice(0, 200),
          isDerouleTest1: /D.+roul.+Pr.+visionnel/i.test(text),
          isDerouleTest2: /Affectations de l.agent/i.test(text),
        });
        `;

content = before + debugBlock + after;

// Ajouter un log dans le catch pour voir les erreurs silencieuses
const catchMarker = '} catch (err) {\n        setResult({ error: err.message });';
if (content.includes(catchMarker)) {
  content = content.replace(
    catchMarker,
    `} catch (err) {\n        console.error("DEBUG_DEROULE_ERROR", err);\n        setResult({ error: err.message });`
  );
  console.log('✅ Log d\'erreur ajouté dans le catch.');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : logs de diagnostic déroulé ajoutés (temporaire).');
