# F2P.PMP — Contexte projet

Application de gestion de planning pour ~75 agents SNCF (PRCI/PAR). Propriétaire : Olivier Beffaral (P03, CP 6810186B), seul développeur, non-développeur de formation — dirige toutes les décisions produit, Claude est le partenaire technique d'implémentation.

## Stack & structure

- **Frontend** : React 18 + Vite, un seul gros fichier `src/App.jsx` (monolithique, volontairement — sauf `AdminPanel.jsx`, `DayEditPopup.jsx`, `AgentHeader.jsx`, `DemandeCongesView.jsx` qui sont séparés), déployé sur **Vercel**
- **Backend** : Node.js/Express dans `api/api/`, contrôleurs dans `api/api/src/controllers/`, déployé sur **Railway**
- **DB** : MariaDB sur Railway. Hôte : `trolley.proxy.rlwy.net:47472` (proxy externe) ou `mysql.railway.internal` (depuis la console Railway). User `root`, db `railway`. **Le mot de passe change régulièrement (rotation de sécurité) — toujours redemander à Olivier plutôt que d'utiliser un ancien mot de passe noté quelque part.** Ne jamais committer de mot de passe en clair dans le repo.
- **Local** : projet à `C:\Users\olive\Desktop\f2p-pmp`, backend dans `api\api`, Windows/CMD.

## Conventions de travail établies

- **Fins de ligne mixtes** : le fichier `App.jsx` et plusieurs autres contiennent un mélange de CRLF et LF selon les zones — toujours vérifier en lisant le fichier en binaire avant toute édition automatisée, ne jamais supposer un seul type de fin de ligne uniforme.
- **Nouvelles tables MariaDB** : toujours `COLLATE utf8mb4_unicode_ci`. Les tables avec FK vers `agent.cp` utilisent `ON UPDATE CASCADE ON DELETE CASCADE`.
- **Séquence de déploiement** : `npm run build` → vérifier que le hash du bundle a changé → `vercel --prod` (obligatoire, un simple build ne déploie pas) → `git add -A` → `git commit` → `git push`. Railway redéploie automatiquement le backend au push.
- **Redémarrage backend** : après modification d'un contrôleur, fermer complètement le terminal `node server.js` (pas juste Ctrl+C — un ancien process peut rester actif sur le port 3001 et servir l'ancien code) puis relancer depuis `api\api`.
- **Variables d'environnement** : `ENCRYPTION_KEY`, `JWT_SECRET`, `DB_PASSWORD` doivent être synchronisées entre `.env` local ET les variables Railway (service backend) après toute rotation — leur absence sur Railway ne fait PAS planter le serveur au démarrage mais casse silencieusement le chiffrement/l'auth en production.
- **Avant de dire "c'est fait"** : toujours vérifier par une recherche dans le fichier réel (grep/findstr) qu'un remplacement de fichier a vraiment pris, plutôt que de se fier à un message de confirmation — un vrai bug de ce soir (06/07) venait d'un fichier jamais réellement remplacé malgré plusieurs confirmations.
- **Cache navigateur** : `localStorage` clé `f2ppmp_schedule` ne se vide JAMAIS automatiquement et peut faire croire à un bug alors que c'est juste une vieille copie locale — toujours vider ce cache (ou tester en navigation privée) avant de chercher un bug d'affichage.
- **Documentation** : fichiers `FEATURES.md`, `NOTICE_ANNUAIRE.md` à la racine. Objectif à terme : une notice complète du projet, section par section, à rédiger quand le projet sera plus avancé — noter le fonctionnement détaillé (règles métier, permissions, cas limites) de chaque module au fur et à mesure.

## Modules existants (aperçu)

