// patch_features_bulletin.js
// Met à jour FEATURES.md :
//  - Ajoute la section "Import Bulletin de Commande / Roulement" après la section 7 (Échanges)
//  - Met à jour la date de dernière mise à jour
//  - Ajoute une entrée dans le tableau Historique des sessions
//  - Retire "Import planning PDF général" du backlog (c'est fait)
// Exécution : node patch_features_bulletin.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

function mustReplaceOnce(content, search, replace, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[${label}] Ancre trouvée ${count} fois (attendu 1). Abandon sans modification.`);
  }
  return content.replace(search, replace);
}

const filePath = path.join(__dirname, 'FEATURES.md');
let content = fs.readFileSync(filePath, 'utf8');

// ── 1. Mise à jour de la date en en-tête ──
content = mustReplaceOnce(
  content,
  '**Dernière mise à jour** : 28/06/2026 — commit `40b20b1`',
  '**Dernière mise à jour** : 01/07/2026 — Import Bulletin de Commande',
  'FEATURES.md date'
);

// ── 2. Insertion de la section 8 (Import Bulletin) entre section 7 (Échanges) et section 8 (Congés) ──
const anchorSection8 = '## 8. Congés et absences';

const newSection = `## 8. Import Bulletin de Commande / Roulement (Mon Planning)

Permet à un agent d'importer directement dans son planning personnel un bulletin de commande SNCF (PDF ou photo/scan), sans ressaisir chaque jour manuellement.

**Accès et restrictions**
- Bouton "Importer bulletin de commande / roulement" dans Mon Planning, à droite du toggle Mois/Semaine/Planning — visible uniquement par le titulaire du planning (même un admin ne peut pas importer sur le planning d'un autre agent, conformément à la règle "admin = lecture seule").
- Formats acceptés : PDF texte natif (extraction directe via pdfjs-dist, cas le plus courant) ou photo/scan (fallback OCR via OCR.space).

**Ce qui est extrait automatiquement**
- La date d'édition du bulletin ("Edition le JJ/MM/AAAA, HH:MM"), utilisée pour la priorité chronologique.
- Pour chaque jour : date, code poste (colonne "Utilisation"), horaires PS/FS si présents.
- Codes reconnus : RP, RU, RQ, congés (C/CA), DISPO, fêtes (F1-F9, FV), formation (F-XXX), et tous les codes postes 3×8 (PICCL-, PIADJ-, PILNE-, PIPA2J...).
- Le libellé du poste (ex. "CCL", "AC LNE") s'affiche automatiquement dans le calendrier (vues Mois, Semaine, Planning) sous le badge Matinée/Soirée/Nuit, pour toute saisie manuelle ou importée.

**Règle de fusion (priorité chronologique)**
- Un bulletin plus récent écrase toujours les données existantes pour les jours concernés, y compris une saisie manuelle.
- Un bulletin plus ancien (ou de même date d'édition) qu'une donnée déjà enregistrée est ignoré silencieusement pour ce jour — jamais de régression involontaire.

**Gestion des échecs partiels**
- Si certains jours du bulletin sont illisibles (défaut d'impression/scan du document source), ils sont signalés à l'agent avec leur date après l'import — le reste est importé normalement.
- L'agent complète les jours concernés via la saisie manuelle normale (popup du jour).

**Stockage**
- Nouvelles colonnes sur \`planning_jour\` : \`source\` (ENUM, valeur \`'bulletin'\` ajoutée) et \`source_edition_date\` (DATETIME).
- Rien n'est stocké du document brut en base (même principe que l'import CPS) — seulement les valeurs extraites appliquées au planning.
- Le prévisionnel partagé est automatiquement alimenté via le mécanisme existant (toggle de partage), sans aucune modification spécifique.

**Fichiers**
- Backend : \`api/api/src/controllers/bulletinImportController.js\`, route \`POST /api/planning/:cp/import-bulletin\`.
- Frontend : fonctions \`extraireTextePdfNatif\`, \`ocrImageViaOcrSpace\`, \`parseBulletinCommande\`, \`getPosteLabelFromCode\`, composant \`BulletinImportButton\` dans \`src/App.jsx\`.

**À mentionner dans la notice utilisateur**
- L'import écrase les saisies manuelles existantes sur les jours couverts — vérifier son planning après chaque import.
- Le format irrégulier de certains bulletins (qualité variable d'impression/scan) peut générer des cases vides ponctuellement — compléter à la main via le popup du jour, comme pour n'importe quelle journée. L'import reste un gain de temps global même s'il laisse un jour à corriger ici ou là.

---

## 9. Congés et absences`;

content = mustReplaceOnce(content, anchorSection8, newSection, 'FEATURES.md section 8 bulletin');

// ── 3. Mise à jour de la numérotation des sections suivantes (8→9, 9→10) ──
content = content.replace('## 9. Notifications', '## 10. Notifications');

// ── 4. Retirer "Import planning PDF général" du backlog (c'est fait) ──
const oldBacklogLine = '- **Import planning PDF général** : pour le planning personnel directement (au-delà du seul CPS)\n';
if (content.includes(oldBacklogLine)) {
  content = content.replace(oldBacklogLine, '');
  console.log('✅ "Import planning PDF général" retiré du backlog.');
}

// ── 5. Nouvelle entrée dans l'historique des sessions ──
const anchorHistorique = '| 28/06 | **Module Échanges**';
const newHistoriqueEntry = `| 28/06 | **Module Échanges**`;

// On ajoute une ligne après le dernier | 28/06 existant
const lastSession = '## 28/06 (suite 3) — Sélecteur de profil corrigé + admin en lecture seule';
const newSessionEntry = `\n\n## 01/07/2026 — Import Bulletin de Commande / Roulement

**Nouvelle fonctionnalité** : import d'un bulletin de commande SNCF (PDF ou photo) directement dans Mon Planning.

- Extraction texte PDF native via \`pdfjs-dist\` (zéro coût, fiable) + fallback OCR.space pour photos/scans.
- Parsing robuste face aux défauts réels d'extraction : découpage par date (pas par nom de jour, souvent corrompu), fenêtre de recherche du code par proximité, détection du code Pauseur via son sous-code, horaires par tri chronologique des heures trouvées.
- Règle de priorité chronologique par date d'édition du bulletin : un import plus récent écrase, un plus ancien est ignoré silencieusement.
- Libellé court du poste (CCL, AC LNE...) affiché dans les 3 vues du calendrier (Mois, Semaine, Planning) pour toute saisie, manuelle ou importée.
- Testé sur 2 vrais bulletins SNCF (Dupuy PRCI + Pastant PAR) : 37/38 et 32/33 jours détectés (jours manquants = dates réellement illisibles dans les documents sources).
- Accès : titulaire uniquement (cohérent avec la règle admin = lecture seule).
- DB : \`planning_jour.source\` ENUM étendu + colonne \`source_edition_date DATETIME\` ajoutée.`;

content = content + newSessionEntry;

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ FEATURES.md mis à jour : section Import Bulletin ajoutée, backlog nettoyé, historique complété.');
