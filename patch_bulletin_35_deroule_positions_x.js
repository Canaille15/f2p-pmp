// patch_bulletin_35_deroule_positions_x.js
// Remplace parseDeroulePrevisionnel + étend extraireTextePdfNatif pour le déroulé :
// utilise les positions x réelles des éléments pdfjs pour assigner chaque entrée à
// la bonne colonne (mois), sans dépendre du numéro de jour ni du contexte de ligne.
// Approche :
//  1. Extraction des éléments avec positions (x, y, texte) depuis pdfjs
//  2. Identification des 6 colonnes par les positions x des en-têtes MM/AAAA
//  3. Chaque entrée DayAbbr[Num] Code est assignée à la colonne la plus proche par x
//  4. Regroupement par numéro de jour au sein de chaque colonne → date finale

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// ── 1. Ajouter la fonction d'extraction avec positions (avant parseDeroulePrevisionnel) ──
const anchorExtract = 'function parseDeroulePrevisionnel(text) {';
const idxExtract = content.indexOf(anchorExtract);
if (idxExtract === -1) throw new Error("parseDeroulePrevisionnel introuvable.");

const extractFn = `async function extraireItemsPdfAvecPositions(base64Pdf) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
  const raw = atob(base64Pdf);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const allItems = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    tc.items.forEach(it => {
      const s = it.str.trim();
      if (s) allItems.push({ x: it.transform[4], y: it.transform[5], text: s });
    });
  }
  return allItems;
}

`;

if (!content.includes('extraireItemsPdfAvecPositions')) {
  content = content.slice(0, idxExtract) + extractFn + content.slice(idxExtract);
  console.log('✅ extraireItemsPdfAvecPositions ajoutée.');
}

// ── 2. Remplacer parseDeroulePrevisionnel par la version positions-x ──
const START = 'function parseDeroulePrevisionnel(text) {';
const END   = '\nfunction BulletinImportButton';
const si = content.indexOf(START);
const ei = content.indexOf(END);
if (si === -1) throw new Error("parseDeroulePrevisionnel introuvable (2ème passe).");

