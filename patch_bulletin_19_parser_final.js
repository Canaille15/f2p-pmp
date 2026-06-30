// patch_bulletin_19_parser_final.js
// Remplace entièrement le corps de la fonction parseBulletinCommande par la version finale,
// corrigée après tests réels sur les bulletins de Dupuy et Pastant :
//  - codes formation "F- PAR" (avec espace) tolérés
//  - code "Pauseur" déduit de son sous-code (PIPA2E -> PIPA2J) quand le code affiché manque
//  - horaires (PS/FS) déterminés par tri chronologique des heures trouvées (plus robuste
//    que l'association par label, l'ordre du texte étant trop variable selon le PDF)
//  - en-tête "Edition le" tolérant au même défaut de séparateur que "Commande allant du"
// S'appuie sur des repères stables (noms de fonctions) plutôt que sur le contenu exact
// du fichier, donc fonctionne quelle que soit la version actuellement en place.
// Exécution : node patch_bulletin_19_parser_final.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const startMarker = 'function parseBulletinCommande(text) {';
const endMarker = '\nfunction BulletinImportButton';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
  throw new Error("Repères introuvables (function parseBulletinCommande / function BulletinImportButton) — vérifie que les patchs précédents ont bien été appliqués.");
}

const newFunction = `function parseBulletinCommande(text) {
  const editionMatch = text.match(/Edition le\\s*(\\d{2})[\\/1](\\d{2})\\/(\\d{4})\\s*,?\\s*(\\d{2}):(\\d{2})/i);
  const editionDate = editionMatch
    ? \`\${editionMatch[3]}-\${editionMatch[2]}-\${editionMatch[1]} \${editionMatch[4]}:\${editionMatch[5]}:00\`
    : null;

  // Codes valides reconnus (postes 3x8 PI/PA se terminant par -, O, X ou J ; codes spéciaux ;
  // codes formation type "F-PAR", avec ou sans espace après le tiret)
  const CODE_RE = /\\b(?:RP|RU|RQ|CA|DISPO|F[0-9V]|F-\\s?[A-Z]{2,5}|C)\\b|\\b(?:PI|PA)[A-Z0-9]{2,6}[-OXJ]/g;

  // On neutralise les dates des lignes d'en-tête ("Edition le..." et "Commande allant du...")
  // pour qu'elles ne soient pas prises pour des jours du tableau (même longueur de texte
  // préservée pour ne pas décaler les positions utilisées ensuite).
  let workText = text;
  const editionLine = text.match(/Edition le\\s*\\d{2}[\\/1]\\d{2}\\/\\d{4}\\s*,?\\s*\\d{2}:\\d{2}/i);
  if (editionLine) workText = workText.slice(0, editionLine.index) + " ".repeat(editionLine[0].length) + workText.slice(editionLine.index + editionLine[0].length);
  const periodeLine = workText.match(/Commande allant du\\s*\\d{2}[\\/1]\\d{2}\\/\\d{4}\\s*au\\s*\\d{2}[\\/1]\\d{2}\\/\\d{4}/i);
  if (periodeLine) workText = workText.slice(0, periodeLine.index) + " ".repeat(periodeLine[0].length) + workText.slice(periodeLine.index + periodeLine[0].length);

  // Découpage par DATE (JJ/MM/AAAA) plutôt que par nom de jour : les dates restent quasi
  // toujours intactes, contrairement aux noms de jour (ex: "Ven" -> "yen"). On tolère aussi
  // un "/" mal reconnu en "1" (ex: "04107/2026"), défaut récurrent observé sur plusieurs bulletins.
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

    // Cas particulier "Pauseur" : le code affiché (ex. PIPA2J) manque parfois entièrement
    // du texte extrait, alors que le sous-code "du PIPA2E" lui est toujours présent dans
    // la zone horaires du jour. On le détecte en priorité et on en déduit le code (E -> J).
    const pauseurMatch = zoneHoraires.match(/\\bdu\\s+PIPA([123])E\\b/i);
    if (pauseurMatch) {
      code = \`PIPA\${pauseurMatch[1]}J\`;
    }

    if (!code) {
      CODE_RE.lastIndex = 0;
      while ((cm = CODE_RE.exec(fenetre)) !== null) {
        const before = fenetre.slice(Math.max(0, cm.index - 5), cm.index);
        if (/\\bdu\\s*$/i.test(before)) continue;
        const dist = Math.abs((offset + cm.index) - dm.index);
        if (dist < bestDist) { bestDist = dist; code = cm[0]; }
      }
    }
    if (!code) { echecs.push({ date: dateJour, motif: "code_illisible" }); continue; }
    code = code.replace(/^(F-)\\s+/, "$1"); // normalise "F- PAR" -> "F-PAR"

    // Toutes les heures HH:MM trouvées dans la zone, triées chronologiquement : la plus
    // tôt est l'heure de début, la plus tardive la fin (inversé pour la nuit, qui traverse
    // minuit). Plus robuste que d'associer chaque label PS/FS à une valeur, l'ordre du texte
    // étant trop variable selon les défauts d'extraction du PDF.
    const valeurs = [...zoneHoraires.matchAll(/(\\d{2}):(\\d{2})/g)]
      .map(m => ({ h: m[1], mn: m[2], total: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) }))
      .sort((a, b) => a.total - b.total);
    const codeEquipeProvisoire = deriveCodeEquipeBulletin(code, null);
    let heureDebut = null, heureFin = null;
    if (valeurs.length === 1) {
      heureDebut = \`\${valeurs[0].h}:\${valeurs[0].mn}:00\`;
    } else if (valeurs.length >= 2) {
      const min = valeurs[0], max = valeurs[valeurs.length - 1];
      if (codeEquipeProvisoire === "N") {
        heureDebut = \`\${max.h}:\${max.mn}:00\`;
        heureFin = \`\${min.h}:\${min.mn}:00\`;
      } else {
        heureDebut = \`\${min.h}:\${min.mn}:00\`;
        heureFin = \`\${max.h}:\${max.mn}:00\`;
      }
    }

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
  }
  // Diagnostic : comparer à la période complète "Commande allant du... au..." pour
  // repérer les jours qui n'ont même pas été détectés comme bloc (pas juste en échec de code)
  const periodeMatch = text.match(/Commande allant du\\s*(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s*au\\s*(\\d{2})\\/(\\d{2})\\/(\\d{4})/i);
  if (periodeMatch) {
    const debut = new Date(\`\${periodeMatch[3]}-\${periodeMatch[2]}-\${periodeMatch[1]}T12:00:00\`);
    const fin = new Date(\`\${periodeMatch[6]}-\${periodeMatch[5]}-\${periodeMatch[4]}T12:00:00\`);
    const datesDetectees = new Set(jours.map(j => j.date_jour));
    const datesEnEchec = new Set(echecs.filter(e => e.date).map(e => e.date));
    for (let d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) {
      const dk = \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, "0")}-\${String(d.getDate()).padStart(2, "0")}\`;
      if (!datesDetectees.has(dk) && !datesEnEchec.has(dk)) {
        echecs.push({ date: dk, motif: "jour_non_detecte" });
      }
    }
  }

  return { editionDate, jours, echecs };
}`;

content = content.slice(0, startIdx) + newFunction + content.slice(endIdx);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : parseBulletinCommande remplacée par la version finale (testée sur Dupuy et Pastant).');
