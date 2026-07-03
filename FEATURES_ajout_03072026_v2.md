## 03/07/2026 (suite) — Suivi manuel amélioré + report N-1 + nettoyage code

**Contexte** : suite de la session lisibilité du panneau "Suivi des fêtes légales". Trois volets distincts.

### 1. Bouton de réinitialisation des corrections manuelles
Ajout d'un bouton **↺** dans chaque carte de fête, visible uniquement si une correction manuelle a été posée (date forcée via 📅 ou paiement forcé via 💶). Permet d'annuler cette correction en un clic pour revenir au calcul 100% automatique basé sur le planning perso (PDF ou saisie manuelle), sans avoir à rouvrir l'édition de date pour la vider à la main.

Règles GRH00143 inchangées (délais, trimestre suivant, mise en paiement auto). Le panneau reste un suivi administratif séparé : aucune écriture vers le planning perso, dans un sens comme dans l'autre — seule la lecture du planning alimente le panneau automatiquement.

### 2. Section repliable "Report N-1"
Nouveau bandeau **"📋 Report {année-1} (n)"** sous la liste principale, fermé par défaut. Affiche le détail complet des fêtes de fin d'année précédente (Toussaint, 11 novembre, Noël, VN éventuel) encore en délai jusqu'au 31 mars de l'année en cours — avec les mêmes cartes, mêmes actions (📅/💶/↺) et mêmes règles que la liste de l'année en cours. Auparavant, seuls des compteurs agrégés (pastilles du header) existaient, sans détail consultable ni modifiable.

**Refactoring associé** : extraction d'une fonction partagée `renderFeteCard(l, targetYear)` dans `FetesSection`, réutilisée pour l'année en cours et le report N-1 (au lieu de dupliquer le JSX). Les fonctions `setManualDate`, `setManualPayee`, `resetManuel`, `prendreEnCompte`, `snooze10j` acceptent désormais un `targetYear` optionnel (année en cours par défaut) pour écrire dans la bonne case de `fetesTracking`.

### 3. Nettoyage de 3 bugs de code préexistants (repérés via warnings esbuild au build)
- Popup saisie code PIN : accolade `}` orpheline en trop (reliquat d'une ancienne condition supprimée) — provoquait un warning JSX bloquant potentiellement des outils de build plus stricts.
- Vue Planning (liste) : clé `showData` dupliquée dans un objet retourné — sans impact (même valeur), nettoyée.
- Vue Semaine : clé `fontWeight` dupliquée (600 puis 700) — la valeur 700 était déjà la seule appliquée en pratique, suppression du doublon sans changement visuel.

Aucun changement fonctionnel sur ces 3 points, uniquement de la propreté de code.

**Déploiement** : commits `8c792a8` (fonctionnalités + nettoyage) puis `c80ee7f` (suppression d'un fichier parasite `npm` créé par erreur lors d'un copier-coller). Patches appliqués dans l'ordre : `patch_fetes_bouton_reset.js` → `patch_fetes_report_n1.js` → `patch_3bugs_nettoyage.js`. Build final sans aucun warning esbuild. Validé par Olivier en local puis en prod.
