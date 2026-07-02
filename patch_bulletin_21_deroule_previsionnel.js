// patch_bulletin_21_deroule_previsionnel.js
// Ajoute le parsing du déroulé prévisionnel dans App.jsx :
//  - Fonction parseDeroulePrevisionnel() qui extrait les 12 mois depuis la grille
//  - Intégration dans BulletinImportButton (détection auto bulletin vs déroulé)
//  - source_type='previsionnel' envoyé au backend
// Met aussi à jour bulletinImportController.js pour supporter 2 périodes par jour
// (nécessaire pour les prises de nuit : RP jour + nuit soir)
// Exécution : node patch_bulletin_21_deroule_previsionnel.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

function mustReplaceOnce(content, search, replace, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[${label}] Ancre trouvée ${count} fois (attendu 1). Abandon sans modification.`);
  }
  return content.replace(search, replace);
}

// ── 1. App.jsx : ajout de parseDeroulePrevisionnel ──────────────────────────
const appPath = path.join(__dirname, 'src', 'App.jsx');
let app = fs.readFileSync(appPath, 'utf8');

const anchorDeroule = `function BulletinImportButton`;

const derouleFn = `// ─── PARSER DÉROULÉ PRÉVISIONNEL ──────────────────────────────────────────────
function parseDeroulePrevisionnel(text) {
  // Date d'édition : "Le 22/09/2025" en en-tête
  const editionMatch = text.match(/Le\\s*(\\d{2})[/\\\\1](\\d{2})\\/(\\d{4})/i);
  const editionDate = editionMatch
    ? \`\${editionMatch[3]}-\${editionMatch[2]}-\${editionMatch[1]} 00:00:00\`
    : null;

  // Normalisation des artefacts courants d'extraction pdfjs
  const normaliseNum = n => n.replace(/[Ii]/g,"1").replace(/[Ss]/g,"5");
  const normaliseCode = c => {
    if (!c) return null;
    c = c.trim();
    c = c.replace(/\\bHP\\b/g,"RP");                    // HP = RP (corruption H/R)
    c = c.replace(/P[IO]OCL/g,"PICCL");                // PIOCL/POOCL -> PICCL
    c = c.replace(/P[IO]CCL/g,"PICCL");                // confusion O/0
    c = c.replace(/ccx/gi,"PICCLX");                   // ccx -> PICCLX
    c = c.replace(/RU\\s+PICCL/g,"RP PICCL");          // RU parfois lu au lieu de RP devant une nuit
    return c;
  };

  // En-têtes de mois : "01/2026 02/2026 ... 06/2026" puis "07/2026 ... 12/2026"
  const MONTH_HDR = /(\\d{2})\\/((\\d{4}))/g;
  const allMonths = [...text.matchAll(MONTH_HDR)].map(m => ({ mm: m[1], yyyy: m[2] }));
  // Dédoublonner : on veut les 12 mois dans l'ordre
  const seen = new Set();
  const months = allMonths.filter(m => {
    const k = \`\${m.mm}/\${m.yyyy}\`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  if (months.length === 0) return { editionDate, jours: [], echecs: [] };

  // Pattern d'entrée : [DayAbbr] [Num] [Code1]? [Code2]?
  // Code2 présent = prise de nuit (RP + code nuit sur le même jour)
  const DAY_ABR = "(Je|Ve|Sa|Di|Lu|Ma|Me)";
  const NUM    = "(\\\\d+|[IiSs5])";
  const CODE   = "([A-Z][A-Z0-9-]+)";
  const ENTRY_RE = new RegExp(
    DAY_ABR + "\\\\s+" + NUM +
    "(?:\\\\s+" + CODE + "(?:\\\\s+" + CODE + ")?)?",
    "g"
  );

  // Découper le texte en blocs de semestres (autour des en-têtes de mois)
  // Pour chaque ligne, extraire les entrées et les associer aux colonnes (mois)
  const jours = [];
  const echecs = [];

  // Chercher les positions des en-têtes de mois dans le texte
  const hdrPositions = [];
  const HDR_RE = /(\\d{2})\\/(\\d{4})/g;
  let hm;
  while ((hm = HDR_RE.exec(text)) !== null) {
    const key = \`\${hm[1]}/\${hm[2]}\`;
    if (!hdrPositions.find(h => h.key === key)) {
      hdrPositions.push({ key, mm: hm[1], yyyy: hm[2], idx: hm.index });
    }
  }

  // Pour chaque ligne du texte, on extrait toutes les entrées [DayAbbr][Num][Code?][Code?]
  // et on les associe aux mois par leur position ordinale dans la ligne (1..6 ou 1..6)
  const lines = text.split(/\\n/);
  // Identifier les lignes d'en-tête de mois (contiennent MM/YYYY)
  const hdrLineIdxs = new Set();
  lines.forEach((l, i) => {
    if (/(\\d{2}\\/\\d{4}\\s*){2,}/.test(l)) hdrLineIdxs.add(i);
  });

  // Blocs de 6 mois : identifier les deux séries d'en-têtes
  const monthBlocks = []; // [{months:[m1..m6], startLine, endLine}]
  let currentBlock = null;
  lines.forEach((l, i) => {
    if (hdrLineIdxs.has(i)) {
      const ms = [...l.matchAll(/(\\d{2})\\/(\\d{4})/g)].map(m => ({ mm: m[1], yyyy: m[2] }));
      const uniqueMs = [];
      const s2 = new Set();
      for (const m of ms) { const k=\`\${m.mm}/\${m.yyyy}\`; if(!s2.has(k)){s2.add(k);uniqueMs.push(m);} }
      if (uniqueMs.length >= 2) {
        if (currentBlock) { currentBlock.endLine = i - 1; monthBlocks.push(currentBlock); }
        currentBlock = { months: uniqueMs, startLine: i + 1, endLine: lines.length - 1 };
      }
    }
  });
  if (currentBlock) monthBlocks.push(currentBlock);

  for (const block of monthBlocks) {
    const blockLines = lines.slice(block.startLine, block.endLine + 1);
    for (const line of blockLines) {
      ENTRY_RE.lastIndex = 0;
      const entries = [];
      let em;
      while ((em = ENTRY_RE.exec(line)) !== null) {
        const [, dayAbbr, numRaw, code1Raw, code2Raw] = em;
        const num = normaliseNum(numRaw);
        const code1 = normaliseCode(code1Raw) || null;
        const code2 = normaliseCode(code2Raw) || null;
        if (isNaN(parseInt(num, 10))) continue; // numéro illisible → skip
        entries.push({ dayAbbr, num: parseInt(num, 10), code1, code2 });
      }
      // Associer chaque entrée à un mois par position ordinale (1..6)
      entries.forEach((e, idx) => {
        if (idx >= block.months.length) return; // plus d'entrées que de mois → ignore
        const { mm, yyyy } = block.months[idx];
        const day = String(e.num).padStart(2, "0");
        const dateJour = \`\${yyyy}-\${mm}-\${day}\`;

        if (!e.code1) {
          // Case vide = descente de nuit ou jour non lisible → ne pas importer
          return;
        }

        const code1 = e.code1;
        const codeEquipe1 = deriveCodeEquipeBulletin(code1, null);
        const estSpecial1 = /^(RP|RU|RQ|C|CA|DISPO)$/.test(code1) || /^F[0-9V]$/.test(code1) || /^F-[A-Z]{2,5}$/.test(code1);

        // Horaires déduits du suffixe via EQUIPES génériques
        const getHoraires = (codeEquipe) => {
          const eq = EQ[codeEquipe];
          if (!eq?.heures) return { heure_debut: null, heure_fin: null };
          const mh = eq.heures.match(/(\\d{2})h(\\d{2}).(\\d{2})h(\\d{2})/);
          if (!mh) return { heure_debut: null, heure_fin: null };
          return { heure_debut: \`\${mh[1]}:\${mh[2]}:00\`, heure_fin: \`\${mh[3]}:\${mh[4]}:00\` };
        };

        const h1 = getHoraires(codeEquipe1);

        const periodes = [{
          code_equipe: codeEquipe1,
          code_poste: estSpecial1 ? null : code1,
          heure_debut: h1.heure_debut,
          heure_fin: h1.heure_fin,
          ordre: 1,
        }];

        // Prise de nuit : code2 présent = nuit qui démarre ce soir
        if (e.code2) {
          const code2 = e.code2;
          const codeEquipe2 = deriveCodeEquipeBulletin(code2, null);
          const estSpecial2 = /^(RP|RU|RQ|C|CA|DISPO)$/.test(code2);
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
      });
    }
  }

  return { editionDate, jours, echecs };
}

`;

if (app.includes('function parseDeroulePrevisionnel')) {
  console.log('⚠️  parseDeroulePrevisionnel existe déjà dans App.jsx — étape 1 ignorée.');
} else {
  app = mustReplaceOnce(app, anchorDeroule, derouleFn + anchorDeroule, 'App.jsx parseDeroulePrevisionnel');
  console.log('✅ parseDeroulePrevisionnel ajouté dans App.jsx.');
}

// ── 2. Intégration dans BulletinImportButton (détection auto bulletin vs déroulé) ──
const oldHandleFile = `        const { jours, echecs } = parseBulletinCommande(text);
        if (jours.length === 0) throw new Error("Aucun jour reconnu — vérifie le format du document");

        const entries = jours.map(j => {
          if (!j.heure_debut && j.code_equipe && ["M", "AM", "N", "J"].includes(j.code_equipe)) {
            const h = deduireHoraireGeneriqueEquipe(j.code_equipe);
            return { ...j, heure_debut: h.heure_debut, heure_fin: h.heure_fin };
          }
          return j;
        });

        const resp = await api.planning.importBulletin(agentCp, entries, "bulletin");`;

if (!app.includes(oldHandleFile)) {
  throw new Error("Bloc handleFile introuvable dans BulletinImportButton — vérifie qu'aucune modification manuelle n'a eu lieu.");
}

const newHandleFile = `        // Détection auto : déroulé prévisionnel (grille annuelle) ou bulletin de commande
        const isDeroule = /D.+roul.+Pr.+visionnel/i.test(text) || /Affectations de l.agent/i.test(text);
        let entries, sourceType, echecs;

        if (isDeroule) {
          const res = parseDeroulePrevisionnel(text);
          echecs = res.echecs;
          // Pour le déroulé : entries contient des objets {date_jour, periodes[], source_edition_date}
          entries = res.jours;
          sourceType = "previsionnel";
          if (entries.length === 0) throw new Error("Aucun jour reconnu dans le d\u00e9roul\u00e9 — v\u00e9rifie le format du document");
        } else {
          const res = parseBulletinCommande(text);
          echecs = res.echecs;
          entries = res.jours;
          sourceType = "bulletin";
          if (entries.length === 0) throw new Error("Aucun jour reconnu — v\u00e9rifie le format du document");
        }

        const resp = await api.planning.importBulletin(agentCp, entries, sourceType);`;

app = mustReplaceOnce(app, oldHandleFile, newHandleFile, 'App.jsx BulletinImportButton détection auto');
console.log('✅ BulletinImportButton mis à jour : détection auto bulletin vs déroulé.');

// ── 3. Correction du setResult pour le déroulé (postesLabels depuis periodes) ──
const oldSetResult = `        const postesLabels = [...new Set(entries.map(e => getPosteLabelFromCode(e.code_poste)).filter(Boolean))];
        setResult({ nb: resp?.nb_appliques || 0, ignores: resp?.ignores || [], echecs, postesLabels });`;

if (app.includes(oldSetResult)) {
  const newSetResult = `        const allCodes = entries.flatMap(e => e.periodes ? e.periodes.map(p => p.code_poste) : [e.code_poste]);
        const postesLabels = [...new Set(allCodes.map(c => getPosteLabelFromCode(c)).filter(Boolean))];
        setResult({ nb: resp?.nb_appliques || 0, ignores: resp?.ignores || [], echecs, postesLabels });`;
  app = mustReplaceOnce(app, oldSetResult, newSetResult, 'App.jsx setResult déroulé');
  console.log('✅ setResult mis à jour pour le déroulé (postesLabels depuis periodes).');
}

fs.writeFileSync(appPath, app, 'utf8');
console.log('✅ App.jsx sauvegardé.');

// ── 4. Backend : bulletinImportController.js — support multi-périodes par jour ──
const ctrlPath = path.join(__dirname, 'api', 'api', 'src', 'controllers', 'bulletinImportController.js');
let ctrl = fs.readFileSync(ctrlPath, 'utf8');

if (ctrl.includes('e.periodes')) {
  console.log('⚠️  bulletinImportController.js supporte déjà les multi-périodes — étape 4 ignorée.');
} else {
  const oldInsert = `      const codeEquipe = e.code_equipe || null;
      if (!codeEquipe) {
        ignores.push({ date: e.date_jour, motif: 'code_equipe_manquant' });
        continue;
      }
      const prive = CODES_PUBLICS.has(codeEquipe) ? 0 : 1;
      await conn.query(
        \`INSERT INTO planning_periode (planning_jour_id,ordre,code_equipe,code_poste,heure_debut,heure_fin,prive,note,note_perso)
         VALUES (?,1,?,?,?,?,?,?,?)\`,
        [jour.id, codeEquipe, e.code_poste || null, e.heure_debut || null, e.heure_fin || null, prive, null, null]
      );`;

  if (!ctrl.includes(oldInsert)) {
    throw new Error("Bloc INSERT planning_periode introuvable dans bulletinImportController.js.");
  }

  const newInsert = `      // Support multi-périodes : déroulé prévisionnel envoie e.periodes[], bulletin envoie champs directs
      const periodes = e.periodes || [{
        code_equipe: e.code_equipe || null,
        code_poste: e.code_poste || null,
        heure_debut: e.heure_debut || null,
        heure_fin: e.heure_fin || null,
        ordre: 1,
      }];

      const firstPeriode = periodes[0];
      if (!firstPeriode?.code_equipe) {
        ignores.push({ date: e.date_jour, motif: 'code_equipe_manquant' });
        continue;
      }

      for (const p of periodes) {
        if (!p.code_equipe) continue;
        const prive = CODES_PUBLICS.has(p.code_equipe) ? 0 : 1;
        await conn.query(
          \`INSERT INTO planning_periode (planning_jour_id,ordre,code_equipe,code_poste,heure_debut,heure_fin,prive,note,note_perso)
           VALUES (?,?,?,?,?,?,?,?,?)\`,
          [jour.id, p.ordre || 1, p.code_equipe, p.code_poste || null, p.heure_debut || null, p.heure_fin || null, prive, null, null]
        );
      }`;

  ctrl = mustReplaceOnce(ctrl, oldInsert, newInsert, 'bulletinImportController.js multi-periodes');
  fs.writeFileSync(ctrlPath, ctrl, 'utf8');
  console.log('✅ bulletinImportController.js mis à jour : support multi-périodes par jour.');
}

console.log('\nChantier déroulé prévisionnel terminé.');
console.log('Redémarre le backend (node server.js) avant de tester.');
