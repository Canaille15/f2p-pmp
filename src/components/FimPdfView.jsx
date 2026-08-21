import { useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import api from "../api/client";
import {
  MOIS_L, DETAIL_CONFIG, PLAFOND_32H_MIN, DEFAULT_COLORS, EQUIPES,
  computeDashboardConges, computeCompteurAvecDetail, computeDashboardVT,
  computeLedgerSolde, computeDashboardTC, computeFetesLignes,
  getJoursCodesAnnee, getPosteLabelFromCode,
} from "../App";
import { computeDashboardCet } from "./CetView";

// ─── Fiche Individuelle Mensuelle (FIM) — 21/08, demandé par Olivier ───────
// Résumé mensuel archivable/imprimable, inspiré de la vraie "Fiche
// Individuelle" SNCF mais reconstruit uniquement à partir des données déjà
// suivies dans l'appli (jamais une copie de la fiche officielle — aucune
// donnée de paie, aucun champ RH/statutaire non stocké ici, comme validé
// avec Olivier). Composant volontairement isolé du reste de l'appli pour ce
// qui est du STYLE (mêmes constantes locales que CetPdfsView/DemandeCongesView),
// mais réutilise directement les fonctions de calcul déjà exportées par
// App.jsx (computeDashboardConges, computeFetesLignes, DETAIL_CONFIG...)
// plutôt que de dupliquer une logique métier complexe qui dériverait sinon
// silencieusement au fil des évolutions futures de ces modules.

const A4_W = 595.28, A4_H = 841.89;
const NAVY = rgb(0.059, 0.298, 0.506);   // #0f4c81
const GRIS_TXT = rgb(0.2, 0.255, 0.333); // #334155
const GRIS_CLAIR = rgb(0.945, 0.961, 0.976); // #f1f5f9
const BORDURE = rgb(0.878, 0.906, 0.941); // #e0e7ee
const BLANC = rgb(1, 1, 1);

function pad2(n) { return String(n).padStart(2, "0"); }
function finDeMois(y, m) { return new Date(y, m + 1, 0).getDate(); } // m = 0-11
function dateStr(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
function moisPrecedent(y, m) { return m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }; }
function minToHM(min) {
  const neg = min < 0, abs = Math.abs(Math.round(min || 0));
  return `${neg ? "-" : ""}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
}
function fmtNb(n) { return (n === null || n === undefined) ? "—" : String(n); }
function fmtDateFr(iso) {
  if (!iso) return "";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}
// Hex ("#rrggbb") → rgb() pdf-lib, pour reprendre la palette de couleurs
// personnalisée de l'agent (21/08, demandé par Olivier — "dans l'utilisation
// tu peux reprendre le code couleur des agents pour un meilleur visuel").
function hexComponents(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function hexToRgb(hex) {
  const c = hexComponents(hex);
  return c ? rgb(c.r / 255, c.g / 255, c.b / 255) : null;
}
// Chip coloré (fond = couleur du code, texte noir ou blanc selon la
// luminosité) plutôt que du texte coloré sur fond blanc — corrige un vrai
// souci de lisibilité signalé par Olivier ("le jaune est illisible" — RU
// est jaune vif, illisible en simple texte sur blanc) et reste lisible pour
// N'IMPORTE QUELLE couleur, quelle que soit sa palette perso. Formule YIQ
// standard (perception de luminosité), seuil 0.6 = bascule noir/blanc.
function texteContrasté(hex) {
  const c = hexComponents(hex) || { r: 100, g: 116, b: 139 };
  const yiq = (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
  return yiq >= 150 ? rgb(0.12, 0.12, 0.14) : rgb(1, 1, 1);
}

// ─── Calcul complet des données du mois choisi ─────────────────────────────
function computeFimData(agent, agentProfiles, schedule, pausesData, monthIdx, year) {
  const agentId = agent.id;
  const finMois = dateStr(year, monthIdx, finDeMois(year, monthIdx));
  const { y: yPrec, m: mPrec } = moisPrecedent(year, monthIdx);
  const finMoisPrec = dateStr(yPrec, mPrec, finDeMois(yPrec, mPrec));
  const moisCleAnnee = `${year}-${pad2(monthIdx + 1)}`;
  // Référence "mois clôturé" pour les Fêtes uniquement (21/08, Olivier :
  // "les agents le feront apres le 31 mars... il faut que seul la fete 1
  // apparaissent, celle du dernier trimestre 2025 sont soit prises soit
  // payer") — le rapport d'un mois n'a de sens qu'une fois ce mois terminé,
  // donc la comparaison "délai dépassé" (today > limiteDate) doit être faite
  // avec le LENDEMAIN de la fin du mois choisi, pas le dernier jour lui-même :
  // sinon une fête dont la limite tombe pile le dernier jour du mois (cas
  // F8/F9/F0, limite 31/03 pour un rapport de mars) reste vue "en attente"
  // au lieu de "payée automatiquement". N'affecte QUE ce paramètre —
  // finMois/finMoisPrec restent inchangés pour tous les autres calculs
  // (Congés/RP/RU/RQ/RN/TY/TQ/TC/Maladie), où "<=finMois" est déjà correct.
  const { y: ySuiv, m: mSuiv } = monthIdx === 11 ? { y: year + 1, m: 0 } : { y: year, m: monthIdx + 1 };
  const finMoisCloture = dateStr(ySuiv, mSuiv, 1);

  // ── Congés : 3 colonnes (année-1 / année / année+1), même structure que
  // la fiche source. Seule la colonne "année" (celle du mois choisi) reçoit
  // un vrai découpage mensuel (solde M-1/pris de M/solde M par date réelle) ;
  // les 2 autres années affichent leur bilan final statique (le mois choisi
  // ne leur appartient pas physiquement).
  const congesParAnnee = [year - 1, year, year + 1].map(y => {
    const d = computeDashboardConges(agent, schedule, agentProfiles, y);
    if (y === year) {
      const avant = d.tousJours.filter(x => x <= finMoisPrec).length;
      const fin = d.tousJours.filter(x => x <= finMois).length;
      return { annee: y, entitlement: d.entitlement, soldeMMoins1: d.entitlement - avant, prisDuMois: fin - avant, soldeM: d.entitlement - fin, statique: false };
    }
    return { annee: y, entitlement: d.entitlement, soldeMMoins1: d.solde, prisDuMois: 0, soldeM: d.solde, statique: true };
  });

  // ── Tableau 3 années (année-1/année/année+1), réutilisable pour RP/RQ/RU
  // (21/08, Olivier, en confirmant vouloir "comme Congés" pour ces 3
  // compteurs) — même principe exact que congesParAnnee ci-dessus : seule la
  // colonne "année" reçoit un vrai découpage mensuel (solde début/pris/solde
  // fin, par date réelle), les 2 autres années affichent un solde statique.
  // "année-1" : si tout est déjà pris, solde=0 (comme dans l'exemple fourni
  // par Olivier) ; s'il reste des jours, ils restent affichés tels quels --
  // déjà garanti par computeCompteurAvecDetail (solde=acquis-total, et un
  // report vers année+1 est déjà déduit de son propre calcul via reportKey,
  // aucune logique de déduction supplémentaire à écrire ici). "année+1" :
  // toujours "--" (jamais calculé), les droits n'y sont pas encore ouverts --
  // "tu mets juste les cases comme dans la fiche. les droits ne sont pas
  // ouvert."
  // cumul (21/08, Olivier : "le cal cul de rp est faux [...] tu as fais 2
  // calcul de rp . 1 jouste, 1 faux" -- le tableau 3 années de RP affichait
  // un SOLDE (acquis-cumul) alors qu'un autre tableau juste au-dessus
  // affichait déjà, correctement, le CUMUL -- 2 chiffres différents pour la
  // même donnée). Pour l'année en cours, la colonne "année" affiche
  // désormais RAW avant/fin (cumul, pas de soustraction de l'acquis) quand
  // cumul=true (RP uniquement) -- RQ/RU restent en solde (cumul=false),
  // conforme à la vraie fiche SNCF où seul RP est cumulatif. année-1/année+1
  // gardent leur valeur déjà correcte (solde=0 si tout pris, sinon le reste)
  // quel que soit le mode -- seul son LIBELLÉ change ("Cumul M-1"/"Cumul M"
  // plutôt que "Solde début/fin de mois") pour rester cohérent avec la
  // colonne "année" du même tableau.
  const buildAnneeTable = (conf, cumul) => [year - 1, year, year + 1].map(y => {
    if (y === year + 1) return { annee: y, entitlement: null, soldeMMoins1: null, prisDuMois: null, soldeM: null, statique: true, futur: true };
    const d = computeCompteurAvecDetail(agent, schedule, agentProfiles, y, conf.codes, conf.reportKey, conf.acquisKey, conf.rollingAcquis);
    if (y === year) {
      const avant = d.tousJours.filter(x => x <= finMoisPrec).length;
      const fin = d.tousJours.filter(x => x <= finMois).length;
      const debut = cumul ? avant : (d.acquis !== null ? d.acquis - avant : null);
      const finVal = cumul ? fin : (d.acquis !== null ? d.acquis - fin : null);
      return { annee: y, entitlement: d.acquis, soldeMMoins1: debut, prisDuMois: fin - avant, soldeM: finVal, statique: false };
    }
    return { annee: y, entitlement: d.acquis, soldeMMoins1: d.solde, prisDuMois: 0, soldeM: d.solde, statique: true };
  });

  // ── Repos : RP (+ RPP), avec sous-décompte "isolé" (ni la veille ni le
  // lendemain n'est aussi un RP/RPP) — calculé depuis le planning perso,
  // aucune règle SNCF externe (RD/RPSD/WE volontairement abandonnées).
  const rpConf = DETAIL_CONFIG.RP;
  const rpData = computeCompteurAvecDetail(agent, schedule, agentProfiles, year, rpConf.codes, rpConf.reportKey, rpConf.acquisKey, rpConf.rollingAcquis);
  const rpAvant = rpData.tousJours.filter(x => x <= finMoisPrec).length;
  const rpFin = rpData.tousJours.filter(x => x <= finMois).length;
  const estRPouRPP = (d) => {
    const v = schedule[`${agentId}-${d}`];
    return v?.equipe === "RP" || v?.equipe === "RPP" || v?.equipe2 === "RP" || v?.equipe2 === "RPP";
  };
  const decale = (d, delta) => { const dt = new Date(d + "T12:00:00"); dt.setDate(dt.getDate() + delta); return dt.toISOString().slice(0, 10); };
  const isoles = rpData.tousJours.filter(d => !estRPouRPP(decale(d, -1)) && !estRPouRPP(decale(d, 1)));
  const isolesMois = isoles.filter(d => d.slice(0, 7) === moisCleAnnee).length;
  // "cumul annuel" = cumulé depuis janvier JUSQU'AU mois choisi, jamais toute
  // l'année (21/08, Olivier : "si je demande mars je veux les infos de mars
  // pas celle d'aout" — un rapport de mars ne doit jamais compter des RP
  // isolés d'avril à décembre, qui n'existaient pas encore à cette date).
  const isolesCumul = isoles.filter(d => d <= finMois).length;

  // ── Repos : VT (temps partiel) — vide/absent si l'agent n'en a pas.
  const vtData = computeDashboardVT(agent, schedule, agentProfiles, year);
  const vtAvant = vtData.tousJours.filter(x => x <= finMoisPrec).length;
  const vtFin = vtData.tousJours.filter(x => x <= finMois).length;
  const aDuVT = (vtData.entitlement || 0) > 0 || vtData.tousJours.length > 0;

  // ── Repos : RU
  const ruConf = DETAIL_CONFIG.RU;
  const ruData = computeCompteurAvecDetail(agent, schedule, agentProfiles, year, ruConf.codes, ruConf.reportKey, ruConf.acquisKey, ruConf.rollingAcquis);
  const ruAvant = ruData.tousJours.filter(x => x <= finMoisPrec).length;
  const ruFin = ruData.tousJours.filter(x => x <= finMois).length;

  // ── Temps acquis : RQ (solde en jours, acquis roulant d'année en année)
  const rqConf = DETAIL_CONFIG.RQ;
  const rqData = computeCompteurAvecDetail(agent, schedule, agentProfiles, year, rqConf.codes, rqConf.reportKey, rqConf.acquisKey, rqConf.rollingAcquis);
  const rqAvant = rqData.tousJours.filter(x => x <= finMoisPrec).length;
  const rqFin = rqData.tousJours.filter(x => x <= finMois).length;

  // ── Temps acquis : RN / TY / TQ (soldes continus en heures/minutes, jamais
  // remis à zéro par année — le solde "à la fin du mois choisi" est
  // reconstitué via le nouveau paramètre cutoffDate de computeLedgerSolde).
  const ledgerReport = (key, plafond) => {
    const avant = computeLedgerSolde(agentProfiles, agentId, key, plafond, finMoisPrec);
    const fin = computeLedgerSolde(agentProfiles, agentId, key, plafond, finMois);
    const mvtsDuMois = (agentProfiles?.[agentId]?.[key] || []).filter(e => (e.saisiLe || "") > finMoisPrec && (e.saisiLe || "") <= finMois);
    const acquisDuMois = mvtsDuMois.filter(e => (e.deltaMinutes || 0) > 0).reduce((s, e) => s + e.deltaMinutes, 0);
    const prisDuMois = mvtsDuMois.filter(e => (e.deltaMinutes || 0) < 0).reduce((s, e) => s - e.deltaMinutes, 0);
    return { soldeMMoins1: avant.solde, acquisDuMois, prisDuMois, soldeM: fin.solde };
  };
  const rnReport = ledgerReport("rnLedger", null);
  const tyReport = ledgerReport("tyLedger", PLAFOND_32H_MIN);
  const tqReport = ledgerReport("tqLedger", null);

  // ── Temps acquis : TC (pause figée + ajustements manuels, plafonné 32h00).
  // acquisDuMois/prisDuMois dérivés directement de l'écart de solde (plutôt
  // que re-filtrer séparément ledger+pauses par date, comme pour RN/TY/TQ) :
  // TC mélange 2 sources datées différemment (ajustements manuels ET pauses
  // validées) — dériver de l'écart garantit que la ligne imprimée reste
  // toujours arithmétiquement cohérente (début + acquis − pris = fin).
  const tcAvant = computeDashboardTC(agent, schedule, agentProfiles, pausesData, year, finMoisPrec);
  const tcFin = computeDashboardTC(agent, schedule, agentProfiles, pausesData, year, finMois);
  const pausesDuMois = (tcFin.parMoisTC?.[moisCleAnnee] || []).length;
  const ecartTC = tcFin.solde - tcAvant.solde;
  const tcReport = { soldeMMoins1: tcAvant.solde, acquisDuMois: Math.max(0, ecartTC), prisDuMois: Math.max(0, -ecartTC), soldeM: tcFin.solde, pausesDuMois };

  // ── Fêtes à récupérer (statut "en attente" — acquise, pas encore traitée,
  // ni payée, ni payée par anticipation) — recalculé TEL QU'IL AURAIT ÉTÉ
  // à la fin du mois choisi (asOfDate=finMois), pas l'état d'aujourd'hui
  // (21/08, Olivier : "tu as mis des fetes restante actuelle comme si
  // j'etais en aout mais je veux les chiffres de mars").
  const { lignes, fetesReportN1 } = computeFetesLignes(agent, schedule, agentProfiles, year, finMoisCloture);
  const toutesFetes = monthIdx < 3 ? [...lignes, ...fetesReportN1] : lignes;
  const fetesATraiter = toutesFetes.filter(f => f.statut === "attente");

  // ── Maladie — "cumul annuel" = depuis janvier JUSQU'AU mois choisi (même
  // principe que RP isolés ci-dessus, jamais toute l'année civile).
  const maladieAnneeComplete = getJoursCodesAnnee(agent, schedule, year, ["MA"]);
  const maladieCumul = maladieAnneeComplete.filter(d => d <= finMois).length;
  const maladieMois = maladieAnneeComplete.filter(d => d.slice(0, 7) === moisCleAnnee).length;

  // ── CET (résumé, état actuel — pas de découpage mensuel, solde cumulatif
  // par nature depuis l'origine du module)
  const cet = computeDashboardCet(agentProfiles, agentId, year);

  // ── Planning du mois (jour par jour) — un "segment" par code (equipe +
  // equipe2, ex. RP + Nuit), chacun avec sa PROPRE couleur (21/08, Olivier :
  // "le rp + nuit faut seperer le couleur") plutôt qu'une seule couleur pour
  // toute la ligne. Couleur reprise de la palette personnalisée de l'agent
  // (agentColors, même source que le calendrier "Mon planning"), avec repli
  // sur la palette par défaut du code. Même logique que getPlanningRappel
  // (App.jsx) pour le libellé + poste attaché, mais gardée séparée ici (pas
  // fusionnée en une seule chaîne) pour permettre le rendu en 2 badges.
  const agentColors = agentProfiles?.[agentId]?.agentColors || {};
  const EQ_LOOKUP = Object.fromEntries(EQUIPES.map(e => [e.code, e]));
  const OMIS_POSTE = ["M", "AM", "N", "J", "RP", "RU", "RQ", "CA", "CP", "MA", "VT", "ABS", "FOR", "DISPO", "NU", "TC", "TY", "RN", "JF"];
  const nbJours = finDeMois(year, monthIdx);
  const DOW = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const joursMois = [];
  for (let j = 1; j <= nbJours; j++) {
    const d = dateStr(year, monthIdx, j);
    const v = schedule[`${agentId}-${d}`];
    const dow = new Date(d + "T12:00:00").getDay();
    const segments = [];
    [v?.equipe, v?.equipe2].forEach(code => {
      if (!code) return;
      const label = EQ_LOOKUP[code]?.label || code;
      const poste = v.jsCode && !OMIS_POSTE.includes(v.jsCode) ? (getPosteLabelFromCode(v.jsCode) || v.jsCode) : null;
      const texte = poste ? `${label} · ${poste}` : label;
      if (segments.some(s => s.texte === texte)) return; // évite le doublon (equipe===equipe2)
      segments.push({ texte, couleur: agentColors[code] || DEFAULT_COLORS[code] || "#64748b" });
    });
    joursMois.push({ date: d, jour: j, dowLabel: DOW[dow], segments });
  }

  return {
    finMois, finMoisPrec, congesParAnnee,
    rp: { acquis: rpData.acquis, avant: rpAvant, duMois: rpFin - rpAvant, fin: rpFin, isolesMois, isolesAnnee: isolesCumul, parAnnee: buildAnneeTable(rpConf, true) },
    vt: { aDuVT, acquis: vtData.entitlement, avant: vtAvant, duMois: vtFin - vtAvant, fin: vtFin },
    ru: { acquis: ruData.acquis, avant: ruAvant, duMois: ruFin - ruAvant, fin: ruFin, parAnnee: buildAnneeTable(ruConf, true) },
    rq: { acquis: rqData.acquis, avant: rqAvant, duMois: rqFin - rqAvant, fin: rqFin, parAnnee: buildAnneeTable(rqConf, false) },
    rn: rnReport, ty: tyReport, tq: tqReport, tc: tcReport,
    fetesATraiter, maladie: { mois: maladieMois, annee: maladieCumul },
    cet, joursMois,
  };
}

// ─── Génération du PDF (pdf-lib, document construit de zéro — pas un
// formulaire officiel à remplir, un vrai rapport multi-sections) ──────────
async function genererPdfFim(agent, agentProfiles, data, monthIdx, year, famille, affectation) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const marge = 36;
  let page = doc.addPage([A4_W, A4_H]);
  let y = A4_H - marge;

  const newPageIfNeeded = (hauteurNecessaire) => {
    if (y - hauteurNecessaire < marge) {
      page = doc.addPage([A4_W, A4_H]);
      y = A4_H - marge;
    }
  };

  // Découpe un texte en lignes qui tiennent dans maxWidth (21/08 — le pied de
  // page disclaimer dépassait la largeur de page et était silencieusement
  // tronqué, pdf-lib ne retourne jamais à la ligne automatiquement).
  const wrapText = (text, maxWidth, fontObj, size) => {
    const mots = text.split(" ");
    const lignes = [];
    let courante = "";
    mots.forEach(mot => {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (fontObj.widthOfTextAtSize(essai, size) > maxWidth && courante) {
        lignes.push(courante);
        courante = mot;
      } else {
        courante = essai;
      }
    });
    if (courante) lignes.push(courante);
    return lignes;
  };

  const txt = (s, x, yy, opts = {}) => {
    page.drawText(String(s ?? ""), { x, y: yy, size: opts.size || 9, font: opts.bold ? bold : font, color: opts.color || GRIS_TXT });
  };
  const ligneH = (x1, x2, yy, color = BORDURE, thickness = 0.75) => {
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color });
  };
  const rect = (x, yy, w, h, color) => {
    page.drawRectangle({ x, y: yy, width: w, height: h, color });
  };
  // Badge coloré (fond plein + texte contrasté) pour un segment de planning
  // (21/08 — "le rp + nuit faut seperer le couleur et le jaune est
  // illisible") : chaque code a son propre badge, jamais du simple texte
  // coloré sur fond blanc (illisible pour une couleur claire comme le jaune
  // de RU, quelle que soit la palette perso de l'agent). Retourne le x de
  // fin, pour enchaîner plusieurs badges sur la même ligne.
  const drawBadge = (texte, x, yy, hex, size = 7) => {
    const pad = 3.5;
    const w = font.widthOfTextAtSize(texte, size) + pad * 2;
    const h = size + 4.5;
    page.drawRectangle({ x, y: yy - 2.5, width: w, height: h, color: hexToRgb(hex) || rgb(0.4, 0.44, 0.5) });
    txt(texte, x + pad, yy, { size, color: texteContrasté(hex) });
    return x + w;
  };

  // ── En-tête ──
  rect(0, y - 44, A4_W, 54, NAVY);
  txt("FICHE INDIVIDUELLE MENSUELLE", marge, y - 20, { size: 15, bold: true, color: BLANC });
  const moisLabel = `${MOIS_L[monthIdx]} ${year}`;
  txt(moisLabel, A4_W - marge - font.widthOfTextAtSize(moisLabel, 12), y - 20, { size: 12, bold: true, color: BLANC });
  txt(`${agent.prenom || ""} ${agent.nom || ""}`.trim().toUpperCase(), marge, y - 36, { size: 10, color: rgb(0.85, 0.9, 0.97) });
  y -= 62;

  const champInfo = (label, valeur, x, w) => {
    txt(label, x, y, { size: 7.5, color: rgb(0.42, 0.47, 0.55) });
    txt(valeur || "—", x, y - 11, { size: 9.5, bold: true });
  };
  const infoW = (A4_W - marge * 2) / 3;
  champInfo("CP (immat.)", agent.cp || agent.id, marge, infoW);
  champInfo("Établissement", "EIC PARIS RIVE GAUCHE", marge + infoW, infoW);
  champInfo("UO", "Paris Versailles", marge + infoW * 2, infoW);
  y -= 26;
  champInfo("Affectation", affectation, marge, infoW);
  champInfo("Équipe", famille, marge + infoW, infoW);
  champInfo("Généré le", new Date().toLocaleDateString("fr-FR"), marge + infoW * 2, infoW);
  y -= 22;
  ligneH(marge, A4_W - marge, y, GRIS_TXT, 1.2);
  y -= 16;

  // ── Titre de section générique ──
  const titreSection = (label, hauteur = 16) => {
    newPageIfNeeded(hauteur + 40);
    rect(marge, y - hauteur + 3, A4_W - marge * 2, hauteur, GRIS_CLAIR);
    txt(label, marge + 6, y - hauteur + 7, { size: 9.5, bold: true, color: NAVY });
    y -= hauteur + 6;
  };

  // ── Table générique : en-têtes de colonnes + lignes de valeurs ──
  const table = (headers, rows, colWidths) => {
    const totalW = A4_W - marge * 2;
    const w = colWidths || [totalW * 0.34, ...Array(headers.length - 1).fill(totalW * 0.66 / (headers.length - 1))];
    newPageIfNeeded(18 * (rows.length + 1) + 10);
    let x = marge;
    // en-têtes
    headers.forEach((h, i) => { txt(h, x + 4, y - 10, { size: 8, bold: true, color: rgb(0.42, 0.47, 0.55) }); x += w[i]; });
    y -= 15;
    ligneH(marge, marge + totalW, y);
    y -= 3;
    rows.forEach((r, ri) => {
      if (ri % 2 === 1) rect(marge, y - 13, totalW, 15, rgb(0.98, 0.985, 0.99));
      let xx = marge;
      r.forEach((cell, i) => {
        txt(cell, xx + 4, y - 10, { size: 8.7, bold: i === 0 });
        xx += w[i];
      });
      y -= 15;
    });
    ligneH(marge, marge + totalW, y + 2);
    y -= 10;
  };

  // ── Congés ──
  titreSection("CONGÉS");
  table(
    ["", ...data.congesParAnnee.map(c => `${c.annee}${c.statique ? "" : " (mois en cours)"}`)],
    [
      ["Droit annuel", ...data.congesParAnnee.map(c => fmtNb(c.entitlement))],
      ["Solde début de mois", ...data.congesParAnnee.map(c => fmtNb(c.soldeMMoins1))],
      ["Pris ce mois", ...data.congesParAnnee.map(c => c.statique ? "—" : fmtNb(c.prisDuMois))],
      ["Solde fin de mois", ...data.congesParAnnee.map(c => fmtNb(c.soldeM))],
    ]
  );

  // ── Repos — VT en CUMUL (Cumul M-1 / pris de M / Cumul M), exactement comme
  // le tableau "Repos" de la vraie fiche SNCF source. RP n'est PLUS ici
  // (21/08, Olivier : "tu as fais 2 calcul de rp . 1 jouste, 1 faux" -- RP
  // était affiché ICI en cumul (correct) ET dans son propre tableau 3 années
  // juste en dessous en solde (faux) : 2 chiffres différents pour la même
  // donnée. RP vit désormais UNIQUEMENT dans son tableau 3 années, qui
  // affiche maintenant lui aussi le cumul -- un seul calcul, un seul
  // affichage). RU reste en SOLDE (son propre tableau 3 années, solde
  // labels) : sur la vraie fiche, RU n'est pas dans ce tableau "Repos"
  // cumulatif, il apparaît à part en solde M-1/acquis/pris/solde M.
  titreSection("REPOS");
  table(
    ["", "Cumul M-1", "Pris ce mois", "Cumul M"],
    [
      [`Temps partiel VT${data.vt.aDuVT ? ` (${fmtNb(data.vt.acquis)})` : ""}`, data.vt.aDuVT ? fmtNb(data.vt.avant) : "—", data.vt.aDuVT ? fmtNb(data.vt.duMois) : "—", data.vt.aDuVT ? fmtNb(data.vt.fin) : "—"],
    ],
    [(A4_W - marge * 2) * 0.42, (A4_W - marge * 2) * 0.193, (A4_W - marge * 2) * 0.193, (A4_W - marge * 2) * 0.194]
  );

  // ── Tableaux 3 années (RP/RQ/RU), même structure que CONGÉS ci-dessus
  // (21/08, Olivier, en confirmant : "oui comme Congés") — année-1 : solde
  // statique (0 si tout pris, le reste sinon, déjà report-aware via
  // computeCompteurAvecDetail) ; année+1 : toujours "--", droits pas ouverts.
  // rowLabels varie : RP en Cumul (M-1/M), RQ/RU en Solde (début/fin de mois)
  // -- un seul jeu de libellés cohérent avec les valeurs réellement affichées
  // dans la colonne "année" de CE tableau (21/08, même correctif que ci-dessus).
  const anneeTable = (label, parAnnee, rowLabels = ["Solde début de mois", "Solde fin de mois"]) => table(
    ["", ...parAnnee.map(c => `${c.annee}${c.statique ? "" : " (mois en cours)"}`)],
    [
      [label, ...parAnnee.map(c => fmtNb(c.entitlement))],
      [rowLabels[0], ...parAnnee.map(c => fmtNb(c.soldeMMoins1))],
      ["Pris ce mois", ...parAnnee.map(c => (c.statique ? "—" : fmtNb(c.prisDuMois)))],
      [rowLabels[1], ...parAnnee.map(c => fmtNb(c.soldeM))],
    ]
  );
  anneeTable(`Repos périodiques RP (${fmtNb(data.rp.acquis)})`, data.rp.parAnnee, ["Cumul M-1", "Cumul M"]);
  txt(`RP isolés (ni veille ni lendemain en RP/RPP) — ce mois : ${data.rp.isolesMois}  ·  cumul annuel : ${data.rp.isolesAnnee}`, marge, y, { size: 8.3, color: rgb(0.42, 0.47, 0.55) });
  y -= 18;
  // RU en Cumul aussi (21/08, Olivier, sur son vrai compte : "fin juillet
  // j'avais pris 9 ru, pris 2 en aout . soit un total de 11 sur les 17
  // acquis en debut annee" -- des chiffres cumulatifs, 9+2=11, comme pour
  // RP -- même correctif, même raison).
  anneeTable(`Repos suppl. RU (${fmtNb(data.ru.acquis)})`, data.ru.parAnnee, ["Cumul M-1", "Cumul M"]);

  // ── Temps acquis ──
  titreSection("TEMPS ACQUIS");
  anneeTable(`Temps RQ, en jours (${fmtNb(data.rq.acquis)})`, data.rq.parAnnee);
  const hmRow = (label, r) => [label, minToHM(r.soldeMMoins1), minToHM(r.acquisDuMois), minToHM(r.prisDuMois), minToHM(r.soldeM)];
  table(
    ["", "Solde début de mois", "Acquis ce mois", "Pris ce mois", "Solde fin de mois"],
    [
      hmRow("Repos compensateur de nuit RN", data.rn),
      hmRow("Temps à compenser semestres précédents TY", data.ty),
      hmRow("Temps à compenser semestre en cours TQ", data.tq),
      hmRow("Temps à compenser mois précédents TC", data.tc),
    ],
    [(A4_W - marge * 2) * 0.42, (A4_W - marge * 2) * 0.145, (A4_W - marge * 2) * 0.145, (A4_W - marge * 2) * 0.145, (A4_W - marge * 2) * 0.145]
  );
  txt(`TY plafonné à ${minToHM(PLAFOND_32H_MIN)} (au-delà, à payer automatiquement) · Pauses figées validées ce mois : ${data.tc.pausesDuMois}`, marge, y, { size: 8.3, color: rgb(0.42, 0.47, 0.55) });
  y -= 18;

  // ── Fêtes à récupérer ──
  titreSection("FÉRIÉS À RÉCUPÉRER (en attente)");
  if (data.fetesATraiter.length === 0) {
    txt("Aucun férié en attente de traitement.", marge, y, { size: 8.7, color: rgb(0.42, 0.47, 0.55) });
    y -= 16;
  } else {
    data.fetesATraiter.forEach(f => {
      txt(`•  ${f.code} — ${f.label}  (${fmtDateFr(f.dateFete)})`, marge, y, { size: 8.7 });
      y -= 13;
    });
    y -= 4;
  }

  // ── Résumé CET (21/08, séparé de Maladie sur demande d'Olivier) ──
  titreSection("RÉSUMÉ — CET");
  const cetCourant = data.cet.comptes?.find(c => c.key === "courant");
  const cetFinActivite = data.cet.comptes?.find(c => c.key === "finActivite");
  table(
    ["", "Solde actuel"],
    [
      ["CET — Compte courant", fmtNb(cetCourant?.solde ?? 0) + " j"],
      ["CET — Compte fin d'activité", fmtNb(cetFinActivite?.solde ?? 0) + " j"],
    ],
    [(A4_W - marge * 2) * 0.7, (A4_W - marge * 2) * 0.3]
  );

  // ── Résumé Maladie ──
  titreSection("RÉSUMÉ — MALADIE");
  table(
    ["", "Jours"],
    [
      ["Jours de maladie ce mois", fmtNb(data.maladie.mois)],
      ["Cumul annuel", fmtNb(data.maladie.annee)],
    ],
    [(A4_W - marge * 2) * 0.7, (A4_W - marge * 2) * 0.3]
  );

  // ── Page(s) suivante(s) : Planning du mois ──
  page = doc.addPage([A4_W, A4_H]);
  y = A4_H - marge;
  rect(0, y - 30, A4_W, 40, NAVY);
  txt(`PLANNING DU MOIS — ${moisLabel}`, marge, y - 16, { size: 12.5, bold: true, color: BLANC });
  y -= 48;

  const colW = (A4_W - marge * 2 - 20) / 2;
  const rowsParColonne = Math.ceil(data.joursMois.length / 2);
  const yDepart = y;
  data.joursMois.forEach((j, i) => {
    const col = Math.floor(i / rowsParColonne);
    const row = i % rowsParColonne;
    const x = marge + col * (colW + 20);
    const yy = yDepart - row * 15;
    if (row === 0 && col === 0) newPageIfNeeded(rowsParColonne * 15 + 20);
    txt(`${pad2(j.jour)} ${j.dowLabel}`, x, yy, { size: 8.2, bold: true });
    if (j.segments.length === 0) {
      txt("—", x + 56, yy, { size: 8.2, color: rgb(0.6, 0.65, 0.7) });
    } else {
      let bx = x + 56;
      j.segments.forEach(seg => { bx = drawBadge(seg.texte, bx, yy, seg.couleur) + 4; });
    }
  });

  // ── Note de bas de page, en pied de la toute dernière page (21/08 : placée
  // auparavant juste après les tableaux de résumé, ce qui créait parfois une
  // page quasi vide à elle seule quand ces tableaux finissaient tout en bas
  // d'une page déjà pleine — un pied de page de document se met en fin de
  // document, pas au milieu d'un flux de contenu). ──
  const disclaimerLignes = wrapText(
    "Document généré depuis F2P.PMP à partir des données saisies dans l'application — ne remplace pas la fiche officielle SNCF. Tous les soldes (dont le statut des fériés) sont reconstitués tels qu'ils auraient été à la fin du mois consulté. Seuls les droits annuels (RP/RU/VT/Congés/RQ) et le solde CET reflètent leur valeur actuelle, faute d'historique de leurs modifications — vérifier qu'ils étaient bien identiques à cette période si le mois consulté est ancien.",
    A4_W - marge * 2, font, 6.8
  );
  disclaimerLignes.forEach((ligne, i) => {
    txt(ligne, marge, marge - 4 + (disclaimerLignes.length - i) * 9, { size: 6.8, color: rgb(0.55, 0.6, 0.66) });
  });

  return doc.save();
}


export default function FimPdfView({ currentAgent, agentProfiles, schedule }) {
  const today = new Date();
  const [monthIdx, setMonthIdx] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  const agent = currentAgent;
  const agentId = agent?.id;
  const profil = agentProfiles?.[agentId] || {};
  const famille = agent?.famille === "PAR" ? "PAR" : "PRCI";
  const affectation = profil.isReserve ? "Réserve régionale" : "Roulement";

  const anneeCourante = today.getFullYear();
  const anneesDisponibles = [anneeCourante - 3, anneeCourante - 2, anneeCourante - 1, anneeCourante, anneeCourante + 1];

  const champStyle = { width: "100%", padding: "9px 11px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13.5, outline: "none", boxSizing: "border-box", background: "#fff" };
  const labelStyle = { fontSize: 11.5, fontWeight: 700, color: "#64748b", marginBottom: 5, display: "block" };

  const generer = async () => {
    if (!agent) return;
    setBusy(true); setErr(""); setOk(false);
    try {
      const pausesData = await api.pauses.getAll(agentId).catch(() => []);
      const data = computeFimData(agent, agentProfiles, schedule || {}, pausesData, monthIdx, year);
      const bytes = await genererPdfFim(agent, agentProfiles, data, monthIdx, year, famille, affectation);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const nom = `${(agent.nom || "AGENT").toUpperCase()}_FIM_${MOIS_L[monthIdx]}_${year}.pdf`;
      const a = document.createElement("a");
      a.href = url; a.download = nom;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setOk(true);
      setTimeout(() => setOk(false), 3000);
    } catch (e) {
      console.error(e);
      setErr("Erreur lors de la génération du PDF. Réessaie, ou signale le problème si ça persiste.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="#b45309"><path d="M4 3a1 1 0 0 1 1-1h5.586a1 1 0 0 1 .707.293l3.414 3.414a1 1 0 0 1 .293.707V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3Z" /><path fill="#fff" d="M11 2.5V6a1 1 0 0 0 1 1h3.5L11 2.5Z" /></svg>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: "#1e293b" }}>Fiche Individuelle Mensuelle</h2>
      </div>
      <p style={{ fontSize: 12.5, color: "#64748b", marginTop: 0, marginBottom: 18, lineHeight: 1.5 }}>
        Résumé mensuel archivable/imprimable : congés, repos, temps acquis, fériés, CET, maladie et planning du mois — reconstitué depuis les données de l'appli. Choisis n'importe quel mois, même passé.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Mois</label>
          <select value={monthIdx} onChange={e => setMonthIdx(Number(e.target.value))} style={champStyle}>
            {MOIS_L.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div style={{ width: 120 }}>
          <label style={labelStyle}>Année</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={champStyle}>
            {anneesDisponibles.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {err && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, marginBottom: 14 }}>{err}</div>}
      {ok && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, marginBottom: 14 }}>✅ PDF généré et téléchargé.</div>}

      <button onClick={generer} disabled={busy || !agent} style={{
        width: "100%", padding: "12px", background: busy ? "#94a3b8" : "#0f4c81", color: "#fff",
        border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer",
      }}>
        {busy ? "⏳ Génération..." : `📄 Générer le PDF — ${MOIS_L[monthIdx]} ${year}`}
      </button>

      <div style={{ marginTop: 18, fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>
        Ce document n'est pas une fiche officielle SNCF — il ne contient ni élément de paie, ni classification RH/statutaire (ces informations ne sont pas suivies dans l'appli). Il reflète l'état des compteurs tels que saisis dans F2P.PMP.
      </div>
    </div>
  );
}