- **Mon Planning** (perso) : vues Mois/Semaine/Planning-liste, saisie manuelle + import bulletin de commande (PDF/photo) + import déroulé prévisionnel, note perso privée par jour, code RPP (variante de repos), compteurs (Congés/Travail/RP/RU...).
- **CPS Officiel** : planning partagé en lecture pour tous, alimenté par import PDF/photo (OCR via `ocr.space`), table `planning_cps`.
  - **Qui peut importer** : n'importe quel agent connecté, pas de restriction admin (choix assumé le 09/07 — avant ça, l'import était réservé aux admins côté backend alors que le bouton était déjà visible pour tous côté frontend, ce qui provoquait des 403 silencieusement avalés).
  - **Flux d'import** : sélection fichier → extraction OCR → écran de confirmation (récap nb agents/date/écarts) → validation explicite → sauvegarde backend → mise à jour locale seulement si la sauvegarde a réussi (plus de faux succès en cas d'échec réseau/serveur).
  - **Propagation** : `cpsSchedule` est rafraîchi toutes les 45s sur tous les appareils connectés (avant le 09/07, chargé une seule fois à la connexion — un agent déjà connecté ne voyait jamais les imports faits ailleurs sans se reconnecter).
  - **Historique & annulation** : chaque import crée un lot (`cps_import_batch` + `cps_import_detail`, snapshot avant/après par ligne). Panneau "🕓 Historique" dans l'onglet CPS Officiel, purge automatique au-delà de 90 jours (faite à chaque import, pas de tâche planifiée). Bouton "↩️ Annuler" disponible uniquement sur le tout dernier lot non déjà annulé (restaure l'état précédent ligne par ligne, ou supprime la ligne si elle n'existait pas avant).
