## 03/07/2026 — Amélioration lisibilité du panneau "Suivi des fêtes légales"

**Contexte** : panneau situé sous l'agenda perso (Mon Planning), jugé illisible sur ordinateur (textes/légendes trop petits, couleurs fade, boutons minuscules) et perfectible sur mobile.

**Périmètre** : uniquement les styles inline de la fonction `FetesSection` dans `src/App.jsx` (lignes ~2900-3163). Aucune logique métier modifiée (règles GRH00143, calcul des statuts, détection de prise, etc. intactes).

**Changements** :
- Header du panneau : titre 13→17px, icône 15→20px, gradient assombri pour meilleur contraste, pastilles de compteurs (prises/payées/rappels) agrandies et opacité augmentée (moins "délavées")
- Cartes par fête : badge code, libellé, dates passés de 9-11px à 11-14px ; badge de statut 9→12px
- Boutons d'action (📅 date, 💶 payé, 📋 motif, ✓/✕ édition, "Pris"/"+10j") : zones cliquables portées à ~38×38px minimum (contre ~20px avant), bordures plus nettes
- Légende du bas : pastilles 7→10px, texte 9→11px, contraste renforcé
- Bloc "motif réglementaire" déroulant : texte 9→12-13px

**Déploiement** : commit `4fd64dc`, patch appliqué via `patch_fetes_lisibilite.js` (43 remplacements `mustReplaceOnce`, testés bit-à-bit avant livraison). Validé visuellement par Olivier en prod.

**Méthode de patch** : script généré automatiquement à partir d'un diff exact entre la version originale et la version modifiée (garantit un remplacement caractère-pour-caractère fidèle, y compris fins de ligne CRLF).
