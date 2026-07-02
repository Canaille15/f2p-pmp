// patch_bulletin_43_fix_usedcounts.js
// Correction critique dans parseDeroulePrevisionnel :
// Le compteur usedCounts était incrémenté AVANT de vérifier si c1 est null,
// ce qui causait des décalages dans l'assignation des mois candidats.
// Ex : "Je I" (Jan 1, pas de code) incrémentait le compteur, puis "Je 1 PICCL-"
// (code présent) allait au SECOND candidat (Octobre) au lieu du premier (Janvier).
// Fix : incrémenter SEULEMENT quand c1 est présent.

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Ancre : le bloc d'assignation dans parseDeroulePrevisionnel
const oldBlock =
`    const key = \`\${abbr}_\${dayNum}\`;
    const candidates = candidatesMap[key];
    if (!candidates || candidates.length === 0) continue;

    const idx = (usedCounts[key] || 0) % candidates.length;
    usedCounts[key] = (usedCounts[key] || 0) + 1;
    const mm = candidates[idx];

    const c1 = normaliseCode(c1Raw);
    if (!c1) continue; // pas de code = descente de nuit ou vide → skip`;

const newBlock =
`    const key = \`\${abbr}_\${dayNum}\`;
    const candidates = candidatesMap[key];
    if (!candidates || candidates.length === 0) continue;

    const c1 = normaliseCode(c1Raw);
    if (!c1) continue; // pas de code = descente de nuit ou vide → skip AVANT d'incrémenter

    const idx = (usedCounts[key] || 0) % candidates.length;
    usedCounts[key] = (usedCounts[key] || 0) + 1;
    const mm = candidates[idx];`;

if (!content.includes(oldBlock)) {
  throw new Error("Bloc introuvable — vérifie que patch_bulletin_41 a bien été appliqué.");
}

content = content.replace(oldBlock, newBlock);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : usedCounts incrémenté seulement quand c1 est présent.');