- **Planning Prévisionnel** : import PDF "déroulé prévisionnel", extraction imparfaite connue (~257/365 jours corrects sur le seul cas testé), amélioration en attente (besoin de plusieurs autres roulements d'agents différents avant de retenter).
- **Échanges** : demandes d'échange de poste entre agents, poste/horaires auto-capturés, aucune modification auto de planning (juste un tableau d'annonces avec intérêts).
- **Fêtes légales** : suivi de prise en compte des fêtes, règles GRH00143, report N-1, bouton reset.
- **Annuaire** : Agents (auto-gérés) / UO (postes fixes ou liés à CPS Officiel en lecture seule, titulaire dynamique selon l'heure) / Accès rapide. Notice complète : `NOTICE_ANNUAIRE.md`.
- **Pause Figée** : suivi des pauses figées (1h30 de TC par jour), FIA (mois de prise en compte), reconstruit sur un vrai backend le 06/07 après un bug de fond (voir historique).
- **Demande de congés** : génère un PDF officiel SNCF rempli (formulaire GA_demande_autorisation_absence.pdf) via `pdf-lib` côté navigateur, + message email copiable. Suivi des demandes (tableau, statuts) pas encore construit.
- **Admin** : gestion des agents, promotion/retrait admin (effectif immédiatement depuis le 09/07, voir résolus ci-dessous), édition téléphone/email d'un agent.
- **Habilitations** : postes habilités par agent, alimente la liste de postes proposés en saisie de journée (DayEditPopup) via une table de correspondance de codes (`CODE_VERS_HAB`).

## Bugs actifs / chantiers en attente (au 10/07/2026 soir)

1. **Compteurs** : une case combinant plusieurs contenus (ex: repos + nuit) ne compte pas la journée de travail. Règle à appliquer : toujours compter TOUS les éléments comptabilisables d'une case, pas seulement le premier. Vérifier aussi le compteur repos, et que `notePerso` n'interfère jamais avec le comptage.
2. **CPS/Annuaire titulaire dynamique** : fonctionnalité posée mais jamais testée en conditions réelles (CPS Officiel était vide au moment du test) — à revalider maintenant qu'une feuille CPS récente existe.
3. **Congés — réorganisation UI** (à discuter avant d'implémenter) : rendre plus visible que le message email est copiable avant de générer le PDF.
4. **iPhone — impossible d'effacer une sélection** (menus déroulants / dates) une fois choisie. Vérifié sur Pause Figée, à vérifier aussi sur Fêtes légales. Prévoir un bouton "Effacer" explicite plutôt que de compter sur le comportement natif du navigateur.
5. **Fêtes légales — paiement anticipé** : permettre à un agent de demander le paiement d'une fête avant que la règle automatique ne se déclenche (état "paiement demandé" + mois visé, validation manuelle ensuite).
6. **Clavier PIN qui saute** sur mobile à l'écran de connexion — reprendre l'approche déjà utilisée (et qui fonctionne bien) pour le changement de PIN dans les paramètres.
7. **Suivi des demandes de congés** (nouveau chantier, pas commencé) : tableau sous le générateur PDF, statuts "Accordé le/Refusé le", séparation par année.
8. **Nettoyage** : fonctions mortes `BarreSaisie`/`BarreSaisieReserviste` dans `App.jsx` (jamais appelées) à retirer. Statut "réserviste" (`profile.isReserve`) existe côté données et influence le calcul des fêtes du dimanche, mais aucun bouton UI n'existe pour le voir/changer — fonctionnalité à moitié construite, inoffensive telle quelle. **Nouveau (09/07)** : le composant `CpsView` dans `App.jsx` (utilise `/api/claude` + Claude API pour l'OCR, jamais persisté en base) est mort — `view` ne prend jamais la valeur `"cps"` dans `VIEWS`, seul `GlobalView` (`view==="global"`) est réellement utilisé pour l'onglet "CPS Officiel". À supprimer avec le badge de notifications associé (`k==="cps"` ligne ~8139).

## Ce qui a été résolu récemment (pour référence, pas pour ré-ouvrir)

- **09-10/07 — CPS Officiel, import qui ne se propageait pas** : cause réelle = pas de logique de blocage réseau/appareil comme suspecté, mais (a) `getSchedule` (chargement du planning perso, distinct de `getAllPublic`) ne traduisait jamais le code court local (ex: `ASMP`) vers le jsCode canonique, et (b) l'import était réservé aux admins côté backend alors que le bouton était visible pour tous côté frontend — tout échec (403, réseau) était avalé silencieusement (`catch` qui ne faisait que `console.error`), donnant un faux "✅ succès" à l'utilisateur sans rien sauvegarder. Corrigé : import ouvert à tout agent connecté, erreurs remontées explicitement, `cpsSchedule` re-synchronisé toutes les 45s sur tous les appareils, écran de confirmation avant écrasement, historique 90 jours + annulation du dernier import (tables `cps_import_batch`/`cps_import_detail`).
- **09/07 — "ASMTE PAR" affiché tronqué ("ASMP")** : même cause racine que le point CPS ci-dessus — `getSchedule` ne traduisait pas le code court vers le jsCode canonique avant affichage. Corrigé en même temps (`convertirCodePosteVersJsCode` maintenant appelé aussi côté lecture du planning perso, pas seulement côté planning public).
- **09/07 — Promotion admin cassée** : `is_admin` était figé dans le JWT au moment de la connexion (`authController.login`) et jamais réévalué — une promotion en base ne changeait rien tant que l'agent promu ne se déconnectait/reconnectait pas (et jusque-là, ses actions admin étaient silencieusement refusées en 403). Corrigé : le middleware `authMiddleware` relit `is_admin` en base à chaque requête (jointure avec `auth`), plus jamais depuis le JWT. Le frontend synchronise aussi `currentUser.isAdmin` à chaque rechargement périodique de la liste des agents (45s).
- Module Annuaire complet (Agents/UO/Accès rapide) + import vCard.
- Pause Figée entièrement reconstruite sur un vrai backend (elle utilisait auparavant un stockage local jamais synchronisé — cause de disparition de données).
- Note perso + code RPP dans le planning perso (plusieurs bugs de fond corrigés : confidentialité, race condition de sauvegarde, marqueurs de nuit).
- Import bulletin de commande (PDF/photo) et RPP dans cet import.
- Générateur de demande de congés PDF.
- Bug habilitations (codes de correspondance incohérents entre fichiers) — corrigé.
