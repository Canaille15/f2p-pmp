const fs = require('fs');
const path = './FEATURES.md';
let content = fs.readFileSync(path, 'utf8');

const target = '**Dernière mise à jour** : 28/06/2026 — commit `40b20b1`';
const replacement = '**Dernière mise à jour** : 28/06/2026 — commit `3d440cd`';

if (content.indexOf(target) === -1) {
  console.error('Ancre date/commit introuvable. Section ajoutée en fin de fichier sans modifier l\'en-tête.');
} else {
  content = content.split(target).join(replacement);
  console.log('OK : date/commit en haut de page mis à jour');
}

const section = `

## 28/06 (suite 3) — Sélecteur de profil corrigé + admin en lecture seule

**Bug corrigé** : les agents chargés depuis l'API n'avaient que le champ \`fam\`, pas \`famille\` — le sélecteur de profil (avatar + prénom en haut à droite) regroupait par \`famille\`, donc la liste PRCI/PAR restait toujours vide, même en tapant un nom de recherche.

**Comportements clarifiés**
- Le sélecteur de profil est désormais **réservé aux admins** (non-admins ne peuvent plus l'ouvrir) — cohérent avec le principe "chacun gère son propre planning".
- Quand un admin visualise un autre agent, son planning est maintenant **rechargé automatiquement** (et actualisé toutes les 45s) — avant, seul l'agent réellement connecté avait son planning en mémoire, donc l'admin voyait un calendrier vide pour les autres agents.
- **Admin = lecture seule** sur le planning des autres agents : cliquer sur un jour (vues Mois/Semaine/Planning) n'ouvre plus la popup d'édition tant que ce n'est pas son propre profil. Pour modifier quoi que ce soit, l'admin doit revenir sur son propre profil via le sélecteur. Objectif : éviter toute modification involontaire du planning d'un agent par un admin.
`;

fs.appendFileSync(path, section, 'utf8');
console.log('Section ajoutée à FEATURES.md avec succès.');
