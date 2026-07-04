# Ajout FEATURES.md — Session 04/07/2026 (soir) — Déroulé Prévisionnel / Roulement annuel

## Nouvel état de référence : 335/365 jours (au lieu de 257/365)

**Aucun changement de code effectué cette session** — le nouveau chiffre vient uniquement
d'une correction de méthode de test, pas d'un patch sur `parseDeroulePrevisionnel`.

### Ce qui a changé dans la méthode de test
Le test précédent (257/365) avait été fait sur un texte issu du **fallback OCR** (image),
plus dégradé que nécessaire. Ce PDF déroulé a en réalité une **couche texte native**
exploitable directement — pas besoin d'OCR. En rejouant `parseDeroulePrevisionnel` sur le
texte natif réel du PDF (674903 PRCI, édition 22/09/2025, extrait via `pdftotext -layout`,
une bonne approximation de ce que fait `extraireTextePdfNatif` dans l'app avec les
coordonnées x/y), le score réel est **335/365 (~92%)**, sans aucune modification de code.

### Diagnostic des 30 jours encore manquants — deux causes distinctes, non patchables à l'aveugle

**Catégorie A (majorité) — positionnement x ambigu dans le PDF source lui-même**
Les codes courts (RP, RU, HP, RQ — 2-3 caractères) sont positionnés par le générateur SNCF
d'une manière qui les fait parfois tomber, en coordonnée x, plus près de la colonne du mois
voisin que de leur propre colonne. Vérifié précisément caractère par caractère sur le cas du
1er janvier : le "RP" qui appartient à Janvier est physiquement plus proche de la colonne
Février dans le PDF. **Ce n'est pas un bug d'extraction, c'est la mise en page réelle du
document source.**

**Catégorie B (minoritaire) — trou pur à l'extraction**
Rien n'est récupérable à cet endroit précis, aucun texte n'est présent dans le flux extrait
pour cette cellule.

### Décision : ne pas patcher la catégorie A pour l'instant
Un patch heuristique ("code court orphelin → attribuer au jour vide le plus proche") a été
envisagé puis écarté : le risque est d'transformer un jour **manquant** (visible, l'agent
sait qu'il doit vérifier) en jour **présent avec un mauvais code** (invisible, silencieusement
faux) — ce qui dégraderait la fiabilité perçue au lieu de l'améliorer.

**Prochaine étape actée avec Olivier** : attendre 2-3 autres déroulés prévisionnels
(idéalement d'agents différents) pour vérifier si le décalage de la catégorie A est
systématique et dans le même sens d'un document à l'autre. Si oui → devient un motif
calibrable exploitable. Si aléatoire selon les documents → non patchable proprement,
à assumer dans la notice utilisateur telle quelle.

### Fichiers de travail de cette session (scripts de simulation, non livrés en patch)
Harnais de test Node.js construit pour extraire `parseDeroulePrevisionnel`,
`deriveCodeEquipeBulletin`, `EQ`/`EQUIPES`, `CODES_FETES` directement depuis `src/App.jsx`
et les rejouer isolément sur le texte réel extrait du PDF (`pdftotext -layout` et sans
layout, comparés). Réutilisable tel quel pour tester les prochains déroulés dès qu'Olivier
les fournira — permet de mesurer un score exact (jours parsés / 365) et de lister
précisément les dates manquantes, sans avoir besoin de repasser par le navigateur.

---

## Backlog mis à jour
- ~~Déroulé prévisionnel — ~108 jours manquants~~ → reformulé : **335/365 jours OK avec le
  code actuel inchangé**, 30 restants documentés (catégories A et B ci-dessus),
  patch de la catégorie A **en attente** de données de test supplémentaires (autres roulements).
- Vérifier si le bug n°10 découvert le 04/07 nuit (`note` forcée à `NULL` en dur dans
  `bulletinImportController.js`) affecte historiquement les nuits importées via ce même
  parseur — toujours à ré-auditer, non fait cette session (pas nécessaire : le score de
  335/365 mesuré ici porte sur les jours reconnus au global, la nuit sur ce document
  n'a pas montré de symptôme distinct de ce bug précis, mais ça reste à vérifier sur un
  cas avec prise de nuit explicite).
