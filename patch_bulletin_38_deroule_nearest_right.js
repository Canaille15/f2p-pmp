// patch_bulletin_38_deroule_nearest_right.js
// Correction critique dans parseDeroulePrevisionnel :
// - Au lieu de prendre its[i+1] (item suivant), cherche le NUM le plus proche à DROITE
//   du DayAbbr dans la même ligne (ex: "Ve PICCL- 1" → cherche "1" à droite de "Ve")
// - Tolérance y élargie de ±3 à ±5 pour mieux regrouper les items d'une même ligne visuelle
// - Code cherché à droite du NUM (pas forcément immédiatement après)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

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

  // Grouper par ligne avec tolérance ±5 (élargie pour mieux capturer les items proches)
  const rows = [];
  for (const item of items) {
    const row = rows.find(r => Math.abs(r.y - item.y) <= 5);
    if (row) { row.items.push(item); }
    else { rows.push({ y: item.y, items: [item] }); }
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  rows.sort((a, b) => b.y - a.y);

  // Colonnes depuis les en-têtes MM/AAAA
  const MONTH_RE = new RegExp("^(\\\\d{2})\\\\/" + annee + "$");
  const colItems = [];
  for (const row of rows) {
    for (const item of row.items) {
      if (MONTH_RE.test(item.text)) {
        const mm = item.text.slice(0, 2);
        if (!colItems.find(c => c.mm === mm)) colItems.push({ mm, x: item.x, y: item.y });
      }
    }
  }
  if (colItems.length < 2) return { editionDate, jours: [], echecs: [] };

  const yMid = (Math.max(...colItems.map(c => c.y)) + Math.min(...colItems.map(c => c.y))) / 2;
  const bloc1Cols = colItems.filter(c => parseInt(c.mm, 10) <= 6).sort((a, b) => a.x - b.x);
  const bloc2Cols = colItems.filter(c => parseInt(c.mm, 10) >= 7).sort((a, b) => a.x - b.x);

  const DAY_ABBRS = new Set(["Je","Ve","Sa","Di","Lu","Ma","Me"]);
  const NUM_RE = /^(\\d+|[IiSs5])$/;
  const CODE_RE_STR = /^[A-Z][A-Z0-9-]{2,}$/; // au moins 2 chars pour éviter "I", "S" etc.
  const SPECIAL = new Set(["RP","RU","RQ","CA","C","DISPO"]);

  const grid = {};

  for (const row of rows) {
    const its = row.items;
    for (let i = 0; i < its.length; i++) {
      const item = its[i];
      if (!DAY_ABBRS.has(item.text)) continue;

      // Chercher le NUM le plus proche à DROITE du DayAbbr dans la même ligne
      // (pas forcément its[i+1] — il peut y avoir un code entre les deux)
      let numItem = null;
      for (let j = i + 1; j < its.length; j++) {
        if (!NUM_RE.test(its[j].text)) continue;
        if (its[j].x > item.x && its[j].x < item.x + 35) {
          numItem = its[j]; break;
        }
        if (its[j].x >= item.x + 35) break; // trop loin → stop
      }
      if (!numItem) continue;

      const numStr = normaliseNum(numItem.text);
      if (!/^\\d+$/.test(numStr)) continue;
      const dayNum = parseInt(numStr, 10);
      if (dayNum < 1 || dayNum > 31) continue;

      // Chercher le CODE le plus proche à droite du NUM
      let codeItem = null, code2Item = null;
      for (let j = its.indexOf(numItem) + 1; j < its.length; j++) {
        const t = its[j];
        if (t.x <= numItem.x) continue;
        if (t.x > numItem.x + 60) break;
        if (!CODE_RE_STR.test(t.text) || NUM_RE.test(t.text) || DAY_ABBRS.has(t.text)) continue;
        if (!codeItem) { codeItem = t; continue; }
        if (!code2Item) { code2Item = t; break; }
      }

      const code1 = codeItem ? normaliseCode(codeItem.text) : null;
      const code2 = code2Item ? normaliseCode(code2Item.text) : null;

      // Assigner à la colonne par x
      const isBloc1 = row.y >= yMid;
      const cols = isBloc1 ? bloc1Cols : bloc2Cols;
      if (cols.length === 0) continue;

      let bestCol = 0, bestDist = Infinity;
      for (let j = 0; j < cols.length; j++) {
        const d = Math.abs(item.x - cols[j].x);
        if (d < bestDist) { bestDist = d; bestCol = j; }
      }

      const mm = cols[bestCol].mm;
      const key = \`\${mm}_\${dayNum}\`;
      if (!grid[key] && code1) {
        grid[key] = { mm, dayNum, code1, code2 };
      }
    }
  }

  const jours = [];
  for (const { mm, dayNum, code1, code2 } of Object.values(grid)) {
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
console.log('✅ App.jsx mis à jour : parseDeroulePrevisionnel v8 (nearest-right NUM, y-tolerance ±5).');
