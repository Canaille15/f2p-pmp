// patch_bulletin_28_deroule_accumulateur.js
// Remplace parseDeroulePrevisionnel par une version robuste qui utilise un accumulateur
// par numéro de jour : les entrées sont collectées en liste plate depuis tout le texte du
// bloc, puis regroupées par numéro de jour (6 entrées par jour = une par mois). Cette
// approche est insensible à la fragmentation des lignes par pdfjs.
// Utilise des repères stables (indexOf sur noms de fonctions).
// Exécution : node patch_bulletin_28_deroule_accumulateur.js (depuis la racine du projet)

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
  // Date d'édition : "Le 22/09/2025" ou "Le 22/0912025" (séparateur parfois corrompu)
  const editionMatch = text.match(/Le\\s*(\\d{2})[/1](\\d{2})[/1](\\d{4})/i);
  const editionDate = editionMatch
    ? \`\${editionMatch[3]}-\${editionMatch[2]}-\${editionMatch[1]} 00:00:00\`
    : null;

  // Trouver l'année depuis le premier MM/YYYY visible dans le texte
  const yearMatch = text.match(/(\\d{2})\\/(2\\d{3})/);
  const annee = yearMatch ? yearMatch[2] : String(new Date().getFullYear());

  // Normalisation des artefacts d'extraction pdfjs
  const normaliseNum = n => n.replace(/[Ii]/g,"1").replace(/[Ss]/g,"5");
  const normaliseCode = c => {
    if (!c) return null;
    c = c.trim();
    c = c.replace(/\\bHP\\b/g,"RP");
    c = c.replace(/P[IO]OCL/g,"PICCL");
    c = c.replace(/P[IO]CCL/g,"PICCL");
    c = c.replace(/ccx/gi,"PICCLX");
    c = c.replace(/^(F-)\\s+/, "$1");
    return c || null;
  };

  // Horaires déduits du suffixe via EQUIPES génériques
  const getHoraires = codeEquipe => {
    const eq = EQ[codeEquipe];
    if (!eq?.heures) return { heure_debut: null, heure_fin: null };
    const mh = eq.heures.match(/(\\d{2})h(\\d{2}).(\\d{2})h(\\d{2})/);
    if (!mh) return { heure_debut: null, heure_fin: null };
    return { heure_debut: \`\${mh[1]}:\${mh[2]}:00\`, heure_fin: \`\${mh[3]}:\${mh[4]}:00\` };
  };

  // Séparer bloc1 (mois 01-06) et bloc2 (07-12) par la position de "07/ANNEE"
  const bloc2Marker = \`07/\${annee}\`;
  const bloc2Idx = text.indexOf(bloc2Marker);
  const texteBloc1 = bloc2Idx > 0 ? text.slice(0, bloc2Idx) : text;
  const texteBloc2 = bloc2Idx > 0 ? text.slice(bloc2Idx) : "";
  const moisBloc1 = ["01","02","03","04","05","06"];
  const moisBloc2 = ["07","08","09","10","11","12"];

  // Regex d'entrée : [DayAbbr] [Num] [Code1]? [Code2]?
  const DAY_RE = new RegExp(
    "(Je|Ve|Sa|Di|Lu|Ma|Me)\\\\s+(\\\\d+|[IiSs5])" +
    "(?:\\\\s+([A-Z][A-Z0-9-]+)(?:\\\\s+([A-Z][A-Z0-9-]+))?)?",
    "g"
  );

  const jours = [];

  // Accumulateur par numéro de jour : collecte toutes les entrées du bloc en liste plate,
  // les regroupe par numéro de jour (max 6 = une par mois), puis les émet.
  const parseBloc = (texte, moisList) => {
    // 1. Collecter toutes les entrées en liste plate (ordre du texte)
    const flat = [];
    for (const line of texte.split(/\\n/)) {
      DAY_RE.lastIndex = 0;
      let em;
      while ((em = DAY_RE.exec(line)) !== null) {
        const [, , numRaw, c1Raw, c2Raw] = em;
        const num = normaliseNum(numRaw);
        if (!/^\\d+$/.test(num)) continue;
        const dayNum = parseInt(num, 10);
        if (dayNum < 1 || dayNum > 31) continue;
        flat.push({ dayNum, code1: normaliseCode(c1Raw), code2: normaliseCode(c2Raw) });
      }
    }

    // 2. Accumulateur : regroupe par numéro de jour
    // On émet un groupe quand le numéro de jour change OU qu'on a 6 entrées
    let currentDay = null;
    let acc = [];
    const groups = {}; // dayNum -> [entries in order of column]

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

    // 3. Émettre les jours
    for (const [dayStr, entries] of Object.entries(groups)) {
      const dayNum = parseInt(dayStr, 10);
      entries.forEach((e, idx) => {
        if (idx >= moisList.length) return;
        const mm = moisList[idx];
        const day = String(dayNum).padStart(2, "0");
        const dateJour = \`\${annee}-\${mm}-\${day}\`;

        // Valider la date
        const d = new Date(dateJour);
        if (isNaN(d.getTime()) || d.getMonth() + 1 !== parseInt(mm, 10)) return;

        if (!e.code1) return; // case vide = descente de nuit → skip

        const codeEquipe1 = deriveCodeEquipeBulletin(e.code1, null);
        const estSpecial1 = /^(RP|RU|RQ|C|CA|DISPO)$/.test(e.code1) || /^F[0-9V]$/.test(e.code1) || /^F-[A-Z]{2,5}$/.test(e.code1);
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

  parseBloc(texteBloc1, moisBloc1);
  if (texteBloc2) parseBloc(texteBloc2, moisBloc2);

  // Dédoublonner par date
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
console.log('✅ App.jsx mis à jour : parseDeroulePrevisionnel v3 (accumulateur par numéro de jour).');
