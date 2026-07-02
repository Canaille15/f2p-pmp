# F2P.PMP — Suivi des fonctionnalités

> Document vivant, mis à jour à la fin de chaque session de développement.
> Servira de base à la documentation PDF imprimable (à venir).

**Dernière mise à jour** : 01/07/2026 — Import Bulletin de Commande

---

## Stack technique

- **Frontend** : React 18 + Vite 5, déployé sur Vercel
- **Backend** : Node.js + Express, déployé sur Railway
- **Base de données** : MariaDB (Railway)
- **Repo** : https://github.com/Canaille15/f2p-pmp (branche `main`)
- **Site en ligne** : https://f2p-pmp.vercel.app

---

## 0. Navigation

- **Barre du haut** : les 3 plannings principaux toujours visibles (Mon planning / Planning Prévisionnel / CPS Officiel)
- **Menu latéral** ☰ (bouton à gauche du logo, glisse depuis la gauche) : regroupe les 3 plannings (par cohérence) + Échanges + Mon profil + Admin (si admin) + Déconnexion, en texte complet
- L'application retient la dernière vue ouverte tant qu'on ne se déconnecte pas (persistant sur l'appareil)
- **Navigation par date** (CPS Officiel, Prévisionnel, et Mon planning - Semaine/Mois/Planning) :
  - "Aujourd'hui" + titre cliquable (mois/année) groupés à gauche — le clic sur le titre ouvre un sélecteur de date natif pour sauter directement à une date lointaine, sans avoir à cliquer plusieurs fois
  - Plus de flèches précédent/suivant (jugées redondantes avec le clic direct sur les jours et le glissement tactile)
  - **Glissement tactile (swipe)** : glisser le doigt vers la gauche/droite sur la zone de contenu change de jour (CPS/Prévisionnel) ou de semaine/mois (planning perso)
  - Rangée des 7 jours (Lu-Di) : défilement horizontal plutôt que retour à la ligne, robuste sur tous les écrans

## 1. Authentification & gestion des agents

- Connexion par CP SNCF + code PIN (4 chiffres), multi-appareils
- Premier login : création de PIN obligatoire
- Mot de passe oublié : réinitialisation par un administrateur
- **Panneau Admin** (réservé aux comptes admin, ex: CP 6810186B) :
  - Indicateur visuel 👑 en haut de l'écran : affiché uniquement quand on est connecté avec les droits admin actifs (n'apparaît pas pour un compte normal)
  - Liste complète des agents avec recherche et filtre PRCI/PAR
  - Création d'un nouvel agent (CP, nom, prénom, grade, famille)
  - **Modification d'un agent** : nom, prénom, grade, famille, et **CP** (avec confirmation — cascade automatique sur les 17 tables liées, aucune perte de données)
  - **Donner/retirer les droits admin** à un agent (bouton "Rendre admin" / "Admin")
  - Réinitialisation du PIN d'un agent
  - Suppression d'un agent
  - Rafraîchissement automatique de la liste (à chaque création/modification/suppression, + vérification périodique toutes les 45 secondes pour la synchro entre appareils)

---

## 2. Planning personnel (vue "Mon planning")

