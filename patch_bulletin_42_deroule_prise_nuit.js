// patch_bulletin_42_deroule_prise_nuit.js
// Ajoute un second passage dans parseDeroulePrevisionnel pour capturer les
// entrées de prise de nuit : dans le texte extrait, "Lu 2 RP PICCLX" est souvent
// fragmenté en "Lu 2" (sans code) + "RP PICCLX" (sans day abbr) sur des lignes séparées.
// Le second passage cherche les patterns "RP CodeNuit" ou "RU CodeNuit" isolés et les
// associe à la date précédente déjà trouvée pour cette position dans le texte.

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Repère stable : juste avant "return { editionDate, jours, echecs: [] };" dans le parser
const anchor = '  return { editionDate, jours, echecs: [] };\n}\n\nfunction BulletinImportButton';
const idx = content.indexOf(anchor);
if (idx === -1) throw new Error("Ancre return introuvable dans parseDeroulePrevisionnel.");

if (content.includes('SECOND_PASS_NUIT')) {
  console.log('⚠️  Second passage déjà présent — aucune modification.');
  process.exit(0);
}

const secondPass = `
  // SECOND_PASS_NUIT : récupérer les prises de nuit fragmentées
  // Pattern : "RP CodeNuit" ou "RU CodeNuit" seuls (sans day abbr) sur une ligne
  // → associer au même jour que l'entrée "DayAbbr Num" qui précède dans le texte
  const NUIT_ORPHAN_RE = /(?:^|\\n)(RP|RU)\\s+(PICC[A-Z0-9-]+|PICO[A-Z0-9-]+)/gm;
  const DAY_BEFORE_RE = /(Je|Ve|Sa|Di|Lu|Ma|Me)\\s+(\\d+|[IiSs5])/g;

  // Construire un index : pour chaque position dans le texte, quel est le dernier (abbr, dayNum)
  const dayPositions = []; // [{pos, abbr, dayNum}]
  let dm;
  DAY_BEFORE_RE.lastIndex = 0;
  while ((dm = DAY_BEFORE_RE.exec(text)) !== null) {
    const num = normaliseNum(dm[2]);
    if (!/^\\d+$/.test(num)) continue;
    const d = parseInt(num, 10);
    if (d < 1 || d > 31) continue;
    dayPositions.push({ pos: dm.index, abbr: dm[1], dayNum: d });
  }

  NUIT_ORPHAN_RE.lastIndex = 0;
  while ((m = NUIT_ORPHAN_RE.exec(text)) !== null) {
    const rpCode = m[1]; // "RP" ou "RU"
    const nuitCode = normaliseCode(m[2]);
    if (!nuitCode) continue;

    // Trouver le (abbr, dayNum) le plus proche AVANT cette position
    const pos = m.index;
    let closest = null;
    for (const dp of dayPositions) {
      if (dp.pos < pos && (!closest || dp.pos > closest.pos)) closest = dp;
    }
    if (!closest) continue;

    const { abbr, dayNum } = closest;
    const key = \`\${abbr}_\${dayNum}\`;
    const candidates = candidatesMap[key];
    if (!candidates || candidates.length === 0) continue;

    // Trouver le mois qui correspond — chercher la date déjà dans jours avec RP/vide
    // pour remplacer par RP+nuit, ou créer une nouvelle entrée
    for (const mm of candidates) {
      const day = String(dayNum).padStart(2, "0");
      const dateJour = \`\${annee}-\${mm}-\${day}\`;
      const existing = jours.find(j => j.date_jour === dateJour);
      if (existing) {
        // Ajouter la nuit en second période si pas déjà présente
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

content = content.slice(0, idx) + secondPass + content.slice(idx);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : second passage prise de nuit ajouté dans parseDeroulePrevisionnel.');
