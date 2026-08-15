import { useState, useRef, useEffect } from "react";
import { PDFDocument, PDFName, StandardFonts } from "pdf-lib";

// ─── CET Phase 5 (07/08) : génération des PDF officiels CET ───────────────
// Contrairement à "Demande de congés" (GA_demande_autorisation_absence.pdf,
// un scan sans champs — DemandeCongesView.jsx dessine le texte à des
// coordonnées fixes), les imprimés CET fournis par Olivier sont de vrais
// formulaires PDF avec des champs remplissables (AcroForm) — on les remplit
// donc directement par nom de champ (pdf-lib form.getTextField/getRadioGroup),
// puis on aplatit (form.flatten()) pour livrer un PDF final non modifiable,
// comme un vrai document généré. Vue isolée, indépendante du ledger CET
// (CetView.jsx) — un pur générateur de document, même principe que
// DemandeCongesView.jsx n'écrit jamais dans congesDemandes.
//
// 5e et 6e imprimés ajoutés le 07/08 (utilisation compte courant + transfert
// de jours courant→fin d'activité) — Olivier les avait oubliés lors de l'envoi
// initial du 06/08 ; les 4 premiers imprimés déjà livrés ont été reconfirmés
// identiques (checksum) aux versions renvoyées, aucun changement nécessaire.
//
// Retours du 07/08 (2e passe) : le formulaire épargne hors congés permet de
// cocher PLUSIEURS types de jours à la fois (RQ+RN+TC+TY+RCF+médaille),
// chacun dispatché indépendamment entre compte courant et fin d'activité sur
// le MÊME document — reproduit ici via une grille par source (2 champs
// jours par ligne) plutôt qu'un simple source+sous-compte+jours. Le champ
// PDF "types de jours" est un vrai groupe radio (un seul sélectionné à la
// fois côté format officiel) : impossible de cocher plusieurs cases via
// l'API RadioGroup.select() sans écraser les précédentes. Contournement :
// manipulation directe des widgets (voir cocherPlusieursTypes) — sans danger
// car le formulaire est aplati (form.flatten()) juste après, donc l'état
// "un seul sélectionné" du champ interactif n'a plus d'importance, seul le
// rendu visuel de chaque case cochée est conservé.

const TYPES = [
  { k: "intention", label: "Intention d'épargne de congés annuels" },
  { k: "epargne", label: "Demande d'épargne sur le CET (hors congés annuels)" },
  { k: "utilisationCourant", label: "Demande d'utilisation en temps — sous-compte courant" },
  { k: "utilisation", label: "Demande d'utilisation en temps — sous-compte fin d'activité" },
  { k: "monetisation", label: "Demande de monétisation — sous-compte fin d'activité" },
  { k: "transfert", label: "Demande de transfert de jours (courant → fin d'activité)" },
];

// Sous-compte courant : le nombre de jours doit être compris entre 5 et 20
// (règle du formulaire officiel), réparti en 3 paliers avec des délais de
// prévenance différents — chaque palier a sa propre paire de champs sur le
// PDF (nombre de jours + date de la demande), un seul palier est rempli par
// génération (celui qui correspond au nombre de jours saisi par l'agent).
const PALIERS_UTIL_COURANT = [
  { min: 5, max: 9, radio: "de 5 à 9", suffixJours: "de 5 à 9 jours", suffixDate: "de 5 à 9 jours", delai: "1 mois avant le 1er jour" },
  { min: 10, max: 15, radio: "de 10 à 15", suffixJours: "de 10 à 15 jours", suffixDate: "de 10 à 15 jours", delai: "2 mois avant le 1er jour" },
  { min: 16, max: 20, radio: "de 16 à 20", suffixJours: "de 16 à 20 jours", suffixDate: "de 16 à 20 jours", delai: "4 mois avant le 1er jour" },
];

const SOUS_COMPTES = [
  { k: "courant", label: "Compte courant" },
  { k: "finActivite", label: "Compte fin d'activité" },
];

// "Demande d'utilisation en temps — sous-compte courant" (09/08, signalé par
// Olivier : "Il manque : Demande d'absence au titre du CET / Dates : du : /
// / au / /") — cette zone existe bien sur l'imprimé officiel mais N'EST PAS
// un champ AcroForm remplissable (juste du texte + des barres "/" imprimées
// sur la page, vérifié via l'extraction du flux texte du PDF) — contrairement
// au reste du formulaire, il faut donc dessiner le texte à des coordonnées
// fixes (même technique que DemandeCongesView.jsx), pas via form.getTextField.
const RECT_DATES_UTIL_COURANT = {
  y: 632,
  du: { jour: [95, 116], mois: [124, 147], annee: [155, 198] },
  au: { jour: [218, 239], mois: [247, 267], annee: [277, 318] },
};

// Nom de fichier harmonisé (15/08, même principe que DemandeCongesView.jsx :
// "Nom_TypeCet_MoisAnnee") — d'après la date de début pour le seul type qui
// en a une (utilisationCourant, dateDebutUtil), sinon la date de génération
// (les 5 autres types n'ont aucun champ date réel à représenter).
const MOIS_NOMS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
function moisAnneeNom(iso) {
  if (!iso) return "";
  const [a, m] = iso.split("-").map(Number);
  return `${MOIS_NOMS[m - 1]}${a}`;
}
const LABEL_FICHIER_TYPE = {
  epargne: "EpargneCet",
  intention: "IntentionEpargneConges",
  utilisation: "UtilisationFinActivite",
  monetisation: "MonetisationFinActivite",
  utilisationCourant: "UtilisationCourant",
  transfert: "TransfertJours",
};

