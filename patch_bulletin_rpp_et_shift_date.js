// patch_bulletin_rpp_et_shift_date.js
// Corrections majeures dans parseBulletinCommande, decouvertes en testant un
// vrai bulletin (agent 9308712R, avril 2026) :
//
// 1. BUG DE FOND (decalage en cascade) : le code etait cherche 'au plus
//    proche' de chaque date via un point milieu entre dates. Quand deux
//    dates sont tres rapprochees dans le texte (ex: RP + annotation courte),
//    ce point milieu peut tomber EN PLEIN MILIEU du mot du code juste avant
//    la date, le rendant invisible - le code du jour SUIVANT se faisait
//    alors voler sa place, decalant en cascade tous les jours suivants
//    (ex: Lundi de Paques F2 attribue au mauvais jour, jours ulterieurs
//    tous decales de 1). Corrige : ancrage sur l'abreviation du jour
//    (Sam/Dim/Lun...) qui precede toujours son propre code sans ambiguite,
//    au lieu de la proximite textuelle avec la date.
//
// 2. Codes F1..F9/F0/FV : etaient tous transformes en 'JF' generique,
//    perdant le lien avec la fete precise -> le panneau Suivi des fetes
//    legales ne pouvait jamais detecter la bonne fete comme 'prise' via
//    l'import (et un faux-positif pouvait apparaitre sur une autre fete
//    via l'heuristique de secours 'RP dans le trimestre suivant'). Corrige :
//    le code precis (ex: F2) est desormais conserve tel quel.
//
// 3. NU (Utilisable non utilise) et RFT SAM (renfort) : n'etaient pas du
//    tout reconnus -> jour vide dans le planning, invisible aussi dans le
//    previsionnel partage. Ajoutes tous les deux.
//
// 4. Horaires HH:MM : le ':' est parfois perdu a l'extraction PDF et
//    remplace par un simple espace (ex: '13 00' au lieu de '13:00'),
//    empechant tout calcul d'horaire (bloquant en particulier RFT SAM,
//    dont l'equipe se deduit UNIQUEMENT par l'horaire). Tolerance ajoutee.
//
// Valide sur bulletin reel : 29/30 jours correctement detectes (les 2
// restants sont un jour absent du document source et un defaut OCR
// prive lie a 1 caractere minuscule, deja correctement signales comme
// 'a completer manuellement' par le mecanisme d'echecs existant).
//
// Point ouvert signale a Olivier (non corrige, incertitude) : le code
// 'PIADJXJ' (nuit) se termine par un J qui le fait classer comme
// 'Journee' au lieu de 'Nuit' malgre des horaires 21h57-06h17 - a
// clarifier si c'est un vrai code ou un artefact d'extraction.
//
// Prerequis : App.jsx doit deja avoir recu patch_rpp_import_pdf.js.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_bulletin_rpp_et_shift_date.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - ' + 'verifie que patch_rpp_import_pdf.js est bien applique.');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "  if (/^F\\d$/.test(code)) return \"JF\";\n  if (/^F-[A-Z]{2,5}$/.test(code)) return \"FOR\";\n  if (/^DISPO$/i.test(code)) return \"DISPO\";\n", "  if (/^F[0-9V]$/.test(code)) return code; // f\u00eate pr\u00e9cise (F1..F9, F0, FV) \u2014 conserv\u00e9e telle quelle pour le suivi exact\n  if (/^F-[A-Z]{2,5}$/.test(code)) return \"FOR\";\n  if (/^NU$/.test(code)) return \"NU\";\n", 'hunk_0_L338');
count++;
content = mustReplaceOnce(content, "  // codes formation type \"F-PAR\", avec ou sans espace apr\u00e8s le tiret)\n  const CODE_RE = /\\b(?:RPP|RP|RU|RQ|CA|DISPO|F[0-9V]|F-\\s?[A-Z]{2,5}|C)\\b|\\b(?:PI|PA)[A-Z0-9]{2,6}[-OXJ]/g;\n", "  // codes formation type \"F-PAR\", avec ou sans espace apr\u00e8s le tiret ; NU ; RFT SAM)\n  const CODE_RE = /\\b(?:RPP|RP|RU|RQ|CA|NU|DISPO|F[0-9V]|F-\\s?[A-Z]{2,5}|C)\\b|\\bRFT\\s?SAM\\b|\\b(?:PI|PA)[A-Z0-9]{2,6}[-OXJ]/g;\n", 'hunk_1_L383');
count++;
content = mustReplaceOnce(content, "  // D\u00e9coupage par DATE (JJ/MM/AAAA) plut\u00f4t que par nom de jour : les dates restent quasi\n  // toujours intactes, contrairement aux noms de jour (ex: \"Ven\" -> \"yen\"). On tol\u00e8re aussi\n  // un \"/\" mal reconnu en \"1\" (ex: \"04107/2026\"), d\u00e9faut r\u00e9current observ\u00e9 sur plusieurs bulletins.\n  const dateRe = /(\\d{2})[\\/1](\\d{2})\\/(\\d{4})/g;\n  const dateMatches = [...workText.matchAll(dateRe)];\n  const jours = [];\n  const echecs = [];\n\n  for (let i = 0; i < dateMatches.length; i++) {\n    const dm = dateMatches[i];\n    // Fen\u00eatre commune autour de la date : du milieu avec la date pr\u00e9c\u00e9dente\n    // au milieu avec la date suivante. Le code peut appara\u00eetre avant OU apr\u00e8s\n    // la date selon l'ordre d'extraction du PDF \u2014 on cherche dans toute la fen\u00eatre\n    // et on retient le code physiquement le plus proche de la date.\n    const winStart = i === 0 ? 0 : Math.floor((dateMatches[i - 1].index + dateMatches[i - 1][0].length + dm.index) / 2);\n    const winEnd = i + 1 < dateMatches.length ? Math.floor((dm.index + dm[0].length + dateMatches[i + 1].index) / 2) : text.length;\n    const fenetre = text.slice(winStart, winEnd);\n    const offset = winStart;\n    // Zone horaires : large, jusqu'\u00e0 la date suivante (PS/FS apparaissent toujours apr\u00e8s\n    // la date dans le document, contrairement au code qui peut se trouver avant OU apr\u00e8s)\n    const finZone = i + 1 < dateMatches.length ? dateMatches[i + 1].index : text.length;\n    const zoneHoraires = text.slice(dm.index + dm[0].length, finZone);\n\n    const dateJour = `${dm[3]}-${dm[2]}-${dm[1]}`;\n\n    let code = null;\n    let bestDist = Infinity;\n    let cm;\n\n    // Cas particulier \"Pauseur\" : le code affich\u00e9 (ex. PIPA2J) manque parfois enti\u00e8rement\n    // du texte extrait, alors que le sous-code \"du PIPA2E\" lui est toujours pr\u00e9sent dans\n    // la zone horaires du jour. On le d\u00e9tecte en priorit\u00e9 et on en d\u00e9duit le code (E -> J).\n    const pauseurMatch = zoneHoraires.match(/\\bdu\\s+PIPA([123])E\\b/i);\n    if (pauseurMatch) {\n      code = `PIPA${pauseurMatch[1]}J`;\n    }\n\n    if (!code) {\n      CODE_RE.lastIndex = 0;\n      while ((cm = CODE_RE.exec(fenetre)) !== null) {\n        const before = fenetre.slice(Math.max(0, cm.index - 5), cm.index);\n        if (/\\bdu\\s*$/i.test(before)) continue;\n        const dist = Math.abs((offset + cm.index) - dm.index);\n        if (dist < bestDist) { bestDist = dist; code = cm[0]; }\n      }\n    }\n    if (!code) { echecs.push({ date: dateJour, motif: \"code_illisible\" }); continue; }\n    code = code.replace(/^(F-)\\s+/, \"$1\"); // normalise \"F- PAR\" -> \"F-PAR\"\n\n    // Toutes les heures HH:MM trouv\u00e9es dans la zone, tri\u00e9es chronologiquement : la plus\n    // t\u00f4t est l'heure de d\u00e9but, la plus tardive la fin (invers\u00e9 pour la nuit, qui traverse\n    // minuit). Plus robuste que d'associer chaque label PS/FS \u00e0 une valeur, l'ordre du texte\n    // \u00e9tant trop variable selon les d\u00e9fauts d'extraction du PDF.\n    const valeurs = [...zoneHoraires.matchAll(/(\\d{2}):(\\d{2})/g)]\n", "  // D\u00e9coupage par DATE (JJ/MM/AAAA) : les dates restent quasi toujours intactes, contrairement\n  // aux noms de jour (ex: \"Ven\" -> \"yen\"). On tol\u00e8re aussi un \"/\" mal reconnu en \"1\"\n  // (ex: \"04107/2026\"), d\u00e9faut r\u00e9current observ\u00e9 sur plusieurs bulletins.\n  const dateRe = /(\\d{2})[\\/1](\\d{2})\\/(\\d{4})/g;\n  const dateMatches = [...workText.matchAll(dateRe)];\n\n  // Association jour <-> code : ancr\u00e9e sur l'abr\u00e9viation du jour (Sam/Dim/Lun...) plut\u00f4t que\n  // sur la proximit\u00e9 textuelle avec la date. La proximit\u00e9 pure se plante quand deux jours sont\n  // tr\u00e8s rapproch\u00e9s dans le texte (ex: \"RP\" suivi d'une annotation courte) : le point milieu de\n  // la fen\u00eatre de recherche peut tomber EN PLEIN MILIEU du mot du code juste avant la date, le\n  // rendant invisible \u2014 le code du jour SUIVANT se fait alors voler sa place, un d\u00e9calage qui se\n  // propage ensuite en cascade sur tous les jours suivants. L'abr\u00e9viation du jour pr\u00e9c\u00e8de\n  // toujours son propre code sans ambigu\u00eft\u00e9, quelle que soit la longueur du contenu : ancrage\n  // bien plus fiable, confirm\u00e9 sur bulletin r\u00e9el (04/2026, agent 9308712R).\n  const DAY_ABBR_RE = /\\b(Mer|Jeu|Ven|Sam|Dim|Lun|Mar)\\b/g;\n  const dayMatches = [...workText.matchAll(DAY_ABBR_RE)];\n  const codesParJour = dayMatches.map((dayM, idx) => {\n    const zoneStart = dayM.index + dayM[0].length;\n    const zoneEnd = idx + 1 < dayMatches.length ? dayMatches[idx + 1].index : workText.length;\n    const zone = workText.slice(zoneStart, zoneEnd);\n    // Cas particulier \"Pauseur\" : le code affich\u00e9 (ex. PIPA2J) manque parfois enti\u00e8rement\n    // du texte extrait, alors que le sous-code \"du PIPA2E\" lui est toujours pr\u00e9sent. On le\n    // d\u00e9tecte en priorit\u00e9 et on en d\u00e9duit le code (E -> J).\n    const pauseurMatch = zone.match(/\\bdu\\s+PIPA([123])E\\b/i);\n    if (pauseurMatch) return `PIPA${pauseurMatch[1]}J`;\n    CODE_RE.lastIndex = 0;\n    let cm;\n    while ((cm = CODE_RE.exec(zone)) !== null) {\n      const before = zone.slice(Math.max(0, cm.index - 5), cm.index);\n      if (/\\bdu\\s*$/i.test(before)) continue;\n      return cm[0].replace(/^(F-)\\s+/, \"$1\"); // normalise \"F- PAR\" -> \"F-PAR\"\n    }\n    return null;\n  });\n\n  const jours = [];\n  const echecs = [];\n\n  for (let i = 0; i < dateMatches.length; i++) {\n    const dm = dateMatches[i];\n    const dateJour = `${dm[3]}-${dm[2]}-${dm[1]}`;\n    // Zone horaires : jusqu'\u00e0 la date suivante (PS/FS apparaissent toujours apr\u00e8s la date\n    // dans le document). Sert aussi \u00e0 d\u00e9tecter l'annotation RPP juste apr\u00e8s la date.\n    const finZone = i + 1 < dateMatches.length ? dateMatches[i + 1].index : text.length;\n    const zoneHoraires = text.slice(dm.index + dm[0].length, finZone);\n\n    const code = codesParJour[i];\n    if (!code) { echecs.push({ date: dateJour, motif: \"code_illisible\" }); continue; }\n\n    // Toutes les heures HH:MM trouv\u00e9es dans la zone, tri\u00e9es chronologiquement : la plus\n    // t\u00f4t est l'heure de d\u00e9but, la plus tardive la fin (invers\u00e9 pour la nuit, qui traverse\n    // minuit). Plus robuste que d'associer chaque label PS/FS \u00e0 une valeur, l'ordre du texte\n    // \u00e9tant trop variable selon les d\u00e9fauts d'extraction du PDF. Le \":\" est parfois perdu \u00e0\n    // l'extraction et remplac\u00e9 par un simple espace (ex: \"13 00\" au lieu de \"13:00\") : on\n    // tol\u00e8re les deux, avec limite de minutes (0-59) pour \u00e9viter de confondre avec d'autres\n    // paires de nombres fortuites.\n    const valeurs = [...zoneHoraires.matchAll(/\\b([01]\\d|2[0-3])[:\\s]([0-5]\\d)\\b/g)]\n", 'hunk_2_L395');
count++;
content = mustReplaceOnce(content, "    const codeEquipe = deriveCodeEquipeBulletin(code, heureDebut);\n    const estCodeSpecial = /^(RPP|RP|RU|RQ|C|CA|DISPO)$/.test(code) || /^F[0-9V]$/.test(code) || /^F-[A-Z]{2,5}$/.test(code);\n", "    const codeEquipeBrut = deriveCodeEquipeBulletin(code, heureDebut);\n    // Sur le bulletin r\u00e9el, un RPP est imprim\u00e9 comme \"RP\" suivi d'une ligne\n    // d'annotation juste apr\u00e8s la date (le mot \"RPP\", mais le \"R\" initial\n    // dispara\u00eet syst\u00e9matiquement \u00e0 l'extraction : on observe \"PP\", \"Pp\", \"p\"\n    // ou \":PP\" selon les jours). On cherche cette annotation juste apr\u00e8s la\n    // date, avant tout autre contenu \u2014 un vrai RP simple n'a rien \u00e0 cet\n    // endroit (le jour suivant s'encha\u00eene directement).\n    let codeEquipe = codeEquipeBrut;\n    if (codeEquipeBrut === \"RP\") {\n      const apresDate = zoneHoraires.replace(/^\\s+/, \"\");\n      if (/^:?\\s*[pP]{1,2}\\b/.test(apresDate)) codeEquipe = \"RPP\";\n    }\n    const estCodeSpecial = /^(RPP|RP|RU|RQ|C|CA|DISPO|NU)$/.test(code) || /^RFT\\s?SAM$/i.test(code) || /^F[0-9V]$/.test(code) || /^F-[A-Z]{2,5}$/.test(code);\n", 'hunk_3_L466');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);