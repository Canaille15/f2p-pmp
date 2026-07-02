// patch_bulletin_31_fix_note_strip.js
// Correction : la détection de l'ordre des colonnes doit se faire sur le texte COMPLET
// (avant de supprimer la zone "Note explicative"), sinon les en-têtes de certains mois
// (ex: 11/2026, 12/2026, 01/2026) qui apparaissent après la note sont ignorés.
// Le parsing des données se fait lui sur le texte sans note (évite les faux positifs).
// Utilise des repères stables (indexOf sur noms de fonctions).
// Exécution : node patch_bulletin_31_fix_note_strip.js (depuis la racine du projet)

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
  // Date d'édition
  const editionMatch = text.match(/Le\\s*(\\d{2})[/1](\\d{2})[/1](\\d{4})/i);
  const editionDate = editionMatch
    ? \`\${editionMatch[3]}-\${editionMatch[2]}-\${editionMatch[1]} 00:00:00\`
    : null;

  // Année des données : la plus fréquente parmi tous les MM/AAAA du texte
  const yearCounts = {};
  for (const m of text.matchAll(/(\\d{2})\\/(\\d{4})/g)) {
    yearCounts[m[2]] = (yearCounts[m[2]] || 0) + 1;
  }
  const annee = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || String(new Date().getFullYear());

  // Normalisation
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

  // Horaires déduits du suffixe
  const getHoraires = codeEquipe => {
    const eq = EQ[codeEquipe];
    if (!eq?.heures) return { heure_debut: null, heure_fin: null };
    const mh = eq.heures.match(/(\\d{2})h(\\d{2}).(\\d{2})h(\\d{2})/);
    if (!mh) return { heure_debut: null, heure_fin: null };
    return { heure_debut: \`\${mh[1]}:\${mh[2]}:00\`, heure_fin: \`\${mh[3]}:\${mh[4]}:00\` };
  };

  // Détecter l'ordre des colonnes sur le texte COMPLET (avant strip de la note)
  // pour ne pas rater les en-têtes qui apparaissent après la note explicative
  const detectOrdre = (texte) => {
    const re = new RegExp("(\\\\d{2})\\\\/" + annee, "g");
    const seen = new Set();
    const ordre = [];
    let m;
    while ((m = re.exec(texte)) !== null) {
      const mm = m[1];
      const n = parseInt(mm, 10);
      if (!seen.has(mm) && n >= 1 && n <= 12) { seen.add(mm); ordre.push(mm); }
    }
    return ordre;
  };

  // Supprimer la zone "Note explicative" pour le PARSING des données seulement
  const noteIdx = text.search(/Note\\s+explicative/i);
  const cleanText = noteIdx > 0 ? text.slice(0, noteIdx) : text;

  // Séparer bloc1/bloc2 sur le texte nettoyé (pour le parsing)
  const bloc2Marker = \`07/\${annee}\`;
  const bloc2Idx = cleanText.indexOf(bloc2Marker);
  const texteBloc1 = bloc2Idx > 0 ? cleanText.slice(0, bloc2Idx) : cleanText;
  const texteBloc2 = bloc2Idx > 0 ? cleanText.slice(bloc2Idx) : "";

  // Séparer bloc1/bloc2 sur le texte COMPLET (pour la détection d'ordre)
  const bloc2IdxFull = text.indexOf(bloc2Marker);
  const textBloc1Full = bloc2IdxFull > 0 ? text.slice(0, bloc2IdxFull) : text;
  const textBloc2Full = bloc2IdxFull > 0 ? text.slice(bloc2IdxFull) : "";

  const moisBloc1 = detectOrdre(textBloc1Full);
  const moisBloc2 = detectOrdre(textBloc2Full);

  if (moisBloc1.length === 0) return { editionDate, jours: [], echecs: [] };

  const DAY_RE = new RegExp(
    "(Je|Ve|Sa|Di|Lu|Ma|Me)\\\\s+(\\\\d+|[IiSs5])" +
    "(?:\\\\s+([A-Z][A-Z0-9-]+)(?:\\\\s+([A-Z][A-Z0-9-]+))?)?",
    "g"
  );

  const jours = [];

  const parseBloc = (texte, moisList) => {
    if (!moisList.length) return;
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
console.log('✅ App.jsx mis à jour : détection ordre colonnes sur texte complet (nov/déc/jan corrigés).');
