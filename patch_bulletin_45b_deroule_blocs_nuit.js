// patch_bulletin_45b_deroule_blocs_nuit.js
// Remplace parseDeroulePrevisionnel par la version finale avec :
// 1. Traitement par blocs séparés (candidats restreints 01-06 / 07-12)
// 2. Second passage prise de nuit : CRÉE l'entrée (RP+nuit) quand elle n'existe pas encore,
//    ou AJOUTE la nuit à une entrée RP existante

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const START = 'function parseDeroulePrevisionnel(text) {';
const END   = '\nfunction BulletinImportButton';
const si = content.indexOf(START);
const ei = content.indexOf(END);
if (si === -1) throw new Error("parseDeroulePrevisionnel introuvable.");
if (ei === -1) throw new Error("BulletinImportButton introuvable.");

const newFn = `function parseDeroulePrevisionnel(text) {
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

  // Séparer les deux blocs au séparateur "___"
  const sepIdx = text.search(/_{6,}/);
  const sepEnd = sepIdx >= 0 ? text.indexOf("\\n", sepIdx) : -1;
  const texteBloc1 = sepEnd > 0 ? text.slice(0, sepEnd) : text;
  const texteBloc2 = sepEnd > 0 ? text.slice(sepEnd) : "";

  const MOIS_BLOC1 = new Set(["01","02","03","04","05","06"]);
  const MOIS_BLOC2 = new Set(["07","08","09","10","11","12"]);

  const detectOrdre = (t, moisSet) => {
    const re = new RegExp("(\\\\d{2})\\\\/" + annee, "g");
    const seen = new Set(); const ordre = []; let m;
    while ((m = re.exec(t)) !== null) {
      const mm = m[1];
      if (!seen.has(mm) && moisSet.has(mm)) { seen.add(mm); ordre.push(mm); }
    }
    for (const mm of moisSet) { if (!ordre.includes(mm)) ordre.push(mm); }
    return ordre;
  };
  const ord1 = detectOrdre(text, MOIS_BLOC1);
  const ord2 = detectOrdre(text, MOIS_BLOC2);

  const ABBR_FROM_DAY = ["Di","Lu","Ma","Me","Je","Ve","Sa"];
  const buildCandidates = (moisSet, ordre) => {
    const map = {};
    for (const mm of moisSet) {
      const daysInMonth = new Date(year, parseInt(mm, 10), 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, parseInt(mm, 10) - 1, day);
        const abbr = ABBR_FROM_DAY[d.getDay()];
        const key = \`\${abbr}_\${day}\`;
        if (!map[key]) map[key] = [];
        map[key].push(mm);
      }
    }
    for (const key in map) {
      map[key].sort((a, b) => {
        const ia = ordre.indexOf(a), ib = ordre.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
    }
    return map;
  };
  const cmap1 = buildCandidates(MOIS_BLOC1, ord1);
  const cmap2 = buildCandidates(MOIS_BLOC2, ord2);

  const DAY_ABBRS = new Set(["Je","Ve","Sa","Di","Lu","Ma","Me"]);
  const CODE_VALID = /^(RP|RU|RQ|CA|C|DISPO|F[0-9V]|F-[A-Z]{2,}|PI[A-Z0-9-]{2,}|PA[A-Z0-9-]{2,})$/;
  const SPECIAL = new Set(["RP","RU","RQ","CA","C","DISPO"]);
  const DAY_RE = /(Je|Ve|Sa|Di|Lu|Ma|Me)\\s+(\\d+|[IiSs5])(?:\\s+([A-Z][A-Z0-9-]+)(?:\\s+([A-Z][A-Z0-9-]+))?)?/g;

  const seen = new Set();
  const jours = [];

  const processBloc = (texte, cmap) => {
    const usedCounts = {};
    let m;
    DAY_RE.lastIndex = 0;
    while ((m = DAY_RE.exec(texte)) !== null) {
      const [, abbr, numRaw, c1Raw, c2Raw] = m;
      const num = normaliseNum(numRaw);
      if (!/^\\d+$/.test(num)) continue;
      const dayNum = parseInt(num, 10);
      if (dayNum < 1 || dayNum > 31) continue;

      const key = \`\${abbr}_\${dayNum}\`;
      const candidates = cmap[key];
      if (!candidates || candidates.length === 0) continue;

      const idx = (usedCounts[key] || 0) % candidates.length;
      usedCounts[key] = (usedCounts[key] || 0) + 1;
      const mm = candidates[idx];

      const c1 = normaliseCode(c1Raw);
      if (!c1 || DAY_ABBRS.has(c1) || !CODE_VALID.test(c1)) continue;

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
      if (c2 && !DAY_ABBRS.has(c2) && CODE_VALID.test(c2)) {
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
  };

  processBloc(texteBloc1, cmap1);
  if (texteBloc2) processBloc(texteBloc2, cmap2);

  // ── Second passage : prises de nuit orphelines ──────────────────────────────
  // Cherche les patterns "(RP|RU) CodeNuit" sans day abbr dans le texte.
  // Le CodeNuit précède TOUJOURS un code de service de nuit → crée ou complète l'entrée.
  const NUIT_ORPHAN_RE = /(?:^|\\n)[ \\t]*(RP|RU)\\s+(PICC[A-Z0-9-]+|PICO[A-Z0-9-]+)/gm;
  const DAY_BEFORE_RE = /(Je|Ve|Sa|Di|Lu|Ma|Me)\\s+(\\d+|[IiSs5])/g;
  const dayPositions = [];
  let dm;
  DAY_BEFORE_RE.lastIndex = 0;
  while ((dm = DAY_BEFORE_RE.exec(text)) !== null) {
    const num2 = normaliseNum(dm[2]);
    if (!/^\\d+$/.test(num2)) continue;
    const d2 = parseInt(num2, 10);
    if (d2 < 1 || d2 > 31) continue;
    dayPositions.push({ pos: dm.index, abbr: dm[1], dayNum: d2 });
  }

  let mn2;
  NUIT_ORPHAN_RE.lastIndex = 0;
  while ((mn2 = NUIT_ORPHAN_RE.exec(text)) !== null) {
    const rpCode   = mn2[1]; // "RP" ou "RU"
    const nuitCode = normaliseCode(mn2[2]);
    if (!nuitCode) continue;

    const pos2 = mn2.index;
    let closest = null;
    for (const dp of dayPositions) {
      if (dp.pos < pos2 && (!closest || dp.pos > closest.pos)) closest = dp;
    }
    if (!closest) continue;

    const isBloc2 = sepEnd > 0 && pos2 > sepEnd;
    const cmap   = isBloc2 ? cmap2 : cmap1;
    const key2   = \`\${closest.abbr}_\${closest.dayNum}\`;
    const cands2 = cmap[key2];
    if (!cands2 || cands2.length === 0) continue;

    for (const mm2 of cands2) {
      const dateJour2 = \`\${annee}-\${mm2}-\${String(closest.dayNum).padStart(2,"0")}\`;
      const existing  = jours.find(j => j.date_jour === dateJour2);

      if (existing) {
        // Ajouter la nuit à l'entrée existante si pas déjà présente
        if (!existing.periodes.some(p => p.code_equipe === "N")) {
          const eq2 = deriveCodeEquipeBulletin(nuitCode, null);
          const h2  = getHoraires(eq2);
          existing.periodes.push({
            code_equipe: eq2, code_poste: nuitCode,
            heure_debut: h2.heure_debut, heure_fin: h2.heure_fin, ordre: 2,
          });
        }
        break;
      } else if (!seen.has(dateJour2)) {
        // Créer une nouvelle entrée RP+nuit
        seen.add(dateJour2);
        const eq1 = deriveCodeEquipeBulletin(rpCode, null);
        const h1  = getHoraires(eq1);
        const eq2 = deriveCodeEquipeBulletin(nuitCode, null);
        const h2  = getHoraires(eq2);
        jours.push({
          date_jour: dateJour2,
          periodes: [
            { code_equipe: eq1, code_poste: null, heure_debut: h1.heure_debut, heure_fin: h1.heure_fin, ordre: 1 },
            { code_equipe: eq2, code_poste: nuitCode, heure_debut: h2.heure_debut, heure_fin: h2.heure_fin, ordre: 2 },
          ],
          source_edition_date: editionDate,
        });
        break;
      }
    }
  }

  return { editionDate, jours, echecs: [] };
}

`;

content = content.slice(0, si) + newFn + content.slice(ei);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : déroulé final (blocs séparés + prises de nuit créées).');
