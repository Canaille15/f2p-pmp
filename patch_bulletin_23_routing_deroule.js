// patch_bulletin_23_routing_deroule.js
// Met à jour BulletinImportButton dans App.jsx pour :
//  - Détecter automatiquement si le fichier importé est un déroulé prévisionnel ou un bulletin
//  - Router vers parseDeroulePrevisionnel() ou parseBulletinCommande() selon le cas
//  - Passer source_type='previsionnel' ou 'bulletin' au backend
// Utilise des repères stables (indexOf sur noms de fonctions) pour éviter les problèmes d'ancre.
// Exécution : node patch_bulletin_23_routing_deroule.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Vérifier que parseDeroulePrevisionnel existe
if (!content.includes('function parseDeroulePrevisionnel')) {
  throw new Error("parseDeroulePrevisionnel introuvable — lance d'abord patch_bulletin_21_deroule_previsionnel.js");
}

// Vérifier que le routing n'est pas déjà en place
if (content.includes('isDeroule')) {
  console.log('⚠️  Le routing déroulé/bulletin est déjà en place dans BulletinImportButton — aucune modification appliquée.');
  process.exit(0);
}

// Repères stables pour localiser le bloc à remplacer dans BulletinImportButton
const START_MARKER = "const { jours, echecs } = parseBulletinCommande(text);";
const END_MARKER   = "const resp = await api.planning.importBulletin(agentCp, entries, \"bulletin\");";

const startIdx = content.indexOf(START_MARKER);
const endIdx   = content.indexOf(END_MARKER);

if (startIdx === -1) throw new Error("Marqueur de début introuvable (parseBulletinCommande) dans BulletinImportButton.");
if (endIdx   === -1) throw new Error("Marqueur de fin introuvable (api.planning.importBulletin) dans BulletinImportButton.");
if (endIdx < startIdx) throw new Error("Marqueurs dans le mauvais ordre — vérifie le fichier manuellement.");

const before = content.slice(0, startIdx);
const after  = content.slice(endIdx + END_MARKER.length);

const newBlock =
`// Détection auto : déroulé prévisionnel (grille annuelle) ou bulletin de commande
        const isDeroule = /D.+roul.+Pr.+visionnel/i.test(text) || /Affectations de l.agent/i.test(text);
        let entries, sourceType, echecs;

        if (isDeroule) {
          const res = parseDeroulePrevisionnel(text);
          echecs = res.echecs;
          entries = res.jours;
          sourceType = "previsionnel";
          if (entries.length === 0) throw new Error("Aucun jour reconnu dans le d\u00e9roul\u00e9 \u2014 v\u00e9rifie le format du document");
        } else {
          const res = parseBulletinCommande(text);
          echecs = res.echecs;
          entries = res.jours;
          sourceType = "bulletin";
          if (entries.length === 0) throw new Error("Aucun jour reconnu \u2014 v\u00e9rifie le format du document");
        }

        const resp = await api.planning.importBulletin(agentCp, entries, sourceType);`;

content = before + newBlock + after;

// Mettre à jour le calcul des postesLabels pour gérer les deux formats
const oldPostes = `const postesLabels = [...new Set(entries.map(e => getPosteLabelFromCode(e.code_poste)).filter(Boolean))];`;
if (content.includes(oldPostes)) {
  const newPostes = `const allCodes = entries.flatMap(e => e.periodes ? e.periodes.map(p => p.code_poste) : [e.code_poste]);
        const postesLabels = [...new Set(allCodes.map(c => getPosteLabelFromCode(c)).filter(Boolean))];`;
  content = content.replace(oldPostes, newPostes);
  console.log('✅ postesLabels mis à jour pour le déroulé (multi-périodes).');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : routing automatique bulletin vs déroulé prévisionnel.');
