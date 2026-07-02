// patch_bulletin_44_fix_code_validation.js
// Deux corrections dans parseDeroulePrevisionnel :
// 1. Revenir à l'incrément systématique du compteur (même pour les entrées vides),
//    car les jours vides (descente de nuit) doivent "consommer" leur slot calendrier
//    pour que les entrées suivantes du même (DayAbbr, Num) aillent au bon mois.
// 2. Valider que le code capturé est un vrai code planning (PI*, PA*, RP, RU, CA,
//    DISPO, F*) et PAS une abréviation de jour (Ve, Lu, Ma...) — artefact fréquent
//    dans le texte extrait (ex: "Ma ig Ve" → capturé comme (Ma, 1, 'Ve')).

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// ── 1. Revert : remettre l'incrément AVANT le check c1 ──
const oldBlock43 =
`    const c1 = normaliseCode(c1Raw);
    if (!c1) continue; // pas de code = descente de nuit ou vide → skip AVANT d'incrémenter

    const idx = (usedCounts[key] || 0) % candidates.length;
    usedCounts[key] = (usedCounts[key] || 0) + 1;
    const mm = candidates[idx];`;

if (!content.includes(oldBlock43)) {
  throw new Error("Bloc patch 43 introuvable — vérifier l'état du fichier.");
}

const newBlock44 =
`    const idx = (usedCounts[key] || 0) % candidates.length;
    usedCounts[key] = (usedCounts[key] || 0) + 1; // toujours incrémenter (même vide = consomme le slot)
    const mm = candidates[idx];

    const c1 = normaliseCode(c1Raw);
    // Valider que c1 est un vrai code planning (rejette les abréviations de jours
    // capturées par erreur comme codes : Ve, Lu, Ma, Me, Je, Sa, Di)
    const DAY_ABBRS_SET = new Set(["Je","Ve","Sa","Di","Lu","Ma","Me"]);
    const CODE_VALID = /^(RP|RU|RQ|CA|C|DISPO|F[0-9V]|F-[A-Z]{2,}|PI[A-Z0-9-]{2,}|PA[A-Z0-9-]{2,})$/;
    if (!c1 || DAY_ABBRS_SET.has(c1) || !CODE_VALID.test(c1)) continue;`;

content = content.replace(oldBlock43, newBlock44);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : incrément systématique restauré + validation code planning ajoutée.');
