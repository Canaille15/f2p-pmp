// patch_bulletin_42b_deroule_prise_nuit.js
// Ajoute le second passage prise de nuit dans parseDeroulePrevisionnel
// en utilisant un repère stable (position entre les deux fonctions).

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('SECOND_PASS_NUIT')) {
  console.log('⚠️  Second passage déjà présent — aucune modification.');
  process.exit(0);
}

// Trouver la fin de parseDeroulePrevisionnel : juste avant "function BulletinImportButton"
const END_MARKER = '\nfunction BulletinImportButton';
const endIdx = content.indexOf(END_MARKER);
if (endIdx === -1) throw new Error("BulletinImportButton introuvable.");

// Remonter depuis endIdx pour trouver le "return { editionDate" le plus proche
const returnMarker = 'return { editionDate, jours, echecs: [] };';
const returnIdx = content.lastIndexOf(returnMarker, endIdx);
if (returnIdx === -1) throw new Error("return introuvable avant BulletinImportButton.");

const secondPass = `
  // SECOND_PASS_NUIT : récupérer les prises de nuit fragmentées
  // Pattern : "RP CodeNuit" ou "RU CodeNuit" seuls (sans day abbr) sur une ligne
  const NUIT_ORPHAN_RE = /(?:^|\\n)[ \\t]*(RP|RU)\\s+(PICC[A-Z0-9-]+|PICO[A-Z0-9-]+)/gm;
  const DAY_BEFORE_RE2 = /(Je|Ve|Sa|Di|Lu|Ma|Me)\\s+(\\d+|[IiSs5])/g;
  const dayPositions = [];
  let dm2;
  DAY_BEFORE_RE2.lastIndex = 0;
  while ((dm2 = DAY_BEFORE_RE2.exec(text)) !== null) {
    const num2 = normaliseNum(dm2[2]);
    if (!/^\\d+$/.test(num2)) continue;
    const d2 = parseInt(num2, 10);
    if (d2 < 1 || d2 > 31) continue;
    dayPositions.push({ pos: dm2.index, abbr: dm2[1], dayNum: d2 });
  }
  let mn2;
  NUIT_ORPHAN_RE.lastIndex = 0;
  while ((mn2 = NUIT_ORPHAN_RE.exec(text)) !== null) {
    const nuitCode = normaliseCode(mn2[2]);
    if (!nuitCode) continue;
    const pos2 = mn2.index;
    let closest = null;
    for (const dp of dayPositions) {
      if (dp.pos < pos2 && (!closest || dp.pos > closest.pos)) closest = dp;
    }
    if (!closest) continue;
    const key2 = \`\${closest.abbr}_\${closest.dayNum}\`;
    const cands2 = candidatesMap[key2];
    if (!cands2 || cands2.length === 0) continue;
    for (const mm2 of cands2) {
      const day2 = String(closest.dayNum).padStart(2, "0");
      const dateJour2 = \`\${annee}-\${mm2}-\${day2}\`;
      const existing = jours.find(j => j.date_jour === dateJour2);
      if (existing) {
        const hasNuit = existing.periodes.some(p => p.code_equipe === "N");
        if (!hasNuit) {
          const eq2 = deriveCodeEquipeBulletin(nuitCode, null);
          const h2 = getHoraires(eq2);
          existing.periodes.push({
            code_equipe: eq2, code_poste: nuitCode,
            heure_debut: h2.heure_debut, heure_fin: h2.heure_fin, ordre: 2,
          });
        }
        break;
      }
    }
  }

  `;

const before = content.slice(0, returnIdx);
const after  = content.slice(returnIdx);
content = before + secondPass + after;
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : second passage prise de nuit ajouté.');