function versDDMMYYYY(iso) {
  if (!iso) return "";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

// Dessine une date (jj/mm/aaaa) répartie dans 3 zones séparées, chaque
// segment centré dans son rectangle — pour s'insérer entre les barres "/"
// déjà imprimées sur le PDF plutôt que de dessiner une seule chaîne "jj/mm/aaaa".
function dessinerDateSegmentee(page, font, iso, rects, y) {
  if (!iso) return;
  const [aaaa, mm, jj] = iso.split("-");
  const centrer = (texte, [x0, x1]) => {
    const taille = 8;
    const largeur = font.widthOfTextAtSize(texte, taille);
    page.drawText(texte, { x: x0 + (x1 - x0 - largeur) / 2, y, size: taille, font });
  };
  centrer(jj, rects.jour); centrer(mm, rects.mois); centrer(aaaa, rects.annee);
}

// "RH0930 - Demande d'utilisation en temps des jours du sous-compte de fin
// d'activité" (09/08, signalé par Olivier avec le texte exact des 3 options)
// — "Forme de l'absence demandée" propose 3 formes bien distinctes sur
// l'imprimé officiel, vérifiées champ par champ (pdf-lib, coordonnées croisées
// avec le flux texte du PDF) :
//  1. Congé de fin d'activité seul (déjà géré avant le 09/08)
//  2. Activité à durée réduite (1/2/3 ans) qui solde directement le
//     sous-compte
//  3. Activité à durée réduite (1/2/3 ans) SUIVIE d'un congé de fin
//     d'activité qui solde le sous-compte
// Chaque forme a son propre champ "nombre de jours" et sa propre date "pour
// aboutir le" sur le PDF (jamais partagés entre les 3), sauf la durée en
// années (radio "1 an/2 ans/3 ans") qui n'existe que pour les formes 2 et 3.
const FORMES_ABSENCE = [
  { k: "congeFinActivite", label: "Congé de fin d'activité", radio: "Congé fin activité", champJours: "nombre jours congé", champDate: "Date fin d'activité", avecDuree: false },
  { k: "activiteReduite", label: "Activité à durée réduite (soldant directement le sous-compte)", radio: "Activité durée réduite", champJours: "nombre jours activité réduite", champDate: "Date avant le", avecDuree: true, radioDuree: "activité réduite" },
  { k: "activiteReduiteFin", label: "Activité à durée réduite, puis congé de fin d'activité", radio: "Activité durée réduite fin", champJours: "nombre jours activité réduite fin", champDate: "Date avant le 2", avecDuree: true, radioDuree: "activité réduite fin" },
];
const DUREES_ACTIVITE_REDUITE = ["1 an", "2 ans", "3 ans"];

// Mode opératoire (09/08, demandé par Olivier : "il faut reprendre le mode
// opératoire du PDF, la partie Modes opératoires Agents sédentaires
// uniquement" — texte verbatim de chaque imprimé officiel, page 2, extrait
// via pdfjs. Seule la section "Agents sédentaires" est reprise (celles
// "Agents de conduite"/"Agents de train" qui suivent sur les mêmes pages ne
// concernent pas ce métier, jamais copiées). CET_utilisation_courant.pdf n'a
// pas de découpage par métier — c'est tout le "Mode opératoire" (tableau
// Acteurs/Procédure) qui est repris tel quel.
const MODE_OPERATOIRE = {
  epargne: `1- L'agent remplit la demande d'épargne et l'envoie au gestionnaire. Si erreur sur le formulaire, le gestionnaire le retourne à l'agent.
2- Le gestionnaire saisit la demande dans IDAP, la signe, et l'envoie au pôle RH pour classement dans le dossier de l'agent. Il transmet une copie du formulaire au hiérarchique et le récépissé à l'agent.
3- Le hiérarchique envoie la copie du formulaire, après visa, au pôle RH pour classement dans le dossier de l'agent.

Annulation
4- Un des intervenants signale une anomalie.
5- Le gestionnaire annule l'épargne (une seule annulation possible par acte de gestion), procède à la modification nécessaire, et envoie à l'agent et au hiérarchique une impression écran du nouvel état CET.
Le pôle RH reçoit cette même impression écran accompagnée du justificatif d'annulation pour classement dans le dossier de l'agent.`,
  intention: `1- L'agent remplit le formulaire d'intention et l'envoie au gestionnaire. Si erreur sur le formulaire, le gestionnaire le retourne à l'agent.
2- Le gestionnaire conserve la demande.
3- Le gestionnaire enregistre la demande de l'agent, envoie une copie du formulaire au hiérarchique et le récépissé à l'agent. Il conserve le formulaire jusqu'au 31/03/A+1.
4- Le hiérarchique, après visa, envoie la copie du formulaire au pôle RH pour classement dans le dossier de l'agent.
5- Le gestionnaire, avant le 31/03 de l'année A+1, vérifie le droit aux congés mis en intentions (si le droit à ces jours de congés n'est pas acquis, le gestionnaire corrige manuellement dans IDAP). Le gestionnaire, après confirmation automatique de l'intention au 31/03 de l'année A+1, envoie le formulaire au pôle RH pour classement dans le dossier de l'agent.
6- Si l'agent demande à modifier ou supprimer ses intentions, il complète le récépissé et l'envoie au hiérarchique.
7- Si le hiérarchique accepte la demande de l'agent, il vise le récépissé et l'envoie au gestionnaire. S'il refuse, il vise le récépissé, en remet une copie à l'agent et l'original au gestionnaire pour classement dans le dossier de l'agent.
8- Le gestionnaire procède à la suppression ou la modification, envoie une copie du récépissé à l'agent et envoie l'original du récépissé au pôle RH pour classement dans le dossier de l'agent.`,
  utilisation: `1- L'agent, aidé éventuellement de son gestionnaire, remplit le formulaire et l'envoie au hiérarchique en respectant les délais de prévenance. En cas d'erreur, le formulaire est retourné à l'agent.
2- Le hiérarchique prend acte de la demande et transmet le formulaire au gestionnaire.
3- Le gestionnaire vise le formulaire et l'envoie au pôle RH. Dans l'outil CET, il crée la convention en deux exemplaires originaux dans lesquels figure l'estimation automatique du nombre de jours à utiliser.
4- Le gestionnaire transmet les deux exemplaires de la convention au pôle RH.
5- Le pôle RH vise le formulaire, le classe dans le dossier de l'agent, et remet le récépissé à l'agent pour le convoquer à la signature de la convention.
6- Le pôle RH signe la convention avec l'agent et remet un exemplaire à ce dernier. Il envoie un exemplaire de la convention au gestionnaire.
7- Le gestionnaire valide la convention dans l'outil CET national.
8- Le gestionnaire pose les codes absences (WF et/ou WR) dans IDAP.
9- Le gestionnaire transmet la convention au pôle RH pour classement dans le dossier de l'agent.`,
  monetisation: `1- L'agent remplit la demande de monétisation et l'envoie à son hiérarchique. En cas d'erreur, le formulaire est retourné à l'agent.
2- Si le hiérarchique accepte la demande, il envoie le formulaire au gestionnaire CET. S'il refuse, il remet un récépissé à l'agent, et envoie le formulaire au pôle RH pour classement dans le dossier de l'agent.
3- Le gestionnaire CET met à jour l'outil CET, vise le formulaire et l'envoie à l'Agence Paie et Famille.
4- L'Agence Paie et Famille valorise les jours demandés et saisit l'unité d'œuvre et le montant à la rubrique 0831 dans IDAP. Il vise le formulaire, l'envoie au pôle RH pour classement dans le dossier de l'agent. Il remplit le récépissé et le remet à l'agent.

Annulation
5- Un des intervenants signale une anomalie.
6- Le gestionnaire CET annule la demande dans l'outil CET (une seule annulation est possible par acte de gestion), procède à la modification nécessaire, et envoie à l'agent, au hiérarchique et à l'Agence Paie et Famille une impression écran du nouvel état CET. Le pôle RH reçoit cette même impression accompagnée du justificatif d'annulation pour classement dans le dossier de l'agent.
7- L'Agence Paie et Famille paye ou reprend les indus.`,
  transfert: `1- L'agent remplit la demande de transfert et la transmet au gestionnaire. Si erreur sur le formulaire, le gestionnaire le retourne à l'agent.
2- Le gestionnaire met à jour les comptes du CET, complète et vise le formulaire, remet le récépissé à l'agent et envoie le formulaire au pôle RH pour classement dans le dossier de l'agent.

Annulation
3- Un des intervenants signale une anomalie.
4- Le gestionnaire annule la demande de transfert (une seule annulation est possible par acte de gestion) procède à l'annulation. Il envoie à l'agent une impression écran du nouvel état CET de l'agent. Le pôle RH reçoit cette même impression écran accompagnée du justificatif de l'annulation pour classement dans le dossier de l'agent.`,
  utilisationCourant: `Acteurs / Procédure

Agent
• Complète la demande (cadre grisé) de l'imprimé.
• Attention : si le cadre (zone grisée) n'est pas complété, le récépissé ne sera pas remis à l'agent.
• Si cette demande doit être complétée par des jours d'absences non issus du CET, joindre une demande réglementaire d'absence en complément.
• Transmet à son hiérarchique ou personne chargée de sa programmation.

Hiérarchique (DPX, CPS, Responsable de la production …)
Prend la décision (cadre) :
1) En relation avec le gestionnaire du CET pour vérification de l'acquisition des jours dans le sous-compte courant.
2) Confirme ou modifie la demande (en complétant si nécessaire le cadre).
3) En cas de refus, retourne à l'agent le récépissé pour une concertation.
4) Transmet au gestionnaire du CET pour mise à jour du sous-compte courant.

Gestionnaire du CET
• Met à jour le sous-compte courant.
• Garde une copie.
• Transmet au gestionnaire d'utilisation.

Gestionnaire d'utilisation
• Confirme l'absence dans l'outil de gestion du personnel.
• Remet le récépissé à l'agent.
• A l'issue de l'année considérée, transmet au pôle RH pour archivage.`,
};

// Motifs de monétisation (imprimé "Demande de monétisation — sous-compte fin
// d'activité") — texte verbatim de l'imprimé officiel, jamais reformulé.
const MOTIFS_MONETISATION = [
  { code: "rh0926", label: "Article 5-2 point e) du RH0926", detail: "dans les 2 mois suivant l'évènement considéré, avec justificatifs" },
  { code: "rh0930", label: "Article 5-2 point e) du RH0930", detail: "Loi du 20/08/2008 « portant rénovation de la démocratie sociale et réforme du temps de travail »" },
];

// Sources sélectionnables pour la Demande d'épargne hors congés — limitées à
// ce que l'appli suit réellement (voir CetView.jsx SOURCES_EPARGNE) : RS et
// RG existent sur l'imprimé officiel mais n'ont aucune donnée correspondante
// dans l'appli, "abondement" est un mouvement automatique jamais demandé
// explicitement par l'agent — les trois sont donc volontairement absents ici.
// RCF (repos compensateur de fêtes) ajouté le 07/08 sur demande d'Olivier.
const SOURCES_EPARGNE_HC = [
  { code: "RQ", label: "RQ (repos supplémentaires)", radio: "RQ", suffix: "RQ Repos supplémentaires" },
  { code: "RN", label: "RN (repos compensateur de nuit)", radio: "RN", suffix: "RN Repos compensateur de nuit" },
  { code: "TC", label: "TC (temps compensé mensuel)", radio: "TC", suffix: "TC Temps compensé mensuel" },
  { code: "TY", label: "TY (temps compensé semestriel)", radio: "TY", suffix: "TY Temps compensé semestriel" },
  { code: "RCF", label: "RCF (repos compensateur de fêtes)", radio: "RCF", suffix: "RCF repos compensateur de fêtes" },
  { code: "MEDAILLE", label: "Congé médaille d'honneur des Chemins de Fer", radio: "Congé médaille", suffix: "Congé Médaille" },
];

function joursVides() {
  return Object.fromEntries(SOURCES_EPARGNE_HC.map(s => [s.code, { courant: "", finActivite: "" }]));
}

function dateAuj() {
  return new Date().toLocaleDateString("fr-FR");
}

// ─── Remplissage identité, commun aux 6 imprimés (mêmes noms de champs :
// Nom1 / Prénom1 / Code CP12..82 / "Etablissement  Signature1") ───────────
function remplirIdentite(form, { nom, prenom, cp }) {
  const set = (name, val) => { try { form.getTextField(name).setText(val || ""); } catch (e) {} };
  set("Nom1", (nom || "").toUpperCase());
  set("Prénom1", prenom || "");
  set("Etablissement  Signature1", "EIC PSO");
  const cpStr = (cp || "").toUpperCase().padEnd(8, " ");
  for (let i = 0; i < 8; i++) set(`Code CP${i + 1}2`, cpStr[i]?.trim() || "");
}

// Coche plusieurs cases d'un groupe radio à la fois, en manipulant chaque
// widget directement (contourne la contrainte "un seul sélectionné" de
// form.getRadioGroup().select(), qui décoche tout le reste à chaque appel).
// Sans danger ici : le formulaire est aplati juste après, donc seul le
// rendu visuel de chaque widget compte, plus son état de champ interactif.
function cocherPlusieurs(form, nomChamp, valeursACocher) {
  try {
    const field = form.getRadioGroup(nomChamp);
    const widgets = field.acroField.getWidgets();
    widgets.forEach(w => {
      const onVal = w.getOnValue();
      const nom = onVal ? onVal.decodeText() : null;
      if (nom && valeursACocher.has(nom)) w.setAppearanceState(onVal);
      else w.setAppearanceState(PDFName.of("Off"));
    });
  } catch (e) {}
}

async function chargerFormulaire(url) {
  const bytes = await fetch(url).then(r => r.arrayBuffer());
  const doc = await PDFDocument.load(bytes);
  return { doc, form: doc.getForm() };
}

// Signature agent (09/08) — localise les zones où insérer la signature avant
// aplatissement. Chaque imprimé CET a un champ AcroForm réel "Signature
// électronique" (type /Sig, prévu pour une signature électronique certifiée
// — hors de portée ici, on se contente de dessiner l'image PAR-DESSUS au
// même endroit) mais certains imprimés le dupliquent (formulaire + copie
// "Récépissé" en bas de page) et un seul (intention d'épargne de congés) a
// EN PLUS un second champ homonyme qui appartient en réalité à une section
// "Date de demande de MODIFICATION" bien différente, pas à l'identité de
// l'agent — vérifié visuellement (rendu réel des 7 PDF, voir CLAUDE.md) avant
// d'écrire cette règle : un champ signature n'est retenu QUE s'il se trouve
// à moins de 50pt (verticalement, même page) d'un widget "Nom1" — la même
// distance que dans TOUTES les vraies zones identité de ces imprimés (23 à
// 32pt observés), très en dessous des ~80-100pt qui séparent la zone
// "modification" du bloc identité le plus proche. Un imprimé sans aucun
// champ signature (Demande d'utilisation en temps — sous-compte courant,
// confirmé à l'oeil : aucune ligne "Signature" sur le PDF officiel) ne
// renvoie simplement aucune zone, rien n'est dessiné.
function trouverZonesSignature(doc, form) {
  const pages = doc.getPages();
  const nomWidgets = [];
  try {
    form.getField("Nom1").acroField.getWidgets().forEach(w => {
      const rect = w.getRectangle();
      const pageIdx = pages.findIndex(p => p.ref === w.P());
      nomWidgets.push({ pageIdx, y: rect.y });
    });
  } catch (e) {}
  const zones = [];
  form.getFields().forEach(f => {
    if (!f.getName().startsWith("Signature électronique")) return;
    f.acroField.getWidgets().forEach(w => {
      const rect = w.getRectangle();
      const pageIdx = pages.findIndex(p => p.ref === w.P());
      const proche = nomWidgets.some(n => n.pageIdx === pageIdx && Math.abs(n.y - rect.y) <= 50);
      if (proche) zones.push({ pageIdx, rect });
    });
  });
  return zones;
}

// Retire les annotations de commentaire Acrobat (icone "note" + sa bulle
// /Popup) laissees par megarde dans les 6 imprimes CET officiels source —
// verifie present sur les 6 PDF ET sur celui de Conges des l'origine (donc
// pas introduit par ce code), toujours au meme endroit pres de "Etude :".
// Invisible sur le PDF de Conges final car son pipeline (embedPdf, page
// integree comme XObject) ne recopie jamais les annotations de la page
// source — seul le CET (qui charge le template directement comme document
// de sortie, pour remplir ses vrais champs AcroForm) les conserve jusqu'ici.
// Signale par Olivier comme "point d'interrogation rouge... pas sur l'original".
function retirerAnnotationsCommentaire(doc) {
  const subtypeKey = PDFName.of("Subtype");
  const annotsKey = PDFName.of("Annots");
  doc.getPages().forEach(page => {
    const annots = page.node.Annots();
    if (!annots) return;
    const garder = [];
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      const obj = doc.context.lookup(ref);
      const subtype = obj?.get?.(subtypeKey)?.toString();
      if (subtype === "/Text" || subtype === "/Popup") continue;
      garder.push(ref);
    }
    page.node.set(annotsKey, doc.context.obj(garder));
  });
}

