// patch_bulletin_16_decoupage_par_date.js
// Le découpage par nom de jour ("Lun","Mar"...) ratait des jours quand le PDF source
// a un défaut d'impression/scan sur le nom du jour (ex: "yen" au lieu de "Ven").
// Les dates elles-mêmes (JJ/MM/AAAA) restent quasi toujours intactes dans ce type de
// document → on découpe désormais les blocs par occurrence de date, bien plus robuste.
// Exécution : node patch_bulletin_16_decoupage_par_date.js (depuis la racine du projet)

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

const oldBlock = `  const dayRe = /(Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\\b/g;
  const matches = [...text.matchAll(dayRe)];
  const jours = [];
  const echecs = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const blockStart = m.index;
    const blockEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const block = text.slice(blockStart, blockEnd);
    const dateMatch = block.match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})/);
    if (!dateMatch) { echecs.push({ extrait: block.slice(0, 50) }); continue; }
    const dateJour = \`\${dateMatch[3]}-\${dateMatch[2]}-\${dateMatch[1]}\`;

    // Recherche du premier code valide dans le bloc, en ignorant les sous-codes
    // précédés de "du " (ex: "du PICCLF" = sous-code, pas le code affiché)
    let code = null;
    let cm;
    CODE_RE.lastIndex = 0;
    while ((cm = CODE_RE.exec(block)) !== null) {
      const before = block.slice(Math.max(0, cm.index - 5), cm.index);
      if (/\\bdu\\s*$/i.test(before)) continue;
      code = cm[0];
      break;
    }
    if (!code) { echecs.push({ date: dateJour, motif: "code_illisible" }); continue; }

    const psMatch = block.match(/\\b(?:PS|OS)\\s*(\\d{2}):(\\d{2})/i);
    const fsMatch = block.match(/\\b(?:FS|ES)\\s*(\\d{2}):(\\d{2})/i);
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
  throw new Error("Bloc de découpage par jour introuvable tel quel — vérifie qu'aucune modification manuelle n'a été faite sur cette fonction depuis le script 11.");
}

const newBlock = `  // Découpage par DATE (JJ/MM/AAAA) plutôt que par nom de jour : les dates de chaque
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

content = mustReplaceOnce(content, oldBlock, newBlock, 'App.jsx découpage par date');
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : le bulletin est maintenant découpé par date (plus robuste) au lieu du nom du jour.');
console.log('ℹ️  Les quelques jours où la DATE elle-même est imprimée/scannée de façon illisible');
console.log("    resteront non détectés — c'est un défaut du document source, pas du parsing.");