const newFn = `function parseDeroulePrevisionnel(items) {
  // items = [{x, y, text}] depuis extraireItemsPdfAvecPositions
  // Reconstituer le texte pour la date d'édition et l'année
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
  const getHoraires = codeEquipe => {
    const eq = EQ[codeEquipe];
    if (!eq?.heures) return { heure_debut: null, heure_fin: null };
    const mh = eq.heures.match(/(\\d{2})h(\\d{2}).(\\d{2})h(\\d{2})/);
    if (!mh) return { heure_debut: null, heure_fin: null };
    return { heure_debut: \`\${mh[1]}:\${mh[2]}:00\`, heure_fin: \`\${mh[3]}:\${mh[4]}:00\` };
  };

  // Retrouver les items MM/AAAA pour identifier les x de chaque colonne
  const MONTH_RE = new RegExp("^(\\\\d{2})\\\\/" + annee + "$");
  const monthItems = items.filter(i => MONTH_RE.test(i.text));

  // Trier les mois par y décroissant (PDF: y monte vers le haut, on veut top→bottom)
  // puis grouper en blocs de même y (tolérance ±5)
  const sepY = {};
  for (const mi of monthItems) {
    const yk = Math.round(mi.y / 5) * 5;
    if (!sepY[yk]) sepY[yk] = [];
    sepY[yk].push(mi);
  }
  // Identifier les deux groupes de 6 colonnes (blocs semi-annuels)
  // Chaque y-groupe devrait contenir les en-têtes d'un même rang de colonnes
  // Construire la liste complète de colonnes (toutes y confondues) triée par x
  const allMonthItemsSortedByX = [...monthItems].sort((a, b) => a.x - b.x);
  // Dédoublonner par mois (garder la première occurrence)
  const colsByX = [];
  const seenMM = new Set();
  for (const mi of allMonthItemsSortedByX) {
    const mm = mi.text.slice(0, 2);
    if (!seenMM.has(mm)) { seenMM.add(mm); colsByX.push({ mm, x: mi.x, y: mi.y }); }
  }

  if (colsByX.length < 2) return { editionDate, jours: [], echecs: [] };

  // Séparer bloc1 (mois 01-06) et bloc2 (07-12) par la y médiane
  // Les deux grilles sont à des y différentes sur la page
  const ySorted = [...new Set(colsByX.map(c => Math.round(c.y / 10) * 10))].sort((a,b) => b-a);
  let bloc1Mois, bloc2Mois;
  if (ySorted.length >= 2) {
    const yMid = (ySorted[0] + ySorted[ySorted.length - 1]) / 2;
    bloc1Mois = colsByX.filter(c => c.y >= yMid).sort((a, b) => a.x - b.x);
    bloc2Mois = colsByX.filter(c => c.y < yMid).sort((a, b) => a.x - b.x);
  } else {
    // Tout sur la même y → diviser arbitrairement par mm < 07
    bloc1Mois = colsByX.filter(c => parseInt(c.mm, 10) <= 6).sort((a, b) => a.x - b.x);
    bloc2Mois = colsByX.filter(c => parseInt(c.mm, 10) >= 7).sort((a, b) => a.x - b.x);
  }

  // Pour chaque item, déterminer sa colonne par proximité x au sein de son bloc
  const assignColumn = (itemX, itemY, bloc1, bloc2) => {
    // Choisir le bloc selon la y de l'item (même logique que ci-dessus)
    const yMid = colsByX.length > 0
      ? (Math.max(...colsByX.map(c=>c.y)) + Math.min(...colsByX.map(c=>c.y))) / 2
      : 0;
    const bloc = itemY >= yMid ? bloc1 : bloc2;
    if (bloc.length === 0) return null;
    let best = null, bestDist = Infinity;
    for (let i = 0; i < bloc.length; i++) {
      const d = Math.abs(itemX - bloc[i].x);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return { colIdx: best, bloc };
  };

  // Patterns de détection des entrées
  const DAY_ABR_RE = /^(Je|Ve|Sa|Di|Lu|Ma|Me)$/i;
  const NUM_RE = /^(\\d+|[IiSs])$/;
  const CODE_RE = /^[A-Z][A-Z0-9-]{1,}$/;
  const SPECIAL_CODES = new Set(["RP","RU","RQ","CA","C","DISPO"]);

  // Reconstruire les entrées depuis les items : regrouper par y (même ligne)
  // Un "groupe y" contient potentiellement : DayAbbr, Num, Code
  // Trier tous les items par y décroissant, x croissant
  const sortedItems = [...items].sort((a, b) => {
    const dy = Math.round(b.y) - Math.round(a.y);
    return dy !== 0 ? dy : a.x - b.x;
  });

  const jours = [];
  // Structure : pour chaque (colonne, jour) → code
  const grid = {}; // key: "colIdx_bloc_dayNum" → {code1, code2, colIdx, mm, dayNum}

  let i = 0;
  while (i < sortedItems.length) {
    const item = sortedItems[i];
    // Détecter un jour abrégé
    if (DAY_ABR_RE.test(item.text)) {
      const next1 = sortedItems[i + 1];
      const next2 = sortedItems[i + 2];
      let dayNum = null, code1 = null, code2 = null, consumed = 1;

      if (next1 && Math.abs(next1.y - item.y) < 3 && NUM_RE.test(next1.text)) {
        const n = normaliseNum(next1.text);
        if (/^\\d+$/.test(n)) { dayNum = parseInt(n, 10); consumed = 2; }
      }
      if (dayNum && dayNum >= 1 && dayNum <= 31) {
        const n3 = sortedItems[i + consumed];
        if (n3 && Math.abs(n3.y - item.y) < 3 && CODE_RE.test(n3.text) && !NUM_RE.test(n3.text)) {
          code1 = normaliseCode(n3.text); consumed++;
          const n4 = sortedItems[i + consumed];
          if (n4 && Math.abs(n4.y - item.y) < 3 && CODE_RE.test(n4.text) && !NUM_RE.test(n4.text)) {
            code2 = normaliseCode(n4.text); consumed++;
          }
        }
        // Assigner à une colonne par x
        const col = assignColumn(item.x, item.y, bloc1Mois, bloc2Mois);
        if (col && !code1 && col.colIdx < col.bloc.length) {
          // Entrée void (no code) = skip (descente de nuit)
        } else if (col && code1) {
          const mm = col.bloc[col.colIdx].mm;
          const key = \`\${mm}_\${dayNum}\`;
          if (!grid[key]) grid[key] = { mm, dayNum, code1, code2 };
        }
      }
      i += consumed;
    } else {
      i++;
    }
  }

  // Construire les jours depuis le grid
  for (const { mm, dayNum, code1, code2 } of Object.values(grid)) {
    const day = String(dayNum).padStart(2, "0");
    const dateJour = \`\${annee}-\${mm}-\${day}\`;
    const d = new Date(dateJour);
    if (isNaN(d.getTime()) || d.getMonth() + 1 !== parseInt(mm, 10)) continue;
    if (!code1) continue;

    const codeEquipe1 = deriveCodeEquipeBulletin(code1, null);
    const estSpecial1 = SPECIAL_CODES.has(code1) || /^F[0-9V]$/.test(code1) || /^F-[A-Z]+$/.test(code1);
    const h1 = getHoraires(codeEquipe1);

    const periodes = [{
      code_equipe: codeEquipe1,
      code_poste: estSpecial1 ? null : code1,
      heure_debut: h1.heure_debut,
      heure_fin: h1.heure_fin,
      ordre: 1,
    }];

    if (code2) {
      const codeEquipe2 = deriveCodeEquipeBulletin(code2, null);
      const estSpecial2 = SPECIAL_CODES.has(code2);
      const h2 = getHoraires(codeEquipe2);
      periodes.push({
        code_equipe: codeEquipe2,
        code_poste: estSpecial2 ? null : code2,
        heure_debut: h2.heure_debut,
        heure_fin: h2.heure_fin,
        ordre: 2,
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

// ── 3. Mettre à jour BulletinImportButton pour utiliser items au lieu de text ──
const oldDerouleBlock = `          const res = parseDeroulePrevisionnel(text);
          echecs = res.echecs;
          entries = res.jours;
          sourceType = "previsionnel";
          if (entries.length === 0) throw new Error("Aucun jour reconnu dans le d\u00e9roul\u00e9 \u2014 v\u00e9rifie le format du document");`;

if (content.includes(oldDerouleBlock)) {
  const newDerouleBlock = `          // Pour le déroulé : extraction avec positions x pour assignation correcte des colonnes
          const items = await extraireItemsPdfAvecPositions(b64);
          const res = parseDeroulePrevisionnel(items);
          echecs = res.echecs;
          entries = res.jours;
          sourceType = "previsionnel";
          if (entries.length === 0) throw new Error("Aucun jour reconnu dans le d\u00e9roul\u00e9 \u2014 v\u00e9rifie le format du document");`;
  content = content.replace(oldDerouleBlock, newDerouleBlock);
  console.log('✅ BulletinImportButton mis à jour : extraction avec positions pour le déroulé.');
} else {
  console.log('⚠️  Bloc déroulé dans BulletinImportButton introuvable — vérifier manuellement.');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : parseDeroulePrevisionnel v6 (positions x pdfjs).');