async function finaliser(doc, form, signatureDataUrl) {
  const zones = signatureDataUrl ? trouverZonesSignature(doc, form) : [];
  try { form.flatten(); } catch (e) {}
  retirerAnnotationsCommentaire(doc);
  if (signatureDataUrl && zones.length) {
    try {
      const sig = await doc.embedPng(signatureDataUrl);
      const pages = doc.getPages();
      zones.forEach(({ pageIdx, rect }) => {
        const pad = 4;
        const availW = rect.width - pad * 2, availH = rect.height - pad * 2;
        const scale = Math.min(availW / sig.width, availH / sig.height, 1);
        const w = sig.width * scale, h = sig.height * scale;
        pages[pageIdx].drawImage(sig, {
          x: rect.x + (rect.width - w) / 2,
          y: rect.y + (rect.height - h) / 2,
          width: w, height: h,
        });
      });
    } catch (e) { console.error("Erreur insertion signature:", e); }
  }
  return doc.save();
}

// lignes : [{ source, courant, finActivite }], déjà filtrées aux entrées
// non-vides (au moins un des deux nombres > 0) par l'appelant.
async function genererEpargneHorsConges({ nom, prenom, cp, lignes, signatureDataUrl }) {
  const { doc, form } = await chargerFormulaire("/CET_epargne_hors_conges.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  const radiosACocher = new Set();
  for (const l of lignes) {
    const src = SOURCES_EPARGNE_HC.find(s => s.code === l.source);
    if (!src) continue;
    radiosACocher.add(src.radio);
    if (l.courant) { try { form.getTextField(`Courant${src.suffix}`).setText(String(l.courant)); } catch (e) {} }
    if (l.finActivite) { try { form.getTextField(`Fin dactivité${src.suffix}`).setText(String(l.finActivite)); } catch (e) {} }
  }
  cocherPlusieurs(form, "types de jours", radiosACocher);
  try { form.getTextField("Date de la demande").setText(dateAuj()); } catch (e) {}
  return finaliser(doc, form, signatureDataUrl);
}

async function genererIntentionConges({ nom, prenom, cp, joursCourant, joursFinActivite, signatureDataUrl }) {
  const { doc, form } = await chargerFormulaire("/CET_intention_epargne_conges.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  if (joursCourant) { try { form.getTextField("Sous compte courantNombre de congés à épargner").setText(String(joursCourant)); } catch (e) {} }
  if (joursFinActivite) { try { form.getTextField("Sous compte fin dactivitéNombre de congés à épargner").setText(String(joursFinActivite)); } catch (e) {} }
  try { form.getTextField("Date de demande Row1").setText(dateAuj()); } catch (e) {}
  return finaliser(doc, form, signatureDataUrl);
}

async function genererUtilisationFinActivite({ nom, prenom, cp, jours, formeAbsence, dureeReduite, dateAboutir, signatureDataUrl }) {
  const { doc, form } = await chargerFormulaire("/CET_utilisation_fin_activite.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  const forme = FORMES_ABSENCE.find(f => f.k === formeAbsence) || FORMES_ABSENCE[0];
  try { form.getRadioGroup("Forme d'absence").select(forme.radio); } catch (e) {}
  if (forme.avecDuree) { try { form.getRadioGroup(forme.radioDuree).select(dureeReduite); } catch (e) {} }
  try { form.getTextField(forme.champJours).setText(String(jours)); } catch (e) {}
  try { form.getTextField(forme.champDate).setText(versDDMMYYYY(dateAboutir)); } catch (e) {}
  try { form.getTextField("Date de la demande de lagent").setText(dateAuj()); } catch (e) {}
  return finaliser(doc, form, signatureDataUrl);
}

async function genererMonetisationFinActivite({ nom, prenom, cp, jours, motif, signatureDataUrl }) {
  const { doc, form } = await chargerFormulaire("/CET_monetisation_fin_activite.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  try { form.getTextField("Nombre de jours à monétiser").setText(String(jours)); } catch (e) {}
  try { form.getRadioGroup("motif choisi").select(motif); } catch (e) {}
  try { form.getTextField("Date de la demande").setText(dateAuj()); } catch (e) {}
  return finaliser(doc, form, signatureDataUrl);
}

async function genererUtilisationCourant({ nom, prenom, cp, jours, demandeComplementaire, dateDebut, dateFin, signatureDataUrl }) {
  const { doc, form } = await chargerFormulaire("/CET_utilisation_courant.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  const palier = PALIERS_UTIL_COURANT.find(p => Number(jours) >= p.min && Number(jours) <= p.max);
  if (palier) {
    try { form.getRadioGroup("durée jours").select(palier.radio); } catch (e) {}
    try { form.getTextField(`Nombre de jours issus du CET entre 5 et 20${palier.suffixJours}`).setText(String(jours)); } catch (e) {}
    try { form.getTextField(`Date de la demande${palier.suffixDate}`).setText(dateAuj()); } catch (e) {}
  }
  try { form.getRadioGroup("demande complémentaire").select(demandeComplementaire ? "oui" : "non"); } catch (e) {}
  // "Demande d'absence au titre du CET / Dates : du .. au .." (09/08,
  // signalé manquant par Olivier) — pas un champ AcroForm, dessiné à des
  // coordonnées fixes directement sur la page (voir RECT_DATES_UTIL_COURANT).
  if (dateDebut || dateFin) {
    try {
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const page = doc.getPages()[0];
      dessinerDateSegmentee(page, font, dateDebut, RECT_DATES_UTIL_COURANT.du, RECT_DATES_UTIL_COURANT.y);
      dessinerDateSegmentee(page, font, dateFin, RECT_DATES_UTIL_COURANT.au, RECT_DATES_UTIL_COURANT.y);
    } catch (e) { console.error("Erreur insertion dates du/au:", e); }
  }
  // Pas de champ "Signature électronique" sur cet imprimé officiel (vérifié
  // visuellement, 09/08) — signatureDataUrl transmis quand même à finaliser
  // pour rester cohérent avec les 5 autres, trouverZonesSignature() ne
  // trouvera simplement aucune zone et rien ne sera dessiné.
  return finaliser(doc, form, signatureDataUrl);
}

async function genererTransfertJours({ nom, prenom, cp, jours, signatureDataUrl }) {
  const { doc, form } = await chargerFormulaire("/CET_transfert_jours.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  try { form.getTextField("nombre de jours transférer").setText(String(jours)); } catch (e) {}
  try { form.getTextField("Date de la demande").setText(dateAuj()); } catch (e) {}
  return finaliser(doc, form, signatureDataUrl);
}

function messageEmail({ type, prenom, nom, jours, lignesEpargne, joursCourant, joursFinActivite, demandeComplementaire, motif, formeAbsence, dateDebut, dateFin, dateAboutir }) {
  let corps = "";
  if (type === "epargne") {
    const parts = lignesEpargne.map(l => {
      const label = SOURCES_EPARGNE_HC.find(s => s.code === l.source)?.label || l.source;
      const sousParts = [];
      if (l.courant) sousParts.push(`${l.courant}j sur le compte courant`);
      if (l.finActivite) sousParts.push(`${l.finActivite}j sur le compte fin d'activité`);
      return `${label} : ${sousParts.join(" et ")}`;
    });
    corps = `Ci-joint ma demande d'épargne sur le CET (hors congés annuels) :\n${parts.map(p => `- ${p}`).join("\n")}`;
  } else if (type === "intention") {
    const parts = [];
    if (joursCourant) parts.push(`${joursCourant} jour(s) sur le compte courant`);
    if (joursFinActivite) parts.push(`${joursFinActivite} jour(s) sur le compte fin d'activité`);
    corps = `Ci-joint mon intention d'épargne de congés annuels : ${parts.join(" et ")}.`;
  } else if (type === "utilisation") {
    const formeLabel = FORMES_ABSENCE.find(f => f.k === formeAbsence)?.label || "";
    const dateTxt = dateAboutir ? `, pour aboutir le ${versDDMMYYYY(dateAboutir)}` : "";
    corps = `Ci-joint ma demande d'utilisation en temps des jours du sous-compte de fin d'activité : ${jours} jour(s) (${formeLabel})${dateTxt}.`;
  } else if (type === "monetisation") {
    const motifLabel = MOTIFS_MONETISATION.find(m => m.code === motif)?.label || "";
    corps = `Ci-joint ma demande de monétisation des jours du sous-compte de fin d'activité : ${jours} jour(s), au titre de ${motifLabel}.`;
  } else if (type === "utilisationCourant") {
    const periodeTxt = (dateDebut && dateFin) ? `, du ${versDDMMYYYY(dateDebut)} au ${versDDMMYYYY(dateFin)}` : "";
    if (demandeComplementaire) {
      return `Bonjour,

Ci-joint ma demande d'utilisation en temps des jours du sous-compte courant : ${jours} jour(s)${periodeTxt}.

Je souhaite compléter par des jours d'absences non issus du CET.
Ma demande réglementaire d'absence en complément est en pièce jointe.

Merci.
Cordialement.

${prenom} ${nom}`;
    }
    corps = `Ci-joint ma demande d'utilisation en temps des jours du sous-compte courant : ${jours} jour(s)${periodeTxt}.`;
  } else if (type === "transfert") {
    corps = `Ci-joint ma demande de transfert de jours du sous-compte courant vers le sous-compte de fin d'activité : ${jours} jour(s).`;
  }
  return `Bonjour,

${corps}

Cordialement,
${prenom} ${nom}`;
}

// Notice repliable "Mode opératoire — Agents sédentaires" (09/08) — même
// principe que les notices de App.jsx (repliée par défaut, scrollIntoView à
// l'ouverture pour ne pas la laisser hors écran sur mobile) mais gardée
// locale à ce fichier : CetPdfsView.jsx reste volontairement isolé du reste
// de l'appli (aucun import croisé avec App.jsx/CetView.jsx), même principe
// d'isolation que le composant lui-même.
function NoticeModeOperatoire({ texte }) {
  const [ouvert, setOuvert] = useState(false);
  const contentRef = useRef(null);
  useEffect(() => { if (ouvert) contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [ouvert]);
  if (!texte) return null;
  return (
    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
      <button onClick={() => setOuvert(v => !v)} style={{ background: "none", border: "none", color: "#5b21b6", cursor: "pointer", fontSize: 12, fontWeight: 800, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
        {ouvert ? "▴" : "▾"} 📖 Mode opératoire — Agents sédentaires
      </button>
      {ouvert && (
        <div ref={contentRef} style={{ marginTop: 10, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: "#334155", whiteSpace: "pre-line", lineHeight: 1.5 }}>
          {texte}
        </div>
      )}
    </div>
  );
}

export default function CetPdfsView({ currentAgent, agentProfiles }) {
  const signatureDataUrl = agentProfiles?.[currentAgent?.id]?.signatureDataUrl || null;
  const [type, setType] = useState(TYPES[0].k);
  const [epargneLignes, setEpargneLignes] = useState(joursVides());
  const [joursCourant, setJoursCourant] = useState("");
  const [joursFinActivite, setJoursFinActivite] = useState("");
  const [jours, setJours] = useState("");
  const [demandeComplementaire, setDemandeComplementaire] = useState(false);
  const [motif, setMotif] = useState(MOTIFS_MONETISATION[0].code);
  // "Forme de l'absence demandée" (imprimé fin d'activité, 09/08) — 3 formes
  // distinctes, chacune avec sa propre durée réduite / jours / date sur le PDF.
  const [formeAbsence, setFormeAbsence] = useState(FORMES_ABSENCE[0].k);
  const [dureeReduite, setDureeReduite] = useState(DUREES_ACTIVITE_REDUITE[0]);
  const [dateAboutir, setDateAboutir] = useState("");
  // "Demande d'absence au titre du CET / Dates : du .. au .." (imprimé
  // sous-compte courant, 09/08).
  const [dateDebutUtil, setDateDebutUtil] = useState("");
  const [dateFinUtil, setDateFinUtil] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [messageCopie, setMessageCopie] = useState(false);
  const [messageSurligne, setMessageSurligne] = useState(false);
  const emailCardRef = useRef(null);

  const changerType = (k) => {
    setType(k); setJours(""); setDemandeComplementaire(false);
    setEpargneLignes(joursVides()); setJoursCourant(""); setJoursFinActivite("");
    setMotif(MOTIFS_MONETISATION[0].code); setErr(null);
    setFormeAbsence(FORMES_ABSENCE[0].k); setDureeReduite(DUREES_ACTIVITE_REDUITE[0]); setDateAboutir("");
    setDateDebutUtil(""); setDateFinUtil("");
  };

  const majEpargneLigne = (code, sc, val) => {
    setEpargneLignes(prev => ({ ...prev, [code]: { ...prev[code], [sc]: val } }));
  };

  const nom = currentAgent?.nom || "";
  const prenom = currentAgent?.prenom || "";
  const cp = currentAgent?.cp || currentAgent?.id || "";

  const lignesEpargneValides = SOURCES_EPARGNE_HC
    .map(s => ({ source: s.code, courant: Number(epargneLignes[s.code].courant) || 0, finActivite: Number(epargneLignes[s.code].finActivite) || 0 }))
    .filter(l => l.courant > 0 || l.finActivite > 0);

  const joursValides = type === "utilisationCourant"
    ? jours !== "" && Number(jours) >= 5 && Number(jours) <= 20 && dateDebutUtil !== "" && dateFinUtil !== ""
    : type === "epargne"
    ? lignesEpargneValides.length > 0
    : type === "intention"
    ? (Number(joursCourant) || 0) > 0 || (Number(joursFinActivite) || 0) > 0
    : type === "utilisation"
    ? jours !== "" && Number(jours) > 0 && dateAboutir !== ""
    : jours !== "" && Number(jours) > 0;

  const messageGenere = messageEmail({ type, prenom, nom, jours, lignesEpargne: lignesEpargneValides, joursCourant, joursFinActivite, demandeComplementaire, motif, formeAbsence, dateDebut: dateDebutUtil, dateFin: dateFinUtil, dateAboutir });

  const copierMessage = () => {
    navigator.clipboard.writeText(messageGenere).then(() => {
      setMessageCopie(true);
      setTimeout(() => setMessageCopie(false), 2000);
    });
  };

  const generer = async () => {
    setErr(null);
    if (!joursValides) {
      const messages = {
        utilisationCourant: (jours === "" || Number(jours) < 5 || Number(jours) > 20)
          ? "Indique un nombre de jours entre 5 et 20 (règle de cet imprimé)."
          : "Indique les dates de l'absence (du ... au ...).",
        epargne: "Indique au moins un nombre de jours (courant ou fin d'activité) pour un type de jours.",
        intention: "Indique au moins un nombre de congés (courant ou fin d'activité).",
        utilisation: (jours === "" || Number(jours) <= 0)
          ? "Indique un nombre de jours valide."
          : "Indique la date visée pour le dernier jour d'activité.",
      };
      setErr(messages[type] || "Indique un nombre de jours valide.");
      return;
    }
    setBusy(true);
    try {
      let bytes;
      const nomAgent = (nom || "Agent").toUpperCase().replace(/\s+/g, "_");
      const moisAnnee = type === "utilisationCourant" && dateDebutUtil
        ? moisAnneeNom(dateDebutUtil)
        : moisAnneeNom(new Date().toISOString().slice(0, 10));
      const nomFichier = `${nomAgent}_${LABEL_FICHIER_TYPE[type]}_${moisAnnee}.pdf`;
      if (type === "epargne") {
        bytes = await genererEpargneHorsConges({ nom, prenom, cp, lignes: lignesEpargneValides, signatureDataUrl });
      } else if (type === "intention") {
        bytes = await genererIntentionConges({ nom, prenom, cp, joursCourant, joursFinActivite, signatureDataUrl });
      } else if (type === "utilisation") {
        bytes = await genererUtilisationFinActivite({ nom, prenom, cp, jours, formeAbsence, dureeReduite, dateAboutir, signatureDataUrl });
      } else if (type === "monetisation") {
        bytes = await genererMonetisationFinActivite({ nom, prenom, cp, jours, motif, signatureDataUrl });
      } else if (type === "utilisationCourant") {
        bytes = await genererUtilisationCourant({ nom, prenom, cp, jours, demandeComplementaire, dateDebut: dateDebutUtil, dateFin: dateFinUtil, signatureDataUrl });
      } else {
        bytes = await genererTransfertJours({ nom, prenom, cp, jours, signatureDataUrl });
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomFichier;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      emailCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setMessageSurligne(true);
      setTimeout(() => setMessageSurligne(false), 2500);
    } catch (e) {
      console.error(e);
      setErr("Erreur lors de la génération du PDF. Réessaie.");
    }
    setBusy(false);
  };

  const champStyle = { width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14 };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4, display: "block" };
  const pillStyle = (actif) => ({
    padding: "9px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    border: actif ? "1.5px solid #5b21b6" : "1.5px solid #e2e8f0",
    background: actif ? "#5b21b6" : "#fff", color: actif ? "#fff" : "#334155",
    textAlign: "left",
  });
  const miniInputStyle = { width: 60, textAlign: "center", padding: "7px 4px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontWeight: 700 };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🏦 CET — Générer un PDF officiel</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
          Nom, prénom et CP sont pris automatiquement depuis ton profil. Ce générateur ne modifie rien dans ton suivi CET — c'est un simple imprimé à envoyer.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>Type de demande</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {TYPES.map(t => (
                <button key={t.k} onClick={() => changerType(t.k)} style={pillStyle(type === t.k)}>{t.label}</button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: "#e2e8f0", margin: "4px 0" }} />

          {type === "epargne" && (
            <div>
              <label style={labelStyle}>Jours à épargner — par type, réparti entre les 2 sous-comptes si besoin</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, paddingLeft: 4 }}>
                  <div style={{ flex: 1 }} />
                  <div style={{ width: 60, textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "#64748b" }}>Courant</div>
                  <div style={{ width: 60, textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "#64748b" }}>Fin d'activité</div>
                </div>
                {SOURCES_EPARGNE_HC.map(s => (
                  <div key={s.code} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "#1e293b" }}>{s.label}</div>
                    <input type="number" min="0" style={miniInputStyle} value={epargneLignes[s.code].courant} onChange={e => majEpargneLigne(s.code, "courant", e.target.value)} />
                    <input type="number" min="0" style={miniInputStyle} value={epargneLignes[s.code].finActivite} onChange={e => majEpargneLigne(s.code, "finActivite", e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {type === "intention" && (
            <div>
              <label style={labelStyle}>Nombre de congés à épargner — par sous-compte</label>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 }}>Compte courant</div>
                  <input type="number" min="0" value={joursCourant} onChange={e => setJoursCourant(e.target.value)} style={champStyle} placeholder="ex : 1" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 }}>Compte fin d'activité</div>
                  <input type="number" min="0" value={joursFinActivite} onChange={e => setJoursFinActivite(e.target.value)} style={champStyle} placeholder="ex : 1" />
                </div>
              </div>
            </div>
          )}

          {type === "monetisation" && (
            <div>
              <label style={labelStyle}>Motif choisi</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {MOTIFS_MONETISATION.map(m => (
                  <button key={m.code} onClick={() => setMotif(m.code)} style={pillStyle(motif === m.code)}>
                    <div>{m.label}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 500, color: motif === m.code ? "#e9d5ff" : "#94a3b8", marginTop: 2 }}>{m.detail}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === "utilisation" && (
            <div>
              <label style={labelStyle}>Forme de l'absence demandée</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {FORMES_ABSENCE.map(f => (
                  <button key={f.k} onClick={() => setFormeAbsence(f.k)} style={pillStyle(formeAbsence === f.k)}>{f.label}</button>
                ))}
              </div>

              {(() => {
                const forme = FORMES_ABSENCE.find(f => f.k === formeAbsence);
                return (
                  <>
                    {forme?.avecDuree && (
                      <div style={{ marginTop: 10 }}>
                        <label style={labelStyle}>Durée de l'activité réduite</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          {DUREES_ACTIVITE_REDUITE.map(d => (
                            <button key={d} onClick={() => setDureeReduite(d)} style={{ ...pillStyle(dureeReduite === d), flex: 1, textAlign: "center" }}>{d}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: 10 }}>
                      <label style={labelStyle}>
                        {formeAbsence === "congeFinActivite" && "Nombre de jours (sur-abondement compris)"}
                        {formeAbsence === "activiteReduite" && "Nombre de jours soldant le sous-compte (sur-abondement compris)"}
                        {formeAbsence === "activiteReduiteFin" && "Nombre de jours du congé de fin d'activité (sur-abondement compris)"}
                      </label>
                      <input type="number" min="0" step="1" value={jours} onChange={e => setJours(e.target.value)} style={champStyle} placeholder="ex : 2" />
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <label style={labelStyle}>Date visée pour le dernier jour d'activité dans l'entreprise</label>
                      <input type="date" value={dateAboutir} onChange={e => setDateAboutir(e.target.value)} style={champStyle} />
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {(type === "monetisation" || type === "utilisationCourant" || type === "transfert") && (
            <div>
              <label style={labelStyle}>
                {type === "monetisation" && "Nombre de jours à monétiser"}
                {type === "utilisationCourant" && "Nombre de jours à utiliser (entre 5 et 20)"}
                {type === "transfert" && "Nombre de jours à transférer (courant → fin d'activité)"}
              </label>
              <input
                type="number" min={type === "utilisationCourant" ? 5 : 0} max={type === "utilisationCourant" ? 20 : undefined}
                step="1" value={jours} onChange={e => setJours(e.target.value)} style={champStyle}
                placeholder={type === "utilisationCourant" ? "ex : 12" : "ex : 2"}
              />
              {type === "utilisationCourant" && jours !== "" && (
                (() => {
                  const palier = PALIERS_UTIL_COURANT.find(p => Number(jours) >= p.min && Number(jours) <= p.max);
                  return palier
                    ? <div style={{ fontSize: 11.5, color: "#5b21b6", marginTop: 5, fontWeight: 600 }}>Délai de prévenance : {palier.delai}</div>
                    : <div style={{ fontSize: 11.5, color: "#991b1b", marginTop: 5, fontWeight: 600 }}>⚠️ Cet imprimé n'accepte qu'un nombre de jours entre 5 et 20</div>;
                })()
              )}
            </div>
          )}

          {type === "utilisationCourant" && (
            <div>
              <label style={labelStyle}>Demande d'absence au titre du CET — dates</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="date" value={dateDebutUtil} onChange={e => setDateDebutUtil(e.target.value)} style={champStyle} />
                <span style={{ color: "#94a3b8", fontSize: 12 }}>au</span>
                <input type="date" value={dateFinUtil} onChange={e => setDateFinUtil(e.target.value)} style={champStyle} />
              </div>
            </div>
          )}

          {type === "utilisationCourant" && (
            <div>
              <label style={labelStyle}>Demande complémentaire de jours d'absence</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setDemandeComplementaire(false)} style={{ ...pillStyle(!demandeComplementaire), flex: 1, textAlign: "center" }}>Non</button>
                <button onClick={() => setDemandeComplementaire(true)} style={{ ...pillStyle(demandeComplementaire), flex: 1, textAlign: "center" }}>Oui</button>
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 5 }}>
                Coche "oui" si cette demande doit être complétée par des jours d'absences non issus du CET — joins alors une demande réglementaire d'absence en complément.
              </div>
            </div>
          )}

          {err && <div style={{ fontSize: 13, fontWeight: 600, color: "#991b1b" }}>{err}</div>}

          <div style={{ fontSize: 12, color: "#5b21b6", background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "8px 10px", fontWeight: 600 }}>
            💡 Un message email prêt à copier t'attend juste en dessous — pense à l'envoyer avec ton PDF.
          </div>

          <button onClick={generer} disabled={busy} style={{ padding: "13px 0", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: busy ? "wait" : "pointer", background: "#5b21b6", color: "#fff", marginTop: 8 }}>
            {busy ? "Génération…" : "📄 Générer le PDF"}
          </button>

          <NoticeModeOperatoire texte={MODE_OPERATOIRE[type]} />
        </div>
      </div>

      <div ref={emailCardRef} style={{
        background: "#fff",
        border: messageSurligne ? "1.5px solid #5b21b6" : "1.5px solid #e2e8f0",
        borderRadius: 14, padding: 20,
        boxShadow: messageSurligne ? "0 0 0 4px #e9d5ff" : "none",
        transition: "box-shadow .3s, border-color .3s",
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>✉️ Message pour ton email</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
          À coller toi-même dans ton email au moment d'envoyer le PDF généré ci-dessus.
        </div>
        <textarea
          readOnly value={messageGenere} rows={9}
          style={{ width: "100%", padding: 12, border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13, fontFamily: "inherit", resize: "vertical", background: "#f8fafc", color: "#1e293b" }}
        />
        <button onClick={copierMessage} style={{ marginTop: 10, padding: "9px 16px", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer", background: messageCopie ? "#16a34a" : "#5b21b6", color: "#fff" }}>
          {messageCopie ? "✓ Copié !" : "Copier le message"}
        </button>
      </div>
    </div>
  );
}
