// patch_bulletin_11_fix_parser.js
// Corrige parseBulletinCommande : au lieu de prendre le mot immédiatement après le jour
// (fragile selon l'ordre d'extraction du PDF), on recherche dans le bloc du jour un code
// reconnu (RP, RU, RQ, CA, C, DISPO, F+chiffre, ou code PI/PA se terminant par -,O,X,J),
// en ignorant les sous-codes précédés de "du " (ex: "du PICCLF").
// Exécution : node patch_bulletin_11_fix_parser.js (depuis la racine du projet)

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

const oldBlock = `  const dayRe = /(Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\\s+(\\S+)/g;
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

    let code = (m[2] || "").trim().replace(/[.,;:]+$/, "");
    if (!code) { echecs.push({ date: dateJour, motif: "code_illisible" }); continue; }

    const psMatch = block.match(/\\b(?:PS|OS)\\s*(\\d{2}):(\\d{2})/i);
    const fsMatch = block.match(/\\b(?:FS|ES)\\s*(\\d{2}):(\\d{2})/i);
    const heureDebut = psMatch ? \`\${psMatch[1]}:\${psMatch[2]}:00\` : null;
    const heureFin = fsMatch ? \`\${fsMatch[1]}:\${fsMatch[2]}:00\` : null;
    const codeEquipe = deriveCodeEquipeBulletin(code, heureDebut);
    const estCodeSpecial = /^(RP|RU|RQ|C|CA|DISPO)$/.test(code) || /^F\\d$/.test(code);

    jours.push({
      date_jour: dateJour,
      code_poste: estCodeSpecial ? null : code,
      code_equipe: codeEquipe,
      heure_debut: heureDebut,
      heure_fin: heureFin,
      source_edition_date: editionDate,
    });
  }
  return { editionDate, jours, echecs };
}`;

if (!content.includes(oldBlock)) {
  throw new Error("Bloc parseBulletinCommande introuvable tel quel — vérifie qu'aucune modification manuelle n'a été faite sur cette fonction.");
}

const newBlock = `  // Codes valides reconnus (postes 3x8 PI/PA se terminant par -, O, X ou J ; ou codes spéciaux)
  const CODE_RE = /\\b(?:RP|RU|RQ|CA|DISPO|F[0-9V]|C)\\b|\\b(?:PI|PA)[A-Z0-9]{2,6}[-OXJ]/g;

  const dayRe = /(Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\\b/g;
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
  }
  return { editionDate, jours, echecs };
}`;

content = mustReplaceOnce(content, oldBlock, newBlock, 'App.jsx fix parser parseBulletinCommande');
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : parsing du code poste corrigé (recherche de code valide au lieu du mot adjacent).');
