# F2P.PMP — Suivi des fonctionnalités

> Document vivant, mis à jour à la fin de chaque session de développement.
> Servira de base à la documentation PDF imprimable (à venir).

**Dernière mise à jour** : 27/06/2026 — commit `f9d986c`

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

- Proposition d'échange de service entre agents habilités sur le même poste
- Réponses : Accepté / Refusé / Occasionnel
- Option "Pas d'échange" désactivable par agent

---

## 8. Congés et absences

- Formulaire de demande d'absence (génération PDF au format SNCF + envoi par mail)
- Suivi des accords/refus
- Notifications de reliquats de congés annuels (28 jours/an)

---

## 9. Notifications

- Rappels automatiques liés aux fêtes SNCF (échéances de péremption)
- Alertes de reliquats de congés
- Écarts détectés entre CPS et planning personnel

---

## ⚠️ Points de vigilance connus (dette technique)

1. **Ré-import CPS et régression OCR** : si l'OCR lit mal une ligne lors d'un second import, la donnée correcte précédente peut être écrasée par une donnée incomplète (`jsCode: null`). Pas de protection actuelle — solution de contournement : réimporter à nouveau.
2. **`AddAgentModal`** (composant dans `App.jsx`, avec import IA photo/PDF) semble redondant avec le vrai formulaire de création utilisé dans le panneau Admin. À clarifier : doit-il être supprimé, ou rebranché quelque part ?
3. **Nettoyage du dépôt** : résidus de terminal accidentellement commités/non gérés (`cd`, `node`, `powershell`, `vite`, fichiers mal nommés) — nettoyage prévu mais non fait.
4. **Gestion des noms identiques** (ex: deux agents prénommés Yvon) : sujet identifié, pas encore traité en profondeur.

✅ **Résolu cette session** : bug de décalage de date (`TODAY` calculé en UTC au lieu de l'heure locale, pouvait afficher le mauvais jour) — corrigé. Ancien panneau "Gestion des comptes" (`AdminAuthPanel`, code mort lié à l'authentification locale d'avant la migration backend) supprimé, remplacé par un vrai toggle admin connecté au serveur dans le panneau Admin.

---

## 📌 Chantiers en attente (non commencés)

- **Vue "Comparaison"** CPS Officiel vs Prévisionnel : détection automatique des écarts (actuellement détectés manuellement)
- **Module Formation** dédié (au-delà du simple badge actuel)
- **Annuaire** des agents
- **Import planning PDF général** (pour le planning personnel, hors CPS)
- **Calendrier cliquable** multi-mois (navigation rapide)
- **Documentation PDF complète**, avec liens cliquables, à garder dans l'application et imprimable — *ce document (FEATURES.md) en est la base*
- **Bug clavier PIN mobile** (signalé anciennement, statut à vérifier)

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
