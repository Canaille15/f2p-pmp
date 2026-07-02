// patch_bulletin_27_parser_deroule_v2.js
// Remplace entièrement parseDeroulePrevisionnel par une version robuste :
// - Ne dépend plus de la détection des en-têtes de mois sur une ligne complète
//   (trop fragile : pdfjs fragmente la ligne en plusieurs morceaux selon le PDF)
// - Hardcode la structure : bloc1 = mois 01-06, bloc2 = mois 07-12
// - Trouve la frontière entre les deux blocs en cherchant "07/AAAA" dans le texte
// - Associe chaque entrée [DayAbbr][Num][Code] à un mois par position ordinale dans la ligne
// Utilise des repères stables (indexOf sur noms de fonctions).
// Exécution : node patch_bulletin_27_parser_deroule_v2.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const START_MARKER = 'function parseDeroulePrevisionnel(text) {';
const END_MARKER   = '\nfunction BulletinImportButton';

const startIdx = content.indexOf(START_MARKER);
const endIdx   = content.indexOf(END_MARKER);

if (startIdx === -1) throw new Error("parseDeroulePrevisionnel introuvable.");
if (endIdx   === -1) throw new Error("BulletinImportButton introuvable.");

const newFn = `function parseDeroulePrevisionnel(text) {
  // Date d'édition : "Le 22/09/2025" ou "Le 22/0912025" (séparateur parfois corrompu)
  const editionMatch = text.match(/Le\\s*(\\d{2})[/1](\\d{2})[/1](\\d{4})/i);
  const editionDate = editionMatch
    ? \`\${editionMatch[3]}-\${editionMatch[2]}-\${editionMatch[1]} 00:00:00\`
    : null;

  // Trouver l'année des données (chercher le premier MM/YYYY dans le texte)
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

  // Trouver la frontière entre bloc1 (01-06) et bloc2 (07-12) :
  // chercher la première occurrence de "07/ANNEE" dans le texte
  const bloc2Marker = \`07/\${annee}\`;
  const bloc2Idx = text.indexOf(bloc2Marker);
  const texteBloc1 = bloc2Idx > 0 ? text.slice(0, bloc2Idx) : text;
  const texteBloc2 = bloc2Idx > 0 ? text.slice(bloc2Idx) : "";

  const moisBloc1 = ["01","02","03","04","05","06"].map(mm => ({ mm, yyyy: annee }));
  const moisBloc2 = ["07","08","09","10","11","12"].map(mm => ({ mm, yyyy: annee }));

  // Pattern d'entrée : [DayAbbr] [Num] [Code1]? [Code2]?
  const DAY_RE = new RegExp(
    "(Je|Ve|Sa|Di|Lu|Ma|Me)\\\\s+(\\\\d+|[IiSs5])" +
    "(?:\\\\s+([A-Z][A-Z0-9-]+)(?:\\\\s+([A-Z][A-Z0-9-]+))?)?",
    "g"
  );

  // Horaires déduits du suffixe via EQUIPES génériques
  const getHoraires = (codeEquipe) => {
    const eq = EQ[codeEquipe];
    if (!eq?.heures) return { heure_debut: null, heure_fin: null };
    const mh = eq.heures.match(/(\\d{2})h(\\d{2}).(\\d{2})h(\\d{2})/);
    if (!mh) return { heure_debut: null, heure_fin: null };
    return { heure_debut: \`\${mh[1]}:\${mh[2]}:00\`, heure_fin: \`\${mh[3]}:\${mh[4]}:00\` };
  };

  const jours = [];
  const echecs = [];

  const parseBloc = (texte, mois) => {
    const lines = texte.split(/\\n/);
    for (const line of lines) {
      DAY_RE.lastIndex = 0;
      const entries = [];
      let em;
      while ((em = DAY_RE.exec(line)) !== null) {
        const [, dayAbbr, numRaw, c1Raw, c2Raw] = em;
        const num = normaliseNum(numRaw);
        if (!num.match(/^\\d+$/)) continue;
        entries.push({
          num: parseInt(num, 10),
          code1: normaliseCode(c1Raw) || null,
          code2: normaliseCode(c2Raw) || null,
        });
      }
      // Associer chaque entrée au mois correspondant par position ordinale
      entries.forEach((e, idx) => {
        if (idx >= mois.length) return;
        const { mm, yyyy } = mois[idx];
        const day = String(e.num).padStart(2, "0");
        const dateJour = \`\${yyyy}-\${mm}-\${day}\`;

        // Valider la date
        const d = new Date(dateJour);
        if (isNaN(d.getTime()) || d.getMonth() + 1 !== parseInt(mm, 10)) return;

        if (!e.code1) return; // case vide = descente de nuit ou repos implicite → skip

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

        // Prise de nuit : code2 présent
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

  // Dédoublonner (une même date peut apparaître plusieurs fois si le texte a des doublons)
  const seen = new Set();
  const joursUniques = jours.filter(j => {
    if (seen.has(j.date_jour)) return false;
    seen.add(j.date_jour); return true;
  });

  return { editionDate, jours: joursUniques, echecs };
}

`;

content = content.slice(0, startIdx) + newFn + content.slice(endIdx);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : parseDeroulePrevisionnel v2 (blocs hardcodés 01-06 / 07-12).');
