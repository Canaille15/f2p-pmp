# Notice — Module Annuaire F2P.PMP

Cette notice explique le fonctionnement complet de l'Annuaire : ses trois
sections, comment créer et modifier une fiche, et comment fonctionne le lien
avec CPS Officiel pour les postes en tourniquet.

---

## 1. Vue d'ensemble

L'Annuaire (📞 dans le menu latéral) comporte trois zones distinctes :

1. **Accès rapide** — bandeau fixe en haut, quelques numéros directs (ex:
   astreinte)
2. **Agents** — l'annuaire des collègues, auto-géré par chacun
3. **UO** (Unités Opérationnelles) — les postes de l'organisation (fixes ou
   tournants), gérés collectivement

Ces trois zones sont indépendantes : ce qui se passe dans l'une ne modifie
jamais les deux autres.

---

## 2. Accès rapide

**À quoi ça sert** : les numéros qu'on doit pouvoir composer en un clic,
sans chercher (astreinte, poste de commandement...).

**Qui peut modifier** : n'importe quel agent connecté — pas de restriction
admin. C'est un choix assumé : ces numéros sont d'utilité collective
immédiate, mieux vaut que tout le monde puisse les tenir à jour.

**Comment faire** :
- Les numéros existants s'affichent en tuiles rondes rouges — un tap compose
  directement le numéro
- Le lien texte **"Gérer les numéros d'accès rapide"** sous les tuiles ouvre
  le panneau d'édition
- Dans ce panneau : **"+ Ajouter un numéro"** pour créer une fiche
  (Libellé + Numéro), crayon ✎ pour éditer une fiche existante, bouton
  "Suppr." pour la retirer

Ces numéros sont indépendants de tout compte agent — pas de titulaire, pas de
lien avec CPS.

---

## 3. Agents

**À quoi ça sert** : retrouver et contacter un collègue.

**D'où viennent les données** : chaque agent peut renseigner, depuis
**"Mon profil"** :
- Son **téléphone**
- Son **email**
- Sa **fonction** (texte libre, ex: "Agent circulation") — distincte du
  grade administratif
- Sa **visibilité dans l'annuaire** (toggle "Visible dans l'Annuaire",
  **activé par défaut**) — un agent peut choisir de ne pas apparaître

**Qui peut modifier les coordonnées d'un agent** :
- **L'agent lui-même**, depuis "Mon profil", à tout moment
- **Un admin**, depuis le panneau Admin → "Modifier" sur une fiche agent →
  champs Téléphone/Email ajoutés. C'est la **même donnée** des deux côtés :
  peu importe qui modifie en dernier, c'est cette valeur qui s'affiche.
  L'admin ne peut pas forcer la visibilité dans l'annuaire — ça reste le
  choix exclusif de l'agent.

**Affichage** : trié alphabétiquement par nom (NOM en majuscules, Prénom en
plus petit), avec la fonction en dessous. Bouton d'appel (icône rouge),
SMS (💬) et email (✉️) si renseignés. "Non communiqué" si rien n'est
renseigné.

---

## 4. UO (Unités Opérationnelles)

**À quoi ça sert** : les postes de l'organisation — qu'ils soient fixes
(Assistant RH, RDUO...) ou tournants (CCL, DPX PRCI, Adj CCL...).

**Qui peut créer/modifier une fiche UO** : n'importe quel agent connecté —
même logique que l'Accès rapide.

### 4.1 — Créer une fiche

Dans l'onglet UO, cliquer **"+ Ajouter un poste"**. Le formulaire comporte :

| Champ | Description |
|---|---|
| **Poste / fonction** | Obligatoire. Le nom affiché en gras sur la fiche (ex: "CCL", "Assistant RH") |
| **Lier à un poste CPS** | Optionnel — voir section 5 ci-dessous |
| **Prénom / Nom titulaire** | Qui occupe le poste *actuellement*, saisi à la main. **Ignoré pour l'affichage si le poste est lié à CPS** (voir section 5) |
| **Mobile pro / Mobile perso / Fixe** | Jusqu'à 3 numéros différents |
| **Email** | Un email |
| **Note libre** | Texte libre optionnel (consignes, précisions...), affiché en encadré jaune uniquement s'il est rempli |

### 4.2 — Modifier / supprimer une fiche

Crayon ✎ sur la fiche → même formulaire, pré-rempli. Bouton "Suppr." dans le
formulaire pour supprimer la fiche.

### 4.3 — Affichage (accordéon)

Par défaut, une fiche UO n'affiche que la **fonction** et le **titulaire**
(nom en clair, ou le titulaire en direct si liée à CPS — voir section 5).
Un bouton **"Voir les contacts ▾"** déplie la fiche pour révéler les numéros
et l'email, sous forme de gros boutons colorés (rouge = téléphone, bleu =
email) — pensé pour rester lisible même sur un écran d'ordinateur avec peu
de recul.

