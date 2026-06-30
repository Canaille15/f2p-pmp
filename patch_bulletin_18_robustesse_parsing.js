// patch_bulletin_18_robustesse_parsing.js
// Trois améliorations suite aux tests sur le bulletin de Pastant :
// 1) CODE_RE accepte aussi les codes formation type "F-PAR" (en plus de F6, F0...)
// 2) La date tolère un "/" mal reconnu en "1" (ex: "04107/2026" au lieu de "04/07/2026"),
//    défaut d'impression/scan récurrent observé sur plusieurs bulletins.
// 3) Le code et les horaires (PS/FS) sont recherchés dans une fenêtre commune autour de
//    chaque date (et non plus seulement "avant" pour le code, "après" pour les horaires),
//    et le code retenu est celui physiquement le plus proche de la date — plus robuste
//    quand l'ordre d'extraction du PDF place exceptionnellement le code après la date.
// Exécution : node patch_bulletin_18_robustesse_parsing.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

function mustReplaceOnce(content, search, replace, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[${label}] Ancre trouvée ${count} fois (attendu 1). Abandon sans modification.`);
  }
  return content.replace(search, replace);
}

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const oldBlock = `  // Codes valides reconnus (postes 3x8 PI/PA se terminant par -, O, X ou J ; ou codes spéciaux)
  const CODE_RE = /\\b(?:RP|RU|RQ|CA|DISPO|F[0-9V]|C)\\b|\\b(?:PI|PA)[A-Z0-9]{2,6}[-OXJ]/g;

  // Découpage par DATE (JJ/MM/AAAA) plutôt que par nom de jour : les dates de chaque
  // ligne restent quasi toujours intactes dans le document, contrairement aux noms de
  // jour qui peuvent être altérés par un défaut d'impression/scan (ex: "Ven" -> "yen").
  const dateRe = /(\\d{2})\\/(\\d{2})\\/(\\d{4})/g;
  const dateMatches = [...text.matchAll(dateRe)];
  const jours = [];
  const echecs = [];

  let prevEnd = 0;
  for (let i = 0; i < dateMatches.length; i++) {
    const dm = dateMatches[i];
    // Zone "code" : tout ce qui précède cette date (jusqu'à la date précédente) —
    // contient le nom du jour, le sous-titre, et le code "Utilisation" du jour courant
    const codeZone = text.slice(prevEnd, dm.index);
    const nextStart = i + 1 < dateMatches.length ? dateMatches[i + 1].index : text.length;
    // Zone "horaires" : tout ce qui suit cette date (jusqu'à la date suivante) —
    // contient le sous-code "du XXXXX", PS/K/FS du jour courant
    const hoursZone = text.slice(dm.index + dm[0].length, nextStart);
    prevEnd = dm.index + dm[0].length;

    const dateJour = \`\${dm[3]}-\${dm[2]}-\${dm[1]}\`;

    // Recherche du premier code valide dans la zone, en ignorant les sous-codes
    // précédés de "du " (ex: "du PICCLF" = sous-code, pas le code affiché)
    let code = null;
    let cm;
    CODE_RE.lastIndex = 0;
    while ((cm = CODE_RE.exec(codeZone)) !== null) {
      const before = codeZone.slice(Math.max(0, cm.index - 5), cm.index);
      if (/\\bdu\\s*$/i.test(before)) continue;
      code = cm[0];
      break;
    }
    if (!code) { echecs.push({ date: dateJour, motif: "code_illisible" }); continue; }

    const psMatch = hoursZone.match(/\\b(?:PS|OS)\\s*(\\d{2}):(\\d{2})/i);
    const fsMatch = hoursZone.match(/\\b(?:FS|ES)\\s*(\\d{2}):(\\d{2})/i);
    const heureDebut = psMatch ? \`\${psMatch[1]}:\${psMatch[2]}:00\` : null;
    const heureFin = fsMatch ? \`\${fsMatch[1]}:\${fsMatch[2]}:00\` : null;
    const codeEquipe = deriveCodeEquipeBulletin(code, heureDebut);
    const estCodeSpecial = /^(RP|RU|RQ|C|CA|DISPO)$/.test(code) || /^F[0-9V]$/.test(code);

    jours.push({
      date_jour: dateJour,
      code_poste: estCodeSpecial ? null : code,
      code_equipe: codeEquipe,
      heure_debut: heureDebut,
      heure_fin: heureFin,
      source_edition_date: editionDate,
    });
  }`;

if (!content.includes(oldBlock)) {
  throw new Error("Bloc introuvable tel quel — vérifie qu'aucune modification manuelle n'a été faite sur cette fonction depuis le script 16.");
}

const newBlock = `  // Codes valides reconnus (postes 3x8 PI/PA se terminant par -, O, X ou J ; codes spéciaux ;
  // codes formation type "F-PAR")
  const CODE_RE = /\\b(?:RP|RU|RQ|CA|DISPO|F[0-9V]|F-[A-Z]{2,5}|C)\\b|\\b(?:PI|PA)[A-Z0-9]{2,6}[-OXJ]/g;

  // Découpage par DATE (JJ/MM/AAAA) plutôt que par nom de jour : les dates restent quasi
  // toujours intactes, contrairement aux noms de jour (ex: "Ven" -> "yen"). On tolère aussi
  // un "/" mal reconnu en "1" (ex: "04107/2026"), défaut récurrent observé sur plusieurs bulletins.
  // On neutralise les dates des lignes d'en-tête ("Edition le..." et "Commande allant du...")
  // pour qu'elles ne soient pas prises pour des jours du tableau (même longueur de texte
  // préservée pour ne pas décaler les positions utilisées ensuite).
  let workText = text;
  const editionLine = text.match(/Edition le\\s*\\d{2}\\/\\d{2}\\/\\d{4}\\s*,?\\s*\\d{2}:\\d{2}/i);
  if (editionLine) workText = workText.slice(0, editionLine.index) + " ".repeat(editionLine[0].length) + workText.slice(editionLine.index + editionLine[0].length);
  const periodeLine = workText.match(/Commande allant du\\s*\\d{2}[\\/1]\\d{2}\\/\\d{4}\\s*au\\s*\\d{2}[\\/1]\\d{2}\\/\\d{4}/i);
  if (periodeLine) workText = workText.slice(0, periodeLine.index) + " ".repeat(periodeLine[0].length) + workText.slice(periodeLine.index + periodeLine[0].length);

  const dateRe = /(\\d{2})[\\/1](\\d{2})\\/(\\d{4})/g;
  const dateMatches = [...workText.matchAll(dateRe)];
  const jours = [];
  const echecs = [];

  for (let i = 0; i < dateMatches.length; i++) {
    const dm = dateMatches[i];
    // Fenêtre commune autour de la date : du milieu avec la date précédente
    // au milieu avec la date suivante. Le code peut apparaître avant OU après
    // la date selon l'ordre d'extraction du PDF — on cherche dans toute la fenêtre
    // et on retient le code physiquement le plus proche de la date.
    const winStart = i === 0 ? 0 : Math.floor((dateMatches[i - 1].index + dateMatches[i - 1][0].length + dm.index) / 2);
    const winEnd = i + 1 < dateMatches.length ? Math.floor((dm.index + dm[0].length + dateMatches[i + 1].index) / 2) : text.length;
    const fenetre = text.slice(winStart, winEnd);
    const offset = winStart;
    // Zone horaires : large, jusqu'à la date suivante (PS/FS apparaissent toujours après
    // la date dans le document, contrairement au code qui peut se trouver avant OU après)
    const finZone = i + 1 < dateMatches.length ? dateMatches[i + 1].index : text.length;
    const zoneHoraires = text.slice(dm.index + dm[0].length, finZone);

    const dateJour = \`\${dm[3]}-\${dm[2]}-\${dm[1]}\`;

    let code = null;
    let bestDist = Infinity;
    let cm;
    CODE_RE.lastIndex = 0;
    while ((cm = CODE_RE.exec(fenetre)) !== null) {
      const before = fenetre.slice(Math.max(0, cm.index - 5), cm.index);
      if (/\\bdu\\s*$/i.test(before)) continue;
      const dist = Math.abs((offset + cm.index) - dm.index);
      if (dist < bestDist) { bestDist = dist; code = cm[0]; }
    }
    if (!code) { echecs.push({ date: dateJour, motif: "code_illisible" }); continue; }

    const psMatch = zoneHoraires.match(/\\b(?:PS|OS)\\s*(\\d{2}):(\\d{2})/i);
    const fsMatch = zoneHoraires.match(/\\b(?:FS|ES)\\s*(\\d{2}):(\\d{2})/i);
    const heureDebut = psMatch ? \`\${psMatch[1]}:\${psMatch[2]}:00\` : null;
    const heureFin = fsMatch ? \`\${fsMatch[1]}:\${fsMatch[2]}:00\` : null;
    const codeEquipe = deriveCodeEquipeBulletin(code, heureDebut);
    const estCodeSpecial = /^(RP|RU|RQ|C|CA|DISPO)$/.test(code) || /^F[0-9V]$/.test(code) || /^F-[A-Z]{2,5}$/.test(code);

    jours.push({
      date_jour: dateJour,
      code_poste: estCodeSpecial ? null : code,
      code_equipe: codeEquipe,
      heure_debut: heureDebut,
      heure_fin: heureFin,
      source_edition_date: editionDate,
    });
  }`;

content = mustReplaceOnce(content, oldBlock, newBlock, 'App.jsx robustesse parsing');

// Le code "F-PAR" (formation) n'a pas de suffixe -/O/X reconnu par deriveCodeEquipeBulletin
// -> on l'associe à "FOR" (code équipe Formation déjà existant dans le projet)
const oldDerive = `  if (/^F\\d$/.test(code)) return "JF";`;
if (content.includes(oldDerive)) {
  const newDerive = `  if (/^F\\d$/.test(code)) return "JF";
  if (/^F-[A-Z]{2,5}$/.test(code)) return "FOR";`;
  content = mustReplaceOnce(content, oldDerive, newDerive, 'App.jsx deriveCodeEquipeBulletin formation');
} else {
  console.log('⚠️  Ligne de dérivation F\\\\d non trouvée telle quelle — vérifie deriveCodeEquipeBulletin manuellement pour les codes "F-XXX".');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : parsing plus robuste (codes formation, dates tolérantes, recherche par proximité).');
