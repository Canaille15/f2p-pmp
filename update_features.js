const fs = require('fs');
const path = './FEATURES.md';
let content = fs.readFileSync(path, 'utf8');

function mustReplaceOnce(str, target, replacement, label) {
  const count = str.split(target).length - 1;
  if (count !== 1) {
    console.error('ATTENTION : "' + label + '" trouvé ' + count + ' fois (attendu 1). Ignoré par sécurité.');
    return { str, ok: false };
  }
  console.log('OK : ' + label);
  return { str: str.split(target).join(replacement), ok: true };
}

let ok = true;

// 1. Date / commit en haut
{
  const r = mustReplaceOnce(content,
    '**Dernière mise à jour** : 27/06/2026 — commit `372feb6`',
    '**Dernière mise à jour** : 28/06/2026 — commit `238c3d4`',
    'date/commit en haut de page');
  content = r.str; ok = ok && r.ok;
}

// 2. Remplacement complet de la section 7 (ancien système abandonné)
{
  const oldSection = `## 7. Échanges entre agents

- Proposition d'échange de service entre agents habilités sur le même poste
- Réponses : Accepté / Refusé / Occasionnel
- Option "Pas d'échange" désactivable par agent

---`;
  const newSection = `## 7. Échanges entre agents

Module reconstruit le 28/06 (l'ancien système — candidatures/validations avec modification automatique du planning — a été abandonné sans jamais avoir été réellement utilisé).

- **Principe** : une demande = une journée. L'agent choisit la date à échanger ; le poste et les horaires qu'il occupe ce jour-là sont **récupérés automatiquement** depuis son planning personnel (jamais saisis à la main), avec gestion du cas particulier d'une nuit (le poste réel est cherché sur le début de nuit de la veille si le jour choisi n'affiche qu'une fin de nuit)
- **Critères de recherche** : créneau souhaité (matin / journée / soirée / nuit / indifférent), case "urgent" (garde d'enfant, médical...), motif libre visible par tous
- **Aucune modification automatique du planning** de qui que ce soit (version "tableau d'annonces") : le bouton "Je suis intéressé" n'est qu'un signal de contact, plusieurs agents peuvent se déclarer intéressés sur la même demande pour débloquer des échanges à plusieurs
- **Droits** : seul le demandeur peut modifier (y compris changer la date, avec recalcul automatique du poste), clôturer (en précisant avec qui l'échange a eu lieu, avec rappel à l'écran de le reporter manuellement dans le CPS Officiel), ou supprimer sa demande, à tout moment
- **Statuts visuels** : orange (ouverte), rouge (ouverte + urgent), vert (clôturée, en attente de la date d'échange), gris (date passée)
- **Purge automatique** : les demandes dont la date est passée depuis plus de 2 mois sont supprimées de la base à chaque chargement de la liste
- **Accès** : lien "Échanges" dans le menu latéral, avec une cloche affichant le nombre de demandes ouvertes ; un bandeau identique apparaît aussi dans Mon Planning (peut être masqué avec ✕, ne doit revenir qu'en cas de nouvelle demande)

---`;
  const r = mustReplaceOnce(content, oldSection, newSection, 'remplacement complet de la section Échanges');
  content = r.str; ok = ok && r.ok;
}

// 3. Retirer le chantier "repositionner le bouton Échanges" devenu obsolète
{
  const r = mustReplaceOnce(content,
    '- Repositionner le bouton "Échanges" (mentionné comme mal placé)\n',
    '',
    'retrait du chantier "repositionner le bouton Échanges" (résolu)');
  content = r.str; ok = ok && r.ok;
}

// 4. Ajouter une ligne "Résolu cette session (28/06)" après celle du 27/06
{
  const anchor = "✅ **Résolu cette session (27/06)**";
  const idx = content.indexOf(anchor);
  if (idx === -1) {
    console.error('ATTENTION : ancre "Résolu cette session (27/06)" introuvable.');
    ok = false;
  } else {
    const endOfLine = content.indexOf('\n', idx);
    const insertion = `\n\n✅ **Résolu cette session (28/06)** : module Échanges entièrement reconstruit et déployé (voir section 7) ; bug de décalage d'1 jour sur l'affichage des dates partout dans l'appli corrigé (\`dateStrings\` dans la config DB) ; bug de doublon de la ligne "début de nuit" lors de la sauvegarde d'une nuit corrigé ; bug "Sélectionne ton profil" sur la page Échanges après F5 corrigé.\n\n📌 **Nouveaux points en attente** : table \`poste\` (référentiel des codes/libellés) toujours vide, jamais peuplée ; contraste des jours dans Mon Planning signalé illisible ; comportement de réapparition du bandeau Échanges pas formellement revérifié.`;
    content = content.slice(0, endOfLine + 1) + insertion + content.slice(endOfLine + 1);
    console.log('OK : ajout du bloc "Résolu cette session (28/06)"');
  }
}

// 5. Nouvelle ligne dans l'historique des sessions
{
  const anchor = '| 27/06 | **Refonte complète de la navigation par date**';
  const idx = content.indexOf(anchor);
  if (idx === -1) {
    console.error('ATTENTION : ligne historique du 27/06 introuvable.');
    ok = false;
  } else {
    const endOfLine = content.indexOf('\n', idx);
    const newRow = `\n| 28/06 | **Module Échanges** reconstruit de zéro et déployé (création, créneau souhaité, urgent, motif, "Je suis intéressé", clôture, suppression, cloche+compteur, bandeau fermable, date modifiable, purge auto 2 mois) ; fix décalage date (lecture, \`db.js\`) ; fix doublon "début de nuit" (sauvegarde, \`client.js\`) ; fix page Échanges bloquée après F5 |`;
    content = content.slice(0, endOfLine + 1) + newRow + content.slice(endOfLine + 1);
    console.log('OK : ajout de la ligne historique 28/06');
  }
}

if (!ok) {
  console.error('\nAU MOINS UNE ÉTAPE A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nFEATURES.md mis à jour avec succès.');