---

## 5. Le lien avec CPS Officiel (titulaire dynamique)

**Le problème que ça résout** : pour un poste fixe (Assistant RH), le
titulaire ne change jamais — une saisie manuelle suffit. Mais pour un poste
en 3×8 (CCL, Adj CCL, DPX PRCI...), la personne change à chaque tour de
service : agent du matin, de l'après-midi, de nuit, ou de journée. Une
saisie manuelle serait fausse en permanence.

**La solution** : lier la fiche UO à un vrai poste CPS. À partir de là,
l'Annuaire va chercher **en temps réel**, à chaque fois que quelqu'un
consulte la fiche, qui occupe ce poste *maintenant*, en se basant sur
l'heure du moment.

### 5.1 — Comment lier une fiche

Dans le formulaire (création ou modification), le menu déroulant
**"Lier à un poste CPS"** propose deux types de postes :

- **Postes "3×8" (tournent M/AM/N)** : CCL, Adj CCL, AC LNE, AC LNO, AC VGD,
  AC LC (famille PRCI) ; AC PAR, Aide AC PAR, CT AC Travaux (famille PAR)
- **Postes "journée" (un seul créneau J)** : Pauseur CCL, Pauseur Adjoint,
  Pauseur VGD, DPX PRCI, Adj DPX PRCI, K-PRCI, AFO PRCI, CAF, PPRCI, VM,
  Pauseur PAR, DPX PAR, ASMTE PAR, AFO PAR...

Une fois une fiche liée, **les champs Prénom/Nom titulaire ne servent plus à
l'affichage** (ils restent en base au cas où le lien serait retiré plus
tard, mais l'écran montre toujours la version CPS en direct).

### 5.2 — Comment le titulaire est calculé

À chaque affichage de la fiche :

1. **Poste "journée"** → on regarde directement qui est sur ce poste
   aujourd'hui (peu importe l'heure, puisque c'est un poste à un seul
   créneau sur la journée)
2. **Poste "3×8"** → on regarde l'heure actuelle pour savoir si on est en
   *Matinée* (06h10–14h04), *Soirée* (14h05–22h14) ou *Nuit*
   (22h15–06h09), puis on cherche le bon code correspondant à ce poste et
   ce créneau

Ensuite, l'ordre de priorité pour trouver le nom est **toujours** :

1. **Correction manuelle** (🔄 dans CPS Officiel — échange de poste, erreur
   signalée) si elle existe pour ce poste et cette date → **priorité
   absolue**, c'est la vérité terrain la plus fiable
2. Sinon, **détection automatique** du PDF importé dans CPS Officiel
3. Sinon, **"Titulaire non communiqué"**

Quand un nom s'affiche via ce mécanisme, un petit badge vert
**"● En direct CPS"** apparaît à côté, pour bien distinguer une donnée
calculée en temps réel d'une saisie manuelle classique.

### 5.3 — Ce que ça NE fait PAS (garantie importante)

**L'Annuaire ne modifie jamais CPS Officiel.** C'est une simple lecture,
à chaque affichage, sans aucune écriture. On ne risque donc à aucun moment
de casser ou fausser CPS Officiel, qui reste le document de référence
intouchable.

### 5.4 — Limites à connaître

- Si CPS Officiel n'a pas encore été importé pour aujourd'hui, ou si le
  poste n'y figure pas, l'Annuaire affichera "Titulaire non communiqué" —
  c'est normal, il n'invente jamais un nom.
- Le calcul du créneau horaire (matin/soir/nuit) est basé sur des plages
  fixes qui collent aux horaires réels des équipes, mais un très léger
  décalage est possible au moment exact de la relève entre deux services.
- Une fiche UO ne peut être liée qu'à **un seul** poste CPS. Pour suivre
  plusieurs postes séparément (CCL, Adj CCL...), il faut une fiche par
  poste.

---

## 6. Résumé des permissions

| Action | Agent (self) | Tout agent connecté | Admin |
|---|---|---|---|
| Voir l'Annuaire (3 sections) | ✅ | ✅ | ✅ |
| Modifier son propre tél/email/fonction | ✅ | — | ✅ (sur n'importe quel agent) |
| Choisir sa visibilité dans l'Annuaire | ✅ | — | ❌ (jamais forcé par l'admin) |
| Créer/modifier/supprimer un numéro Accès rapide | — | ✅ | ✅ |
| Créer/modifier/supprimer une fiche UO | — | ✅ | ✅ |
| Lier une fiche UO à un poste CPS | — | ✅ | ✅ |