- Saisie via popup au clic sur un jour :
  - Type de journée : Matinée / Après-midi / Nuit / Journée / Formation / Disponible / Repos / Congés / Maladie / etc.
  - Sélection du poste tenu (filtré par habilitations de l'agent — sauf "Journée spéciale", voir section 6)
  - Saisie des horaires
  - Poste de nuit (si double période dans la même journée)
  - Trois boutons de suppression : journée seule / nuit seule / tout supprimer
- Vue mois (calendrier) et vue planning (timeline avec barres horaires)
- Badge "fin de nuit" 🌙 (cosmétique, n'affecte pas les compteurs)
- **Compteurs** : Travail, RP, RU, RQ, RN, TC, TY, Congés (CA/CP), Maladie, Formation, avec corrections manuelles possibles
- **Fêtes SNCF** : calcul automatique des dates, suivi du statut (à prendre / prise / payée / perdue), règles de péremption par trimestre
- **Pause Figée** : suivi des FIA (90 min par jour concerné), regroupement par mois
- **Habilitations** : gestion des postes qualifiés par agent (PRCI / PAR), niveaux (HC, etc.)
- Personnalisation des couleurs par code (par agent)

---

## 3. CPS Officiel (planning officiel SNCF)

- **Postes Pauseur PRCI renommés clairement** : PIPA1J → "Pauseur CCL", PIPA2J → "Pauseur Adjoint", PIPA3J → "Pauseur VGD" (au lieu des codes génériques PA1/PA2/PA3, peu parlants) — badge "/F" (allowFormation) retiré sur ces postes + PAASMJ, jugé inutile
- **Bandeau d'en-tête** : "FEUILLE DE PRESENCE JOURNALIERE" (fond bleu marine plein, icône 📋), pour identifier clairement la vue
- **Message explicatif en bas de page** (texte exact, à reprendre dans la notice utilisateur) :
  > "La feuille de présence officielle ne peut pas être modifiée ici.
  > Seuls les signalements 🔄 (échange de poste, erreur CPS) viennent s'ajouter par-dessus, à titre indicatif."
- **Import automatique** par photo ou PDF de la feuille de présence journalière :
  - OCR via OCR.space (extraction du texte)
  - Reconnaissance des codes de poste (PICCL-, PIADJ-, PPRCI, PPAR, etc.)
  - Reconnaissance des agents par nom (avec tolérance aux fautes via distance de Levenshtein)
  - Gestion des préfixes `#` (JS modifiée) et `*` (JS demi-couverte) — ignorés sans impact sur la détection
- Affichage par période (Matinée / Après-midi / Nuit / Journée / Divers)
- **Gestion des écarts (aléas)** 🔄 : signaler un échange, une erreur CPS, ou un poste non tenu
- **Badge "⚠ Conflit"** : alerte visuelle quand plusieurs agents apparaissent sur le même poste 3x8
- **Recherche** : filtre les agents affichés dans toutes les cases
- **Bouton import** : visible uniquement côté CPS Officiel (masqué côté Prévisionnel)
- **Popups signalement/aléa** : la liste de noms n'apparaît qu'après avoir tapé une recherche (plus de liste complète affichée d'office)

---

## 4. Planning Prévisionnel

- **Bandeau d'en-tête** : "Planning prévisionnel partagé" + sous-titre (fond violet plein, icône 📅), pour bien différencier du CPS Officiel
- **Message explicatif en bas de page** (texte exact, à reprendre dans la notice utilisateur) :
  > "Ici, chaque agent partage volontairement son planning personnel (à activer dans Mon Profil) pour aider à s'organiser collectivement.
  > Seules les journées de travail sont partagées — le reste (congés, absences...) ne l'est pas.
  > Ces informations restent indicatives et ne remplacent jamais la feuille de présence officielle — en cas d'écart, rapproche-toi de l'encadrement."
- Basé sur les **plannings personnels partagés** des agents (toggle "Partager mon planning", activable dans Mon Profil)
- Synchronisation automatique : au login, après modification du planning perso (avec délai de 1.5s), et toutes les 45s
- **Bandeau d'identité visuelle** dédié ("📅 Planning prévisionnel partagé") pour bien différencier de la vue CPS Officiel
- **Signalement** 🔄 : indiquer qui remplace réellement un titulaire prévu (jusqu'à 4 remplaçants), avec résolution automatique si le planning personnel est mis à jour en conséquence
- Gestion multi-agents sur un même poste (illimité, avec badge conflit)

---

## 5. Identité visuelle CPS Officiel / Prévisionnel

- Contraste renforcé : badges de poste en fond plein coloré, pastilles famille (PRCI bleu / PAR vert)
- Bordure gauche colorée par famille sur chaque ligne
- Cases agent légèrement teintées selon la famille
- Sélecteur "Tous / PRCI / PAR" à fort contraste

---

## 6. Journée spéciale (PPRCI / PPAR)

Fonctionnalité couvrant les journées hors poste habituel (réunion, visite de poste, journée équipe...) :

- Sélectionnable par **n'importe quel agent**, peu importe sa famille (PRCI ou PAR) et sans condition d'habilitation
- Regroupées ensemble dans un groupe dédié "🗂 Journée spéciale" (CPS Officiel et Prévisionnel), avec un nombre d'agents illimité sur la même case
- **Pense-bête privé** : note libre saisie dans le planning personnel, visible uniquement par l'agent lui-même (jamais partagée), affichée directement sous le poste dans sa case personnelle
- **Message public** 📝 : indépendant du pense-bête, peut être écrit/modifié par n'importe quel agent depuis le CPS Officiel ou le Prévisionnel, visible par tous dans les deux vues

---

## 7. Échanges entre agents

Module reconstruit le 28/06 (l'ancien système — candidatures/validations avec modification automatique du planning — a été abandonné sans jamais avoir été réellement utilisé).

- **Principe** : une demande = une journée. L'agent choisit la date à échanger ; le poste et les horaires qu'il occupe ce jour-là sont **récupérés automatiquement** depuis son planning personnel (jamais saisis à la main), avec gestion du cas particulier d'une nuit (le poste réel est cherché sur le début de nuit de la veille si le jour choisi n'affiche qu'une fin de nuit)
- **Critères de recherche** : créneau souhaité (matin / journée / soirée / nuit / indifférent), case "urgent" (garde d'enfant, médical...), motif libre visible par tous
- **Aucune modification automatique du planning** de qui que ce soit (version "tableau d'annonces") : le bouton "Je suis intéressé" n'est qu'un signal de contact, plusieurs agents peuvent se déclarer intéressés sur la même demande pour débloquer des échanges à plusieurs
- **Droits** : seul le demandeur peut modifier (y compris changer la date, avec recalcul automatique du poste), clôturer (en précisant avec qui l'échange a eu lieu, avec rappel à l'écran de le reporter manuellement dans le CPS Officiel), ou supprimer sa demande, à tout moment
- **Statuts visuels** : orange (ouverte), rouge (ouverte + urgent), vert (clôturée, en attente de la date d'échange), gris (date passée)
- **Purge automatique** : les demandes dont la date est passée depuis plus de 2 mois sont supprimées de la base à chaque chargement de la liste
- **Accès** : lien "Échanges" dans le menu latéral, avec une cloche affichant le nombre de demandes ouvertes ; un bandeau identique apparaît aussi dans Mon Planning (peut être masqué avec ✕, ne doit revenir qu'en cas de nouvelle demande)

---

## 8. Import Bulletin de Commande / Roulement (Mon Planning)

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
- Nouvelles colonnes sur `planning_jour` : `source` (ENUM, valeur `'bulletin'` ajoutée) et `source_edition_date` (DATETIME).
- Rien n'est stocké du document brut en base (même principe que l'import CPS) — seulement les valeurs extraites appliquées au planning.
- Le prévisionnel partagé est automatiquement alimenté via le mécanisme existant (toggle de partage), sans aucune modification spécifique.

**Fichiers**
- Backend : `api/api/src/controllers/bulletinImportController.js`, route `POST /api/planning/:cp/import-bulletin`.
- Frontend : fonctions `extraireTextePdfNatif`, `ocrImageViaOcrSpace`, `parseBulletinCommande`, `getPosteLabelFromCode`, composant `BulletinImportButton` dans `src/App.jsx`.

**À mentionner dans la notice utilisateur**
- L'import écrase les saisies manuelles existantes sur les jours couverts — vérifier son planning après chaque import.
- Le format irrégulier de certains bulletins (qualité variable d'impression/scan) peut générer des cases vides ponctuellement — compléter à la main via le popup du jour, comme pour n'importe quelle journée. L'import reste un gain de temps global même s'il laisse un jour à corriger ici ou là.

---

## 9. Congés et absences

- Formulaire de demande d'absence (génération PDF au format SNCF + envoi par mail)
- Suivi des accords/refus
- Notifications de reliquats de congés annuels (28 jours/an)

---

## 10. Notifications

- Rappels automatiques liés aux fêtes SNCF (échéances de péremption)
- Alertes de reliquats de congés
- Écarts détectés entre CPS et planning personnel

---

## 📌 Chantiers en attente (inventaire exhaustif au 27/06)

**Nouveaux modules à créer**
- **Module Formation dédié** : actuellement juste un badge/regroupement basique dans CPS/Prévisionnel — prévoir un vrai module (suivi, planification, historique)
- **Annuaire des agents** : liste/recherche centralisée avec coordonnées, postes, habilitations
- **Refonte du module Fêtes SNCF** : le suivi existe (section 2) mais une refonte plus ergonomique était évoquée
- **Vue "Comparaison" CPS Officiel vs Prévisionnel** : détection automatique des écarts entre les deux plannings (actuellement repéré manuellement, comme on l'a fait pour HERN/PIVGD-)
- **Calendrier cliquable multi-mois** : navigation rapide entre mois éloignés (en partie couvert par le sélecteur de date ajouté aujourd'hui — à réévaluer si toujours nécessaire)
- **Documentation PDF imprimable** : à construire à partir de ce document `FEATURES.md`, avec liens cliquables, gardée dans l'application

**Améliorations ergonomie/affichage**
- Affichage du motif des aléas CPS directement sur les cases (actuellement visible seulement en ouvrant le détail)
- Vérification fonctionnelle complète du panneau Admin (au-delà du toggle admin et de la modification d'agent déjà faits)

**Dette technique**
1. **`AddAgentModal`** (composant dans `App.jsx` avec import IA photo/PDF) semble redondant avec le vrai formulaire d'Admin — à clarifier (supprimer ou rebrancher)
2. **Nettoyage du dépôt** : résidus de terminal (`cd`, `node`, `powershell`, `vite`, fichiers mal nommés) jamais faits
3. **Gestion des noms identiques** (ex: deux agents prénommés Yvon) : identifié, pas creusé
4. **Bug clavier PIN mobile** : signalé anciennement, statut à réévaluer (peut-être déjà résolu indirectement par les corrections de focus de connexion faites le 27/06 — à vérifier)

✅ **Résolu cette session (27/06)** : bug de décalage de date (`TODAY` UTC vs heure locale), panneau admin obsolète remplacé par un vrai toggle connecté au serveur, focus de connexion (CP avant PIN), **protection contre la régression OCR** au ré-import CPS (un `jsCode` valide n'est plus écrasé par `null` si l'OCR rate sa lecture lors d'un second import — la valeur précédente est automatiquement conservée).


✅ **Résolu cette session (28/06)** : module Échanges entièrement reconstruit et déployé (voir section 7) ; bug de décalage d'1 jour sur l'affichage des dates partout dans l'appli corrigé (`dateStrings` dans la config DB) ; bug de doublon de la ligne "début de nuit" lors de la sauvegarde d'une nuit corrigé ; bug "Sélectionne ton profil" sur la page Échanges après F5 corrigé.

📌 **Nouveaux points en attente** : table `poste` (référentiel des codes/libellés) toujours vide, jamais peuplée ; contraste des jours dans Mon Planning signalé illisible ; comportement de réapparition du bandeau Échanges pas formellement revérifié.
---

## Historique des sessions

| Date | Résumé |
|------|--------|
| 02-04/06 | Architecture initiale (React+Vite+Supabase, puis migration MariaDB/Railway), authentification CP+PIN, planning personnel de base, compteurs |
| 12/06 | Sync API au login, en-tête agent, popup de saisie multi-périodes, nuits |
| 23/06 | Timezone fix, persistance vues, OCR amélioré, **CPS aléas** (échange/erreur/non tenu) |
| 25/06 | **Planning Prévisionnel Partagé** complet (toggle partage, signalement, résolution auto), Admin (création/modification agent), polling 45s |
| 26/06 | **Journée spéciale** complète (PPRCI/PPAR, pense-bête privé, message public partagé), corrections CP modifiable (cascade FK), recherche dans cases, multiples bugs OCR/agents manquants corrigés |
| 26/06 (suite) | UX recherche agent dans popups (liste cachée tant qu'aucune saisie), **menu latéral coulissant** (3 plannings visibles + reste regroupé), toggle admin réel dans Admin, suppression du panneau admin obsolète (AdminAuthPanel, code mort lié à l'ancien système d'auth local) |
| 27/06 | **Refonte complète de la navigation par date** sur les 3 plannings : Aujourd'hui + sélecteur de date groupés à gauche, suppression des flèches, **glissement tactile (swipe)** partout, rangée de jours défilante, **fix du bug timezone TODAY** (UTC vs heure locale) |

| 28/06 | **Module Échanges** reconstruit de zéro et déployé (création, créneau souhaité, urgent, motif, "Je suis intéressé", clôture, suppression, cloche+compteur, bandeau fermable, date modifiable, purge auto 2 mois) ; fix décalage date (lecture, `db.js`) ; fix doublon "début de nuit" (sauvegarde, `client.js`) ; fix page Échanges bloquée après F5 |

## 28/06 (suite) — Bug majeur "Aujourd'hui" corrigé + ergonomie navigation

**Bug corrigé** : la fonction partagée `getWeekDates()` calculait mal le lundi de la semaine en cours lorsque le jour courant était un **dimanche** (cas particulier non géré : `getDay()` renvoie `0` pour dimanche, pas `7`). Conséquence : le bouton "Aujourd'hui" atterrissait sur la semaine suivante au lieu de la semaine en cours, sur Mon Planning (vue Semaine), CPS Officiel, et Planning Prévisionnel. Invisible le reste de la semaine — ne se révèle qu'un dimanche.

**Autres ajustements**
- Vue "Planning" (liste verticale) de Mon Planning : la journée du jour est maintenant amenée automatiquement à l'écran (scroll auto) à l'ouverture de la vue et via le bouton "Aujourd'hui".
- Ordre des 3 onglets du haut changé : Mon planning → **CPS Officiel** → Planning Prévisionnel (CPS Officiel passe avant Prévisionnel).
- Bandeau des 3 onglets rendu fixe sur mobile (plus de défilement horizontal involontaire) et contraste des libellés renforcé.

**Reste en attente** : contraste des jours dans les cellules du calendrier (vues Mois/Semaine de Mon Planning) signalé illisible — distinct du bandeau d'onglets déjà traité ici.


## 28/06 (suite 2) — Passe de contraste et tailles responsives

Suite aux remarques d'Olivier (texte trop petit/fade, surtout sur ordinateur et tablette), passage en tailles **responsives** (CSS `clamp()`) plutôt qu'en pixels fixes pour les éléments de navigation des calendriers : compact sur mobile, nettement plus grand sur tablette/ordinateur, sans média-query.

- Cellules du calendrier Mon Planning (vues Mois et Semaine) : numéro/nom du jour agrandis, gris clair remplacé par des couleurs à fort contraste.
- Toggle Mois/Semaine/Planning et les 3 boutons "Aujourd'hui" (Mon Planning + CPS Officiel/Prévisionnel) : agrandis et **harmonisés** (taille strictement identique partout, ne change plus en changeant d'onglet).
- Bandeau des 3 onglets du haut : texte responsive, poids de police uniforme entre onglet actif/inactif (la sélection ne se voit plus que par la couleur et le soulignement).
- Bloc "Postes habilités" (profil réserviste) : libellé et badges plus contrastés.


## 28/06 (suite 3) — Sélecteur de profil corrigé + admin en lecture seule

**Bug corrigé** : les agents chargés depuis l'API n'avaient que le champ `fam`, pas `famille` — le sélecteur de profil (avatar + prénom en haut à droite) regroupait par `famille`, donc la liste PRCI/PAR restait toujours vide, même en tapant un nom de recherche.

**Comportements clarifiés**
- Le sélecteur de profil est désormais **réservé aux admins** (non-admins ne peuvent plus l'ouvrir) — cohérent avec le principe "chacun gère son propre planning".
- Quand un admin visualise un autre agent, son planning est maintenant **rechargé automatiquement** (et actualisé toutes les 45s) — avant, seul l'agent réellement connecté avait son planning en mémoire, donc l'admin voyait un calendrier vide pour les autres agents.
- **Admin = lecture seule** sur le planning des autres agents : cliquer sur un jour (vues Mois/Semaine/Planning) n'ouvre plus la popup d'édition tant que ce n'est pas son propre profil. Pour modifier quoi que ce soit, l'admin doit revenir sur son propre profil via le sélecteur. Objectif : éviter toute modification involontaire du planning d'un agent par un admin.


## 01/07/2026 — Import Bulletin de Commande / Roulement

**Nouvelle fonctionnalité** : import d'un bulletin de commande SNCF (PDF ou photo) directement dans Mon Planning.

- Extraction texte PDF native via `pdfjs-dist` (zéro coût, fiable) + fallback OCR.space pour photos/scans.
- Parsing robuste face aux défauts réels d'extraction : découpage par date (pas par nom de jour, souvent corrompu), fenêtre de recherche du code par proximité, détection du code Pauseur via son sous-code, horaires par tri chronologique des heures trouvées.
- Règle de priorité chronologique par date d'édition du bulletin : un import plus récent écrase, un plus ancien est ignoré silencieusement.
- Libellé court du poste (CCL, AC LNE...) affiché dans les 3 vues du calendrier (Mois, Semaine, Planning) pour toute saisie, manuelle ou importée.
- Testé sur 2 vrais bulletins SNCF (Dupuy PRCI + Pastant PAR) : 37/38 et 32/33 jours détectés (jours manquants = dates réellement illisibles dans les documents sources).
- Accès : titulaire uniquement (cohérent avec la règle admin = lecture seule).
- DB : `planning_jour.source` ENUM étendu + colonne `source_edition_date DATETIME` ajoutée.## [03/07/2026] Panneau Admin + Partage Prévisionnel

### Fix : Réinitialisation PIN admin
- Ajout de `agents.resetPin` dans `client.js` (appelait une fonction inexistante)
- Ajout de la fonction `resetPin` dans `profilController.js` (bcrypt + invalidation sessions)
- Ajout de la route `PUT /profil/:cp/pin` dans `profil.js`
- Le bouton 🔑 PIN du panneau admin est désormais pleinement fonctionnel

### Panneau Admin - vue responsive
- Remplacement du tableau par des cartes empilées (grille `auto-fill minmax 340px`)
- Mobile portrait : 1 colonne pleine largeur, plus de débordement
- Textes plus grands, meilleur contraste, badges colorés (CP, famille, PIN)
- Correction du `maxWidth:900` qui causait le débordement sur téléphone

### Fix : Partage Prévisionnel
- `getAllPublic` dans `client.js` : ajout du fallback `|| p1.code_poste` sur `jsCode`
- `convertirCodePosteVersJsCode` ne convertissait pas les codes complets (ex: "PICCL-")
- Les journées M/AM/N/J importées via bulletin ou saisie manuelle sont maintenant visibles dans le Planning Prévisionnel partagé

---

