const fs = require('fs');
const path = './FEATURES.md';
let content = fs.readFileSync(path, 'utf8');

const target = '**Dernière mise à jour** : 28/06/2026 — commit `72551ea`';
const replacement = '**Dernière mise à jour** : 28/06/2026 — commit `40b20b1`';

if (content.indexOf(target) === -1) {
  console.error('Ancre date/commit introuvable. Section ajoutée en fin de fichier sans modifier l\'en-tête.');
} else {
  content = content.split(target).join(replacement);
  console.log('OK : date/commit en haut de page mis à jour');
}

const section = `

## 28/06 (suite 2) — Passe de contraste et tailles responsives

Suite aux remarques d'Olivier (texte trop petit/fade, surtout sur ordinateur et tablette), passage en tailles **responsives** (CSS \`clamp()\`) plutôt qu'en pixels fixes pour les éléments de navigation des calendriers : compact sur mobile, nettement plus grand sur tablette/ordinateur, sans média-query.

- Cellules du calendrier Mon Planning (vues Mois et Semaine) : numéro/nom du jour agrandis, gris clair remplacé par des couleurs à fort contraste.
- Toggle Mois/Semaine/Planning et les 3 boutons "Aujourd'hui" (Mon Planning + CPS Officiel/Prévisionnel) : agrandis et **harmonisés** (taille strictement identique partout, ne change plus en changeant d'onglet).
- Bandeau des 3 onglets du haut : texte responsive, poids de police uniforme entre onglet actif/inactif (la sélection ne se voit plus que par la couleur et le soulignement).
- Bloc "Postes habilités" (profil réserviste) : libellé et badges plus contrastés.
`;

fs.appendFileSync(path, section, 'utf8');
console.log('Section ajoutée à FEATURES.md avec succès.');
