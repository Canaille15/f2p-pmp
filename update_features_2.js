const fs = require('fs');
const path = './FEATURES.md';
let content = fs.readFileSync(path, 'utf8');

const target = '**Dernière mise à jour** : 28/06/2026 — commit `238c3d4`';
const replacement = '**Dernière mise à jour** : 28/06/2026 — commit `72551ea`';

if (content.indexOf(target) === -1) {
  console.error('Ancre date/commit introuvable. Section ajoutée en fin de fichier sans modifier l\'en-tête.');
} else {
  content = content.split(target).join(replacement);
  console.log('OK : date/commit en haut de page mis à jour');
}

const section = `

## 28/06 (suite) — Bug majeur "Aujourd'hui" corrigé + ergonomie navigation

**Bug corrigé** : la fonction partagée \`getWeekDates()\` calculait mal le lundi de la semaine en cours lorsque le jour courant était un **dimanche** (cas particulier non géré : \`getDay()\` renvoie \`0\` pour dimanche, pas \`7\`). Conséquence : le bouton "Aujourd'hui" atterrissait sur la semaine suivante au lieu de la semaine en cours, sur Mon Planning (vue Semaine), CPS Officiel, et Planning Prévisionnel. Invisible le reste de la semaine — ne se révèle qu'un dimanche.

**Autres ajustements**
- Vue "Planning" (liste verticale) de Mon Planning : la journée du jour est maintenant amenée automatiquement à l'écran (scroll auto) à l'ouverture de la vue et via le bouton "Aujourd'hui".
- Ordre des 3 onglets du haut changé : Mon planning → **CPS Officiel** → Planning Prévisionnel (CPS Officiel passe avant Prévisionnel).
- Bandeau des 3 onglets rendu fixe sur mobile (plus de défilement horizontal involontaire) et contraste des libellés renforcé.

**Reste en attente** : contraste des jours dans les cellules du calendrier (vues Mois/Semaine de Mon Planning) signalé illisible — distinct du bandeau d'onglets déjà traité ici.
`;

fs.appendFileSync(path, section, 'utf8');
console.log('Section ajoutée à FEATURES.md avec succès.');
