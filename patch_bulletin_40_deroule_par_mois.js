// patch_bulletin_40_deroule_par_mois.js
// Approche simple et définitive : traiter UN MOIS À LA FOIS.
// On connaît le x de chaque colonne (depuis les en-têtes MM/AAAA).
// Pour chaque mois : filtrer les items par x dans la plage de cette colonne,
// trier par y (haut→bas), lire DayAbbr + Num + Code dans l'ordre.
// Aucun problème de mélange entre colonnes ni de lignes fragmentées.

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Retirer le log DUMP_ITEMS_BRUTS si présent
if (content.includes('DUMP_ITEMS_BRUTS')) {
  content = content.replace(
    `const items = await extraireItemsPdfAvecPositions(b64);\n          console.log("DUMP_ITEMS_BRUTS", JSON.stringify(items.slice(0, 80).map(i => ({x: Math.round(i.x), y: Math.round(i.y), t: i.text}))));\n`,
    `const items = await extraireItemsPdfAvecPositions(b64);\n`
  );
  console.log('✅ Log DUMP_ITEMS_BRUTS retiré.');
}

const START = 'function parseDeroulePrevisionnel(items) {';
const END   = '\nfunction BulletinImportButton';
const si = content.indexOf(START);
const ei = content.indexOf(END);
if (si === -1) throw new Error("parseDeroulePrevisionnel introuvable.");
if (ei === -1) throw new Error("BulletinImportButton introuvable.");

