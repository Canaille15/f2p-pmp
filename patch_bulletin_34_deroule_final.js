// patch_bulletin_34_deroule_final.js
// Remplace parseDeroulePrevisionnel par la version finale, basée sur l'analyse du vrai
// texte extrait (DUMP_TEXTE_COMPLET) :
//
// Corrections appliquées :
// 1. Split au séparateur "______" (ligne de tirets) plutôt qu'à "07/2026", car les headers
//    de bloc2 ("09/2026 11/2026 12/2026") apparaissent AVANT "07/2026" dans le texte extrait.
// 2. Ordre des colonnes détecté dynamiquement depuis les headers de chaque bloc
//    (bloc1: [05,06,02,03,04,01] / bloc2: [09,11,12,07,08,10] dans ce PDF).
// 3. Entrées orphelines (ex: "Ve PICCL-" sans numéro de jour) : le numéro est récupéré
//    depuis le contexte de la même ligne (mode des numéros présents sur la ligne).

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
  // Date d'édition ("Le 22/09/2025" ou "Le 22/0912025" — séparateur parfois corrompu)
  const editionMatch = text.match(/Le\\s*(\\d{2})[/1](\\d{2})[/1](\\d{4})/i);
  const editionDate = editionMatch
    ? \`\${editionMatch[3]}-\${editionMatch[2]}-\${editionMatch[1]} 00:00:00\`
    : null;

  // Année des données : la plus fréquente parmi tous les MM/AAAA
  const yearCounts = {};
  for (const m of text.matchAll(/(\\d{2})\\/(\\d{4})/g)) {
    yearCounts[m[2]] = (yearCounts[m[2]] || 0) + 1;
  }
  const annee = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    || String(new Date().getFullYear());

  const normaliseNum = n => n.replace(/[Ii]/g, "1").replace(/[Ss]/g, "5");
  const normaliseCode = c => {
    if (!c) return null;
    c = c.trim();
    c = c.replace(/\\bHP\\b/g, "RP");
    c = c.replace(/P[IO]OCL/g, "PICCL");
    c = c.replace(/P[IO]CCL/g, "PICCL");
    c = c.replace(/ccx/gi, "PICCLX");
    c = c.replace(/^(F-)\\s+/, "$1");
    return c || null;
  };
  const getHoraires = codeEquipe => {
    const eq = EQ[codeEquipe];
    if (!eq?.heures) return { heure_debut: null, heure_fin: null };
    const mh = eq.heures.match(/(\\d{2})h(\\d{2}).(\\d{2})h(\\d{2})/);
    if (!mh) return { heure_debut: null, heure_fin: null };
    return { heure_debut: \`\${mh[1]}:\${mh[2]}:00\`, heure_fin: \`\${mh[3]}:\${mh[4]}:00\` };
  };

  // Retirer la note explicative du parsing (mais la garder pour la détection d'ordre)
  const noteIdx = text.search(/Note\\s+explicative/i);
  const cleanText = noteIdx > 0 ? text.slice(0, noteIdx) : text;

  // Split au premier séparateur de grille "___..." (≥6 tirets bas consécutifs)
  // Ce séparateur marque la frontière entre les deux grilles semi-annuelles
  const sepRe = /_{6,}/;
  const sepMatch = sepRe.exec(cleanText);
  const sepLineEnd = sepMatch ? cleanText.indexOf("\\n", sepMatch.index + sepMatch[0].length) : -1;
  const texteBloc1 = sepLineEnd > 0 ? cleanText.slice(0, sepLineEnd) : cleanText;
  const texteBloc2 = sepLineEnd > 0 ? cleanText.slice(sepLineEnd) : "";

  // Détecter l'ordre réel des colonnes dans chaque bloc (ordre d'apparition des MM/ANNEE)
  // Utiliser le texte COMPLET (y compris la note) pour ne pas rater des headers tardifs
  const sepLineEndFull = sepMatch
    ? text.indexOf("\\n", sepMatch.index + sepMatch[0].length)
    : -1;
  const textBloc1Full = sepLineEndFull > 0 ? text.slice(0, sepLineEndFull) : text;
  const textBloc2Full = sepLineEndFull > 0 ? text.slice(sepLineEndFull) : "";

  const detectOrdre = (t) => {
    const re = new RegExp("(\\\\d{2})\\\\/" + annee, "g");
    const seen = new Set(); const ordre = []; let m;
    while ((m = re.exec(t)) !== null) {
      const mm = m[1]; const n = parseInt(mm, 10);
      if (!seen.has(mm) && n >= 1 && n <= 12) { seen.add(mm); ordre.push(mm); }
    }
    return ordre;
  };
  const completer = (detected, expected) => {
    const res = [...detected];
    for (const mm of expected) { if (!res.includes(mm)) res.push(mm); }
    return res;
  };
  const mois1 = completer(detectOrdre(textBloc1Full), ["01","02","03","04","05","06"]);
  const mois2 = completer(detectOrdre(textBloc2Full), ["07","08","09","10","11","12"]);

  // Regex d'entrée principale (avec numéro de jour obligatoire)
  const DAY_RE_NUM = new RegExp(
    "(Je|Ve|Sa|Di|Lu|Ma|Me)\\\\s+(\\\\d+|[IiSs5])" +
    "(?:\\\\s+([A-Z][A-Z0-9-]+)(?:\\\\s+([A-Z][A-Z0-9-]+))?)?", "g"
  );
  // Regex pour les entrées orphelines (sans numéro de jour)
  const DAY_RE_ORPHAN = new RegExp(
    "(?<![A-Za-z])(Je|Ve|Sa|Di|Lu|Ma|Me)\\\\s+([A-Z][A-Z0-9-]+)", "g"
  );

  const jours = [];

  const parseBloc = (texte, moisList) => {
    if (!moisList.length) return;
    const flat = [];

    for (const line of texte.split(/\\n/)) {
      const lineEntries = [];

      // 1. Extraire les entrées avec numéro de jour
      DAY_RE_NUM.lastIndex = 0;
      let em;
      while ((em = DAY_RE_NUM.exec(line)) !== null) {
        const [, , numRaw, c1Raw, c2Raw] = em;
        const num = normaliseNum(numRaw);
        if (!/^\\d+$/.test(num)) continue;
        const dayNum = parseInt(num, 10);
        if (dayNum < 1 || dayNum > 31) continue;
        lineEntries.push({ dayNum, code1: normaliseCode(c1Raw), code2: normaliseCode(c2Raw), pos: em.index });
      }

      // 2. Déterminer le numéro de jour contextuel de cette ligne
      const dayNums = lineEntries.map(e => e.dayNum);
      let contextDay = null;
      if (dayNums.length > 0) {
        // Prendre le numéro le plus fréquent sur la ligne
        const freq = {};
        dayNums.forEach(d => { freq[d] = (freq[d] || 0) + 1; });
        contextDay = parseInt(Object.entries(freq).sort((a,b) => b[1]-a[1])[0][0], 10);
      }

      // 3. Extraire les entrées orphelines (sans numéro) et leur assigner le contexte
      if (contextDay) {
        DAY_RE_ORPHAN.lastIndex = 0;
        while ((em = DAY_RE_ORPHAN.exec(line)) !== null) {
          const [, , c1Raw] = em;
          const c1 = normaliseCode(c1Raw);
          if (!c1) continue;
          // Vérifier que cette position n'est pas déjà capturée par une entrée numérotée
          const alreadyCaptured = lineEntries.some(e => Math.abs(e.pos - em.index) < 5);
          if (!alreadyCaptured) {
            lineEntries.push({ dayNum: contextDay, code1: c1, code2: null, pos: em.index });
          }
        }
        // Trier par position dans la ligne (gauche → droite = ordre des colonnes)
        lineEntries.sort((a, b) => a.pos - b.pos);
      }

      flat.push(...lineEntries);
    }

    // Accumulateur par numéro de jour : regroupe les 6 entrées (une par colonne)
    let currentDay = null, acc = [];
    const groups = {};

    for (const e of flat) {
      if (e.dayNum !== currentDay) {
        if (currentDay !== null && acc.length > 0) {
          if (!groups[currentDay]) groups[currentDay] = [];
          groups[currentDay].push(...acc);
        }
        currentDay = e.dayNum;
        acc = [];
      }
      if (acc.length < moisList.length) acc.push(e);
    }
    if (currentDay !== null && acc.length > 0) {
      if (!groups[currentDay]) groups[currentDay] = [];
      groups[currentDay].push(...acc);
    }

    // Émettre les jours
    for (const [dayStr, entries] of Object.entries(groups)) {
      const dayNum = parseInt(dayStr, 10);
      entries.forEach((e, idx) => {
        if (idx >= moisList.length) return;
        const mm = moisList[idx];
        const day = String(dayNum).padStart(2, "0");
        const dateJour = \`\${annee}-\${mm}-\${day}\`;
        const d = new Date(dateJour);
        if (isNaN(d.getTime()) || d.getMonth() + 1 !== parseInt(mm, 10)) return;
        if (!e.code1) return;

        const codeEquipe1 = deriveCodeEquipeBulletin(e.code1, null);
        const estSpecial1 = /^(RP|RU|RQ|C|CA|DISPO)$/.test(e.code1)
          || /^F[0-9V]$/.test(e.code1) || /^F-[A-Z]{2,5}$/.test(e.code1);
        const h1 = getHoraires(codeEquipe1);

        const periodes = [{
          code_equipe: codeEquipe1,
          code_poste: estSpecial1 ? null : e.code1,
          heure_debut: h1.heure_debut,
          heure_fin: h1.heure_fin,
          ordre: 1,
        }];

        if (e.code2) {
          const codeEquipe2 = deriveCodeEquipeBulletin(e.code2, null);
          const estSpecial2 = /^(RP|RU|RQ|C|CA|DISPO)$/.test(e.code2);
          const h2 = getHoraires(codeEquipe2);
          periodes.push({
            code_equipe: codeEquipe2,
            code_poste: estSpecial2 ? null : e.code2,
            heure_debut: h2.heure_debut,
            heure_fin: h2.heure_fin,
            ordre: 2,
          });
        }

        jours.push({ date_jour: dateJour, periodes, source_edition_date: editionDate });
      });
    }
  };

  parseBloc(texteBloc1, mois1);
  if (texteBloc2) parseBloc(texteBloc2, mois2);

  const seen = new Set();
  const joursUniques = jours.filter(j => {
    if (seen.has(j.date_jour)) return false;
    seen.add(j.date_jour); return true;
  });

  return { editionDate, jours: joursUniques, echecs: [] };
}

`;

content = content.slice(0, si) + newFn + content.slice(ei);

// Retirer le log DUMP_TEXTE_COMPLET si présent
if (content.includes('DUMP_TEXTE_COMPLET')) {
  content = content.replace('console.log("DUMP_TEXTE_COMPLET", JSON.stringify(text));\n        ', '');
  console.log('✅ Log DUMP_TEXTE_COMPLET retiré.');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : parseDeroulePrevisionnel final (split séparateur, ordre réel, entrées orphelines).');
