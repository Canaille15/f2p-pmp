// patch_bulletin_47b_fix_va_piool.js
// Corrections : Va→Ve dans DAY_RE + PIOOL→PICCL dans normaliseCode

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// ── 1. DAY_RE : ajouter Va et Dl ──
const oldDayRe = `const DAY_RE = /(Je|Ve|Sa|Di|Lu|Ma|Me)\\s+(\\d+|[IiSs5])(?:\\s+([A-Z][A-Z0-9-]+)(?:\\s+([A-Z][A-Z0-9-]+))?)?/g;`;
const newDayRe = `const DAY_RE = /(Je|Ve|Va|Sa|Di|Dl|Lu|Ma|Me)\\s+(\\d+|[IiSs5])(?:\\s+([A-Z][A-Z0-9-]+)(?:\\s+([A-Z][A-Z0-9-]+))?)?/g;`;

if (!content.includes(oldDayRe)) throw new Error("DAY_RE introuvable — ancre: " + oldDayRe.slice(0,50));

const count = content.split(oldDayRe).length - 1;
console.log(`DAY_RE trouvé ${count} fois`);
content = content.replaceAll(oldDayRe, newDayRe);
console.log('✅ Va et Dl ajoutés dans DAY_RE.');

// ── 2. Normaliser Va→Ve dans l'extraction de l'abbr (les deux processBloc) ──
const oldAbbrExtract = `      let [, abbr, numRaw, c1Raw, c2Raw] = m;
      if (abbr === "Va") abbr = "Ve"; // Va = corruption de Ve (Vendredi)
      if (abbr === "Dl") abbr = "Di"; // Dl = corruption de Di (Dimanche)`;

if (!content.includes(oldAbbrExtract)) {
  // Pas encore ajouté — on insère après chaque déstructuration
  const target = `      const [, abbr, numRaw, c1Raw, c2Raw] = m;`;
  if (!content.includes(target)) throw new Error("Déstructuration introuvable.");
  const replacement = `      let [, abbr, numRaw, c1Raw, c2Raw] = m;
      if (abbr === "Va") abbr = "Ve";
      if (abbr === "Dl") abbr = "Di";`;
  content = content.replaceAll(target, replacement);
  console.log('✅ Normalisation Va→Ve et Dl→Di ajoutée.');
}

// ── 3. Normalisation codes PICCL : couvrir PIOOL, PICOL ──
const oldNorm = `    c = c.replace(/P[IO]OCL/g, "PICCL"); c = c.replace(/P[IO]CCL/g, "PICCL");`;
const newNorm = `    c = c.replace(/P[IO][CO][CO]L/g, "PICCL");`;

if (!content.includes(oldNorm)) throw new Error("Normalisation PICCL introuvable.");
content = content.replaceAll(oldNorm, newNorm);
console.log('✅ Normalisation PICCL étendue (PIOOL, PICOL → PICCL).');

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour.');
