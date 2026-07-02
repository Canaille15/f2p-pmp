// patch_bulletin_41_deroule_calendrier.js
// Approche finale : résolution par CALENDRIER.
// Pour chaque entrée (DayAbbr, Num, Code) extraite du texte :
// - Le calendrier donne la liste des mois où ce jour tombe sur ce DayAbbr
// - On assigne les occurrences dans l'ordre du texte aux mois candidats
// Aucun besoin de positions x, de colonnes, ni d'accumulateur.
// Revient à parseDeroulePrevisionnel(text) — plus besoin d'items.

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// ── 1. Remettre l'appel sur parseDeroulePrevisionnel(text) ──
if (content.includes('const items = await extraireItemsPdfAvecPositions(b64);\n          const res = parseDeroulePrevisionnel(items);')) {
  content = content.replace(
    'const items = await extraireItemsPdfAvecPositions(b64);\n          const res = parseDeroulePrevisionnel(items);',
    'const res = parseDeroulePrevisionnel(text);'
  );
  console.log('✅ Appel restauré sur parseDeroulePrevisionnel(text).');
}

// ── 2. Remplacer parseDeroulePrevisionnel ──
const START = 'function parseDeroulePrevisionnel(';
const END   = '\nfunction BulletinImportButton';
const si = content.indexOf(START);
const ei = content.indexOf(END);
if (si === -1) throw new Error("parseDeroulePrevisionnel introuvable.");
if (ei === -1) throw new Error("BulletinImportButton introuvable.");

const newFn = `function parseDeroulePrevisionnel(text) {
  // Date d'édition
  const editionMatch = text.match(/Le\\s*(\\d{2})[/1](\\d{2})[/1](\\d{4})/i);
  const editionDate = editionMatch
    ? \`\${editionMatch[3]}-\${editionMatch[2]}-\${editionMatch[1]} 00:00:00\`
    : null;

  // Année des données : la plus fréquente parmi MM/AAAA
  const yearCounts = {};
  for (const m of text.matchAll(/(\\d{2})\\/(\\d{4})/g)) {
    yearCounts[m[2]] = (yearCounts[m[2]] || 0) + 1;
  }
  const annee = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    || String(new Date().getFullYear());
  const year = parseInt(annee, 10);

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

  // Ordre des colonnes depuis les en-têtes (pour trier les candidats ambigus)
  const noteIdx = text.search(/Note\\s+explicative/i);
  const cleanText = noteIdx > 0 ? text.slice(0, noteIdx) : text;
  const sepMatch = cleanText.search(/_{6,}/);
  const sepEnd = sepMatch >= 0 ? cleanText.indexOf("\\n", sepMatch) : -1;
  const t1Full = sepEnd > 0 ? text.slice(0, text.indexOf("\\n", text.search(/_{6,}/))) : text;
  const t2Full = sepEnd > 0 ? text.slice(text.indexOf("\\n", text.search(/_{6,}/))) : "";

  const detectOrdre = t => {
    const re = new RegExp("(\\\\d{2})\\\\/" + annee, "g");
    const seen = new Set(); const ordre = []; let m;
    while ((m = re.exec(t)) !== null) {
      const mm = m[1]; const n = parseInt(mm, 10);
      if (!seen.has(mm) && n >= 1 && n <= 12) { seen.add(mm); ordre.push(mm); }
    }
    return ordre;
  };
  const completer = (det, exp) => { const r=[...det]; for (const mm of exp) if(!r.includes(mm)) r.push(mm); return r; };
  const ord1 = completer(detectOrdre(t1Full), ["01","02","03","04","05","06"]);
  const ord2 = completer(detectOrdre(t2Full), ["07","08","09","10","11","12"]);
  const fullColOrder = [...ord1, ...ord2];

  // Construire le calendrier : (DayAbbr_DayNum) → liste de mois (triés par ordre colonne)
  const ABBR_FROM_DAY = ["Di","Lu","Ma","Me","Je","Ve","Sa"]; // 0=Dim, 1=Lun...
  const candidatesMap = {}; // "Ve_1" → ["05", "07"]
  for (let month = 1; month <= 12; month++) {
    const mm = String(month).padStart(2, "0");
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month - 1, day);
      const abbr = ABBR_FROM_DAY[d.getDay()];
      const key = \`\${abbr}_\${day}\`;
      if (!candidatesMap[key]) candidatesMap[key] = [];
      candidatesMap[key].push(mm);
    }
  }
  // Trier les candidats de chaque clé selon l'ordre des colonnes du déroulé
  for (const key in candidatesMap) {
    candidatesMap[key].sort((a, b) => {
      const ia = fullColOrder.indexOf(a);
      const ib = fullColOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }

  // Extraire toutes les entrées du texte en ordre d'apparition
  const DAY_RE = /(Je|Ve|Sa|Di|Lu|Ma|Me)\\s+(\\d+|[IiSs5])(?:\\s+([A-Z][A-Z0-9-]+)(?:\\s+([A-Z][A-Z0-9-]+))?)?/g;
  const SPECIAL = new Set(["RP","RU","RQ","CA","C","DISPO"]);

  const usedCounts = {}; // "Ve_1" → nombre d'occurrences déjà traitées
  const seen = new Set();
  const jours = [];
  let m;

  while ((m = DAY_RE.exec(text)) !== null) {
    const [, abbr, numRaw, c1Raw, c2Raw] = m;
    const num = normaliseNum(numRaw);
    if (!/^\\d+$/.test(num)) continue;
    const dayNum = parseInt(num, 10);
    if (dayNum < 1 || dayNum > 31) continue;

    const key = \`\${abbr}_\${dayNum}\`;
    const candidates = candidatesMap[key];
    if (!candidates || candidates.length === 0) continue;

    const idx = (usedCounts[key] || 0) % candidates.length;
    usedCounts[key] = (usedCounts[key] || 0) + 1;
    const mm = candidates[idx];

    const c1 = normaliseCode(c1Raw);
    if (!c1) continue; // pas de code = descente de nuit ou vide → skip

    const day = String(dayNum).padStart(2, "0");
    const dateJour = \`\${annee}-\${mm}-\${day}\`;
    if (seen.has(dateJour)) continue;
    seen.add(dateJour);

    const eq1 = deriveCodeEquipeBulletin(c1, null);
    const sp1 = SPECIAL.has(c1) || /^F[0-9V]$/.test(c1) || /^F-[A-Z]+$/.test(c1);
    const h1 = getHoraires(eq1);
    const periodes = [{
      code_equipe: eq1, code_poste: sp1 ? null : c1,
      heure_debut: h1.heure_debut, heure_fin: h1.heure_fin, ordre: 1,
    }];

    const c2 = normaliseCode(c2Raw);
    if (c2) {
      const eq2 = deriveCodeEquipeBulletin(c2, null);
      const sp2 = SPECIAL.has(c2);
      const h2 = getHoraires(eq2);
      periodes.push({
        code_equipe: eq2, code_poste: sp2 ? null : c2,
        heure_debut: h2.heure_debut, heure_fin: h2.heure_fin, ordre: 2,
      });
    }

    jours.push({ date_jour: dateJour, periodes, source_edition_date: editionDate });
  }

  return { editionDate, jours, echecs: [] };
}

`;

content = content.slice(0, si) + newFn + content.slice(ei);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : parseDeroulePrevisionnel final (résolution par calendrier).');