const newFn = `function parseDeroulePrevisionnel(items) {
  const text = items.map(i => i.text).join(" ");

  const editionMatch = text.match(/Le\\s*(\\d{2})[/1](\\d{2})[/1](\\d{4})/i);
  const editionDate = editionMatch
    ? \`\${editionMatch[3]}-\${editionMatch[2]}-\${editionMatch[1]} 00:00:00\`
    : null;

  const yearCounts = {};
  for (const m of text.matchAll(/(\\d{2})\\/(\\d{4})/g)) {
    yearCounts[m[2]] = (yearCounts[m[2]] || 0) + 1;
  }
  const annee = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    || String(new Date().getFullYear());

  const normaliseNum = n => n.replace(/[Ii]/g, "1").replace(/[Ss]/g, "5");
  const normaliseCode = c => {
    if (!c) return null; c = c.trim();
    c = c.replace(/\\bHP\\b/g, "RP");
    c = c.replace(/P[IO]OCL/g, "PICCL"); c = c.replace(/P[IO]CCL/g, "PICCL");
    c = c.replace(/ccx/gi, "PICCLX"); c = c.replace(/^(F-)\\s+/, "$1");
    return c || null;
  };
  const getHoraires = eq => {
    const e = EQ[eq];
    if (!e?.heures) return { heure_debut: null, heure_fin: null };
    const mh = e.heures.match(/(\\d{2})h(\\d{2}).(\\d{2})h(\\d{2})/);
    if (!mh) return { heure_debut: null, heure_fin: null };
    return { heure_debut: \`\${mh[1]}:\${mh[2]}:00\`, heure_fin: \`\${mh[3]}:\${mh[4]}:00\` };
  };

  // Trouver les en-têtes MM/AAAA et leur position x
  const MONTH_RE = new RegExp("^(\\\\d{2})\\\\/" + annee + "$");
  const colMap = {}; // mm → x
  for (const item of items) {
    if (MONTH_RE.test(item.text)) {
      const mm = item.text.slice(0, 2);
      if (!colMap[mm]) colMap[mm] = item.x;
    }
  }
  const moisListe = Object.keys(colMap).sort((a, b) => parseInt(a) - parseInt(b));
  if (moisListe.length < 2) return { editionDate, jours: [], echecs: [] };

  // Trier les mois par x pour déterminer les plages de colonnes
  const moisParX = moisListe.map(mm => ({ mm, x: colMap[mm] })).sort((a, b) => a.x - b.x);

  // Calculer la plage x de chaque colonne (milieu entre colonnes adjacentes ±marge)
  const getXRange = (idx) => {
    const xCurrent = moisParX[idx].x;
    const xPrev = idx > 0 ? moisParX[idx - 1].x : xCurrent - 60;
    const xNext = idx < moisParX.length - 1 ? moisParX[idx + 1].x : xCurrent + 60;
    const xMin = (xCurrent + xPrev) / 2;
    const xMax = (xCurrent + xNext) / 2;
    return { xMin, xMax };
  };

  const DAY_ABBRS = new Set(["Je","Ve","Sa","Di","Lu","Ma","Me"]);
  const NUM_RE_CHECK = /^(\\d{1,2}|[IiSs5])$/;
  const CODE_RE_CHECK = /^[A-Z][A-Z0-9-]{2,}$/;
  const SPECIAL = new Set(["RP","RU","RQ","CA","C","DISPO"]);

  const jours = [];

  // Traiter un mois à la fois
  for (let colIdx = 0; colIdx < moisParX.length; colIdx++) {
    const mm = moisParX[colIdx].mm;
    const { xMin, xMax } = getXRange(colIdx);

    // Filtrer les items de cette colonne et les trier par y décroissant (haut → bas)
    const colItems = items
      .filter(i => i.x >= xMin && i.x <= xMax)
      .sort((a, b) => b.y - a.y);

    // Scanner : DayAbbr suivi d'un Num (proche en y et x), puis Code (optionnel)
    for (let i = 0; i < colItems.length; i++) {
      const item = colItems[i];
      if (!DAY_ABBRS.has(item.text)) continue;

      // Chercher le numéro de jour dans les items proches (y±8, x proche)
      let numItem = null;
      for (let j = i + 1; j < colItems.length && j < i + 6; j++) {
        const t = colItems[j];
        if (Math.abs(t.y - item.y) > 8) break;
        if (NUM_RE_CHECK.test(t.text)) { numItem = t; break; }
      }
      if (!numItem) continue;

      const numStr = normaliseNum(numItem.text);
      if (!/^\\d+$/.test(numStr)) continue;
      const dayNum = parseInt(numStr, 10);
      if (dayNum < 1 || dayNum > 31) continue;

      // Chercher le code dans les items proches après le numéro
      let code1 = null, code2 = null;
      const numIdx = colItems.indexOf(numItem);
      for (let j = numIdx + 1; j < colItems.length && j < numIdx + 5; j++) {
        const t = colItems[j];
        if (Math.abs(t.y - item.y) > 8) break;
        if (DAY_ABBRS.has(t.text)) break;
        if (CODE_RE_CHECK.test(t.text) && !NUM_RE_CHECK.test(t.text)) {
          if (!code1) { code1 = normaliseCode(t.text); continue; }
          if (!code2) { code2 = normaliseCode(t.text); break; }
        }
      }

      if (!code1) continue;

      const day = String(dayNum).padStart(2, "0");
      const dateJour = \`\${annee}-\${mm}-\${day}\`;
      const d = new Date(dateJour);
      if (isNaN(d.getTime()) || d.getMonth() + 1 !== parseInt(mm, 10)) continue;

      const eq1 = deriveCodeEquipeBulletin(code1, null);
      const sp1 = SPECIAL.has(code1) || /^F[0-9V]$/.test(code1) || /^F-[A-Z]+$/.test(code1);
      const h1 = getHoraires(eq1);
      const periodes = [{
        code_equipe: eq1, code_poste: sp1 ? null : code1,
        heure_debut: h1.heure_debut, heure_fin: h1.heure_fin, ordre: 1,
      }];

      if (code2) {
        const eq2 = deriveCodeEquipeBulletin(code2, null);
        const sp2 = SPECIAL.has(code2);
        const h2 = getHoraires(eq2);
        periodes.push({
          code_equipe: eq2, code_poste: sp2 ? null : code2,
          heure_debut: h2.heure_debut, heure_fin: h2.heure_fin, ordre: 2,
        });
      }

      jours.push({ date_jour: dateJour, periodes, source_edition_date: editionDate });
    }
  }

  const seen = new Set();
  const joursUniques = jours.filter(j => {
    if (seen.has(j.date_jour)) return false;
    seen.add(j.date_jour); return true;
  });

  return { editionDate, jours: joursUniques, echecs: [] };
}

`;

content = content.slice(0, si) + newFn + content.slice(ei);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : parseDeroulePrevisionnel v9 (un mois à la fois par plage x).');
