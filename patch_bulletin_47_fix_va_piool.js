// patch_bulletin_47_fix_va_piool.js
// Deux corrections dans parseDeroulePrevisionnel :
// 1. Ajouter "Va" (corruption de "Ve") dans la regex des abréviations de jours
// 2. Étendre la normalisation pour couvrir PIOOL→PICCL (double C→O)
//    et PICOL→PICCL (inversion de l'O et du C)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// ── 1. Ajouter Va dans la regex des entrées ──
const oldDayRe = `const DAY_RE = /(Je|Ve|Sa|Di|Lu|Ma|Me)\\\\s+(\\\\d+|[IiSs5])(?:\\\\s+([A-Z][A-Z0-9-]+)(?:\\\\s+([A-Z][A-Z0-9-]+))?)?/g;`;
const newDayRe = `const DAY_RE = /(Je|Ve|Va|Sa|Di|Dl|Lu|Ma|Me)\\\\s+(\\\\d+|[IiSs5])(?:\\\\s+([A-Z][A-Z0-9-]+)(?:\\\\s+([A-Z][A-Z0-9-]+))?)?/g;`;

if (!content.includes(oldDayRe)) throw new Error("DAY_RE introuvable.");
content = content.replace(oldDayRe, newDayRe);
console.log('✅ Va et Dl ajoutés dans DAY_RE.');

// Aussi normaliser Va→Ve et Dl→Di dans l'extraction de l'abbr
const oldAbbrExtract = `      const [, abbr, numRaw, c1Raw, c2Raw] = m;`;
if (content.includes(oldAbbrExtract)) {
  const newAbbrExtract = `      let [, abbr, numRaw, c1Raw, c2Raw] = m;
      if (abbr === "Va") abbr = "Ve"; // Va = corruption de Ve (Vendredi)
      if (abbr === "Dl") abbr = "Di"; // Dl = corruption de Di (Dimanche)`;
  content = content.replaceAll(oldAbbrExtract, newAbbrExtract);
  console.log('✅ Normalisation Va→Ve et Dl→Di ajoutée.');
}

// ── 2. Améliorer normalisation des codes PICCL corrompus ──
const oldNorm = `    c = c.replace(/P[IO]OCL/g, "PICCL"); c = c.replace(/P[IO]CCL/g, "PICCL");`;
if (!content.includes(oldNorm)) throw new Error("Normalisation PICCL introuvable.");

// P[IO][CO][CO]L couvre toutes les combinaisons : PICCL, PIOCL, PICOL, PIOOL
const newNorm = `    c = c.replace(/P[IO][CO][CO]L/g, "PICCL"); // couvre PICCL, PIOCL, PICOL, PIOOL (corruptions C→O)`;
content = content.replaceAll(oldNorm, newNorm);
console.log('✅ Normalisation PICCL étendue (PIOOL, PICOL, PIOCL → PICCL).');

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : Va→Ve, PIOOL→PICCL corrigés.');
