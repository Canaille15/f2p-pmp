import { useState, useMemo, useEffect, useRef } from "react";
import api from "../api/client";

// ─── CET (Compte Épargne Temps) ─────────────────────────────────────────────
// Module volontairement isolé du reste de l'appli (même principe que
// DemandeCongesView.jsx) : toute la logique métier CET (constantes, calcul
// des soldes, notice réglementaire) vit dans ce fichier, pas dans App.jsx.
// App.jsx se contente d'importer computeDashboardCet + CetDashboardModal et
// d'afficher une carte cliquable, comme pour n'importe quel autre compteur.
//
// Phase 1 (06/08) : structure + notice + soldes à 0, aucun lien avec les
// autres compteurs.
// Phase 2 (06/08) : épargne RQ/RN/TC/TY/Médaille, cycle Demandé→Accordé/
// Refusé (même principe que Congés/VT), abondement automatique du 1er jour
// de l'année, déduction du compteur source à l'accord — RQ recalculé à la
// volée (voir getCetTransfereJours, consommé par App.jsx), RN/TC/TY via une
// écriture négative dans leur ledger existant (rnLedger/tcLedger/tyLedger).
// Phase 2bis (06/08) : ajustement manuel du solde par sous-compte (type
// "ajustement") — pour déclarer les jours déjà acquis avant ce module
// (quasiment tous les agents en ont déjà), effectif immédiatement, sans
// cycle demande/accord ni lien avec un compteur source (même principe que
// le "+ Ajuster le solde" déjà utilisé pour TC/RN/TY) — exclu du cap
// d'épargne annuel et de l'abondement (voir accorderDemande/ajusterSolde).
// Phase 3 (06/08) : Monétisation (type "monetisation", débit, sans effet
// planning) et Utilisation en temps (type "utilisation", débit, période
// Du/Au) — à l'accord d'une utilisation, écrit le code "CET" dans le
// planning perso pour chaque jour de la période (voir EQUIPES dans
// App.jsx), avec le même garde-fou d'écrasement que VT/TC (bloque si un
// jour de la période contient déjà autre chose).

// Constantes réglementaires — jamais en dur dans la logique de calcul, pour
// pouvoir les ajuster sans toucher au reste du fichier.
export const PLAFOND_COURANT = 20;
export const PLAFOND_FIN_ACTIVITE = 250;
export const CAP_EPARGNE_AN = 10; // jours/an, hors abondement, tous sous-comptes confondus

// 10/08 (Olivier, sur mobile) : les sections du panneau CET n'étaient
// séparées que par un simple filet gris (borderTop) ou pas du tout —
// "il faut bien séparer les section, ca manque aussi de contraste". Chaque
// grande section (Nouvelle épargne, Demandées, Épargnées...) est désormais
// une vraie carte (fond + bordure + coins arrondis), plus lisible qu'un
// simple flux de texte empilé sur un fond blanc uniforme.
const SECTION_CARD = { background: "#fbfaff", border: "1.5px solid #ede9fe", borderRadius: 12, padding: "12px 14px" };

export const SOUS_COMPTES = [
  { key: "courant", label: "Compte courant", icone: "💼", plafond: PLAFOND_COURANT },
  { key: "finActivite", label: "Compte fin d'activité", icone: "🏁", plafond: PLAFOND_FIN_ACTIVITE },
];

// Sources d'épargne éligibles (confirmées par Olivier le 06/08) — RS et RG
// exclus (aucun compteur correspondant dans l'appli). "Médaille" est une
// source propre au module CET, sans compteur dédié ailleurs dans l'appli.
// Congés (Phase 4) : même principe que RQ (déjà en jours, aucune valeur h/min
// à saisir) — la déduction se fait sur le "Restant" de CongesDashboardModal,
// jamais dans le planning perso (voir getCetTransfereJours dans App.jsx).
export const SOURCES_EPARGNE = [
  { code: "CA", label: "Congés annuels", detail: "à partir du 21e jour épargné (20 jours doivent rester pris dans l'année) — voir notice" },
  { code: "RQ", label: "RQ (repos supplémentaires)", detail: "articles 32-I, 38-5 et 47 du RH0077" },
  { code: "RN", label: "RN (repos compensateur de nuit)" },
  { code: "TC", label: "TC (temps compensé mensuel)" },
  { code: "TY", label: "TY (temps compensé semestriel)" },
  { code: "RCF", label: "RCF (repos compensateur de fêtes)", detail: "saisie libre, propre au CET, ne déduit aucun autre compteur" },
  { code: "MEDAILLE", label: "Congé médaille d'honneur des Chemins de Fer", detail: "article 8 chapitre 10 du Statut — saisie libre, propre au CET, ne déduit aucun autre compteur" },
];

// RQ est déjà en jours (aucune conversion) — seuls RN/TC/TY ont un ledger en
// heures/minutes à débiter. Médaille ne débite jamais rien (source propre au
// CET, voir SOURCES_EPARGNE ci-dessus).
export const LEDGER_KEY_BY_SOURCE = { RN: "rnLedger", TC: "tcLedger", TY: "tyLedger" };

// Total de jours transférés au CET pour une source donnée (RQ typiquement),
// tous sous-comptes confondus, sur une année — recalculé à la volée depuis
// cetLedger, jamais stocké séparément. Consommé par App.jsx pour ajuster
// l'affichage de la carte/du tableau de bord RQ (voir CompteurDetailModal,
// prop cetDeduction) sans toucher à computeCompteurAvecDetail lui-même.
export function getCetTransfereJours(agentProfiles, agentId, year, source) {
  const ledger = agentProfiles?.[agentId]?.cetLedger || { courant: [], finActivite: [] };
  let total = 0;
  const parSousCompte = {};
  SOUS_COMPTES.forEach(sc => {
    const jours = (ledger[sc.key] || [])
      .filter(m => m?.statut === "accorde" && m.source === source && m.annee === year)
      .reduce((s, m) => s + (m.jours || 0), 0);
    parSousCompte[sc.key] = jours;
    total += jours;
  });
  return { total, parSousCompte };
}

// Places disponibles avant plafond sur un sous-compte, à partir du solde déjà
// calculé par computeDashboardCet (08/08, demandé par Olivier : "le plafond
// du compte courant peut depaser les 20 jours [...] il faut bloquer") — le
// solde étant cumulatif (jamais remis à zéro), c'est la seule vraie mesure de
// "combien reste-t-il de place", peu importe l'année consultée.
export function joursDisponiblesSousCompte(data, sousCompteKey) {
  const compte = data?.comptes?.find(c => c.key === sousCompteKey);
  if (!compte) return Infinity;
  return compte.plafond - compte.solde;
}

// Notice réglementaire — texte verbatim (fourni par Olivier le 06/08, issu
// des formulaires officiels RH0930). Ne jamais reformuler le contenu, seule
// la présentation (mise en page, regroupement) peut être adaptée.
export const NOTICE_CET = [
  {
    titre: "Le CET, en bref",
    texte: `Le CET est un Compte Épargne Temps. Il permet d'épargner des jours de repos supplémentaires ou des congés (sous certaines conditions). L'épargne de ces jours permet de les utiliser plus tard ou de se les faire monétiser.`,
  },
  {
    titre: "Alimentation",
    texte: `Tout salarié peut créditer ses sous-comptes, par des :
 jours de congés annuels, à partir du 21ème jour de congés annuels (20 jours de congés annuels doivent nécessairement être pris dans l'année),
 jours de repos compensateurs tel que détaillé dans le texte d'application du présent accord,
 jours de repos supplémentaires (RQ) tels que définis aux articles 32-I, 38-5 et 47 du RH0077,
 jours de congés pour médaille d'honneur des Chemins de Fer (article 8 chapitre 10 du Statut),
sans que le nombre total des jours, hors abondement, alimentant les deux sous-comptes ne soit supérieur à 10 jours par année civile.
Au titre de chaque année civile, le premier jour affecté sur le CET par le salarié est abondé à 100% par l'entreprise. Cet abondement vise à prendre en compte les contraintes liées à la continuité du service public.`,
  },
  {
    titre: "Épargne — conditions, délais et imprimés",
    texte: `Quel que soit le compte (courant, fin d'activité) :

Congés : avoir suffisamment de jours dans ses compteurs, ET avoir pris au moins 20 jours de congés dans l'année. Date limite pour envoyer sa demande : 31/10 de l'année en cours. Imprimé à utiliser : Intention d'épargne de congés annuels.

RQ, RN, TC, TY : avoir suffisamment de jours dans ses compteurs. Date limite pour envoyer sa demande : 31/12 de l'année en cours. Imprimé à utiliser : Demande d'épargne sur le CET (hors congés annuels).`,
  },
  {
    titre: "Monétisation des jours CET",
    texte: `Quel que soit le compte (courant, fin d'activité) :

Congés : seulement les 26ème, 27ème et 28ème congés épargnés de l'année A-1 (soit les 3 derniers jours de vos 28 jours de congés de l'année A-1). Quand : 01/04 de l'année suivant l'épargne.

RQ, RN, TC, TY : les RQ, RN, TC, TY épargnés sur l'année A-1. Quand : 01/01 de l'année suivant l'épargne.

Imprimé à utiliser : Demande de monétisation des jours CET.`,
  },
  {
    titre: "Utilisation des jours CET (en temps)",
    texte: `À partir de quand ?

Compte courant : RQ, RN, TC, TY → 01/01 de l'année qui suit leur épargne. Congés → 01/04 de l'année qui suit leur épargne. Imprimé à utiliser : Demande d'utilisation en temps des jours du sous-compte courant.

Compte fin d'activité : RQ, RN, TC, TY et Congés → à partir de l'âge d'ouverture des droits à pension de retraite, ou pour des évènements familiaux*. Imprimé à utiliser : Demande d'utilisation en temps des jours du sous-compte de fin d'activité.

* L'utilisation du compte fin d'activité pour des évènements de famille :
— Décès ou accompagnement en fin de vie du conjoint, d'un père, d'une mère ou d'un enfant du salarié (utilisation des jours CET dans les 6 mois de la survenance de l'évènement — remplir l'imprimé « demande d'utilisation de jours CET pour évènement familiaux » et l'envoyer à la CPS, accompagné d'un justificatif).
— Paternité (remplir l'imprimé « demande d'utilisation de jours CET pour évènement familiaux » et l'envoyer à la CPS, accompagné d'un justificatif. Attention la demande doit être faite en même temps que la demande de congés paternité).`,
  },
];

// ─── Calcul ──────────────────────────────────────────────────────────────────
// Le ledger est une simple liste de mouvements par sous-compte — un mouvement
// "accordé" avec sens "credit" alimente le solde, "debit" (monétisation ou
// utilisation, phases suivantes) le réduit.
export function computeDashboardCet(agentProfiles, agentId, year) {
  const ledger = agentProfiles?.[agentId]?.cetLedger || { courant: [], finActivite: [] };
  let totalAccordeAnneeHorsAbondement = 0;
  const comptes = SOUS_COMPTES.map(sc => {
    const mouvements = ledger[sc.key] || [];
    const accordes = mouvements.filter(m => m?.statut === "accorde");
    const solde = accordes.reduce((s, m) => s + (m.sens === "debit" ? -m.jours : m.jours), 0);
    const enAttente = mouvements.filter(m => m?.statut === "demande");
    const refusees = mouvements.filter(m => m?.statut === "refuse");
    accordes.forEach(m => {
      if (m.type === "epargne" && m.annee === year) totalAccordeAnneeHorsAbondement += m.jours || 0;
    });
    return { ...sc, solde, mouvements, enAttente, accordes, refusees };
  });
  const soldeTotal = comptes.reduce((s, c) => s + c.solde, 0);
  // Listes affichées filtrées sur l'année consultée (08/08, demandé par
  // Olivier : "on les garde sans cesse [...] dans 10 ans ça va rester [...]
  // ça gêne la lecture du panneau") — même convention que tous les autres
  // compteurs de l'appli (RQ/RN/TY/Congés/Fêtes...), qui scopent déjà leur
  // détail par année via le YearSwitcher, seul CET l'ignorait jusqu'ici. Le
  // solde total ci-dessus reste calculé sur `comptes[].accordes`, JAMAIS
  // filtré — c'est un compte épargne temps, cumulatif par nature, changer
  // d'année ne doit jamais faire bouger le solde, seulement la liste.
  //
  // Les "ajustement"/"surAbondement" (08/08, 2e retour d'Olivier : "je vois
  // encore l'ajustement du compte courant sur 2027. et celui de l'autre sous
  // compte sur 2026 [...] je voulis ne plus voir ça sans cesse d'année en
  // année") ne sont PAS une épargne réglementaire datée — c'est une
  // déclaration ponctuelle de solde de départ, sans rapport avec l'année où
  // elle a été saisie. Le filtre par année les faisait quand même réapparaître
  // indéfiniment sur LEUR année de saisie à chaque fois qu'on la reconsulte —
  // exactement le clutter dénoncé. Sortis de `mouvementsAccordes` (donc du
  // filtre par année) vers une liste séparée, jamais filtrée, affichée dans
  // une section dédiée repliée par défaut (voir CetDashboardModal).
  const isAjustement = m => m.type === "ajustement" || m.type === "surAbondement";
  const demandesEnAttente = comptes.flatMap(c => c.enAttente.filter(m => m.annee === year).map(m => ({ ...m, sousCompte: c.key })));
  const mouvementsAccordes = comptes.flatMap(c => c.accordes.filter(m => !isAjustement(m) && m.annee === year).map(m => ({ ...m, sousCompte: c.key })));
  const mouvementsAjustements = comptes.flatMap(c => c.accordes.filter(isAjustement).map(m => ({ ...m, sousCompte: c.key })));
  const mouvementsRefuses = comptes.flatMap(c => c.refusees.filter(m => m.annee === year).map(m => ({ ...m, sousCompte: c.key })));
  return { comptes, soldeTotal, ledger, demandesEnAttente, mouvementsAccordes, mouvementsAjustements, mouvementsRefuses, totalAccordeAnneeHorsAbondement };
}

function NoticeSection() {
  const [ouvert, setOuvert] = useState(false);
  const contentRef = useRef(null);
  // Sur mobile, la notice est tout en bas d'une modale déjà longue —
  // basculer `ouvert` révèle du contenu hors de l'écran sans qu'aucun scroll
  // automatique ne l'amène en vue, donnant l'impression que "ça ne s'ouvre
  // pas" alors que le contenu est bien là, juste invisible sans scroll manuel
  // (signalé par Olivier, 07/08). useEffect (pas un simple callback dans le
  // onClick) car le contenu n'existe dans le DOM qu'après le rendu déclenché
  // par le nouvel état — la ref n'est attachée qu'à ce moment-là.
  useEffect(() => {
    if (ouvert) contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [ouvert]);
  return (
    <div style={SECTION_CARD}>
      <button onClick={() => setOuvert(v => !v)} style={{
        background: "none", border: "none", color: "#5b21b6", cursor: "pointer",
        fontSize: 12, fontWeight: 800, padding: 0, display: "flex", alignItems: "center", gap: 6,
      }}>
        {ouvert ? "▴" : "▾"} 📖 Notice — ce qu'il faut savoir sur le CET
      </button>
      {ouvert && (
        <div ref={contentRef} style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
          {NOTICE_CET.map(section => (
            <div key={section.titre} style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#5b21b6", marginBottom: 5 }}>{section.titre}</div>
              <div style={{ fontSize: 11.5, color: "#334155", whiteSpace: "pre-line", lineHeight: 1.5 }}>{section.texte}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Sélecteur d'année minimal, local à ce module (pas de dépendance vers
// App.jsx — voir principe d'isolation en tête de fichier).
function YearSwitcherMini({ year, availableYears, onChange }) {
  if (!availableYears || !onChange) return null;
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {availableYears.map(y => (
        <button key={y} onClick={(e) => { e.stopPropagation(); onChange(y); }} style={{
          background: y === year ? "#fff" : "rgba(255,255,255,.15)",
          color: y === year ? "#5b21b6" : "#fff",
          border: "none", borderRadius: 7, padding: "4px 8px",
          fontSize: 11, fontWeight: 700, cursor: "pointer",
        }}>{y}</button>
      ))}
    </div>
  );
}

const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const labelSource = (code) => SOURCES_EPARGNE.find(s => s.code === code)?.label || code;

// Ordre de tri par catégorie pour les listes "Demandées"/"Épargnées" (08/08,
// demandé par Olivier en remplacement du tableau récapitulatif jugé trop
// chargé — "j'aurais prefere le tri directement dans les demandés et
// épargnées [...] un tri avec les conges en 1er puis, RQ, RN, TC, TY, RCF").
// Un mouvement sans source connue (abondement, source:null) est classé en
// dernier plutôt que de casser le tri.
const ORDRE_CATEGORIES = ["CA", "RQ", "RN", "TC", "TY", "RCF", "MEDAILLE"];
const parCategorie = (mouvements) => {
  const rang = (m) => { const i = ORDRE_CATEGORIES.indexOf(m.source); return i === -1 ? ORDRE_CATEGORIES.length : i; };
  return [...(mouvements || [])].sort((a, b) => rang(a) - rang(b));
};

// Libellé générique pour un mouvement de n'importe quel type — utilisé dans
// les listes Demandées/Accordées/Refusées, qui mélangent épargne, abondement,
// ajustement, monétisation et utilisation.
const labelMouvement = (m) => {
  if (m.type === "abondement") return "🎁 Abondement";
  if (m.type === "ajustement") return `✏️ Ajustement (${m.sens === "debit" ? "−" : "+"})`;
  if (m.type === "surAbondement") return "🎁 Sur-abondement";
  if (m.type === "monetisation") return "💶 Monétisation";
  if (m.type === "utilisation") return "📅 Utilisation en temps";
  if (m.feteCode) return `🩷 ${m.feteCode} (RCF)`;
  return labelSource(m.source);
};

// Liste des jours (ISO) entre deux dates incluses — utilisée pour écrire/
// retirer chaque jour d'une période "utilisation en temps" dans le planning
// perso, même principe que le calcul de nbJours de la Demande de congés.
function joursEntreDates(debut, fin) {
  const jours = [];
  if (!debut || !fin) return jours;
  let d = new Date(debut + "T12:00:00");
  const f = new Date(fin + "T12:00:00");
  while (d <= f) {
    jours.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return jours;
}

// Crée une demande d'épargne (statut "demande", à accorder depuis le module
// CET) pour une source donnée — logique partagée entre "+ Nouvelle épargne"
// (CetDashboardModal) et EpargneCetWidget (07/08, widget réutilisable posé
// dans les panneaux Congés/RQ/RN/TY/TC pour épargner directement depuis leur
// propre compteur, sans repasser par le module CET). N'écrit jamais rien
// d'autre tant que la demande n'est pas accordée, même principe que le reste
// du cycle Demandé→Accordé/Refusé.
export function ajouterEpargneDemande(setAgentProfiles, agentId, { source, sousCompte, jours, valeurMinutes, annee }) {
  const today = new Date().toISOString().slice(0, 10);
  const mouvement = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: "epargne", source, jours,
    valeurMinutes: valeurMinutes ?? null,
    sens: "credit", statut: "demande",
    dateDemande: today, dateAccord: null, dateRefus: null, annee,
  };
  setAgentProfiles(prev => {
    const profil = prev[agentId] || {};
    const ledger = profil.cetLedger || { courant: [], finActivite: [] };
    return { ...prev, [agentId]: { ...profil, cetLedger: { ...ledger, [sousCompte]: [...(ledger[sousCompte] || []), mouvement] } } };
  });
}

// Crée une demande d'épargne RCF liée à une fête PRÉCISE (jours:1, tagué
// feteCode/feteAnnee) et marque simultanément fetesTracking[...].epargneCet
// — logique partagée entre EpargneFetesCetWidget (panneau Fêtes) et le
// sélecteur de fête du formulaire "+ Nouvelle épargne" du panneau CET
// lui-même (08/08, demandé par Olivier : "depuis le CET, si je veux ajouté
// il faut que je puisse choisir la fete [...] lorsque je valide une fete
// epargné depuis le cet, le compteur du sous compte evolue. mais dans le
// panneau des fetes il se passe rien" — la version précédente du formulaire
// CET créait une épargne RCF générique, sans feteCode, donc sans jamais
// toucher fetesTracking). Extrait pour ne pas dupliquer cette écriture à 2
// endroits.
export function ajouterEpargneFete(setAgentProfiles, agentId, { feteCode, feteAnnee, sousCompte, annee }) {
  const today = new Date().toISOString().slice(0, 10);
  setAgentProfiles(prev => {
    const profil = prev[agentId] || {};
    const ledger = profil.cetLedger || { courant: [], finActivite: [] };
    const nextSc = [...(ledger[sousCompte] || []), {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${feteCode}`,
      type: "epargne", source: "RCF", jours: 1, valeurMinutes: null,
      sens: "credit", statut: "demande",
      dateDemande: today, dateAccord: null, dateRefus: null, annee,
      feteCode, feteAnnee,
    }];
    const fetesTracking = { ...(profil.fetesTracking || {}) };
    const yearTracking = { ...(fetesTracking[feteAnnee] || {}) };
    const codeTracking = { ...(yearTracking[feteCode] || {}) };
    codeTracking.epargneCet = { sousCompte, date: today };
    yearTracking[feteCode] = codeTracking;
    fetesTracking[feteAnnee] = yearTracking;
    return { ...prev, [agentId]: { ...profil, cetLedger: { ...ledger, [sousCompte]: nextSc }, fetesTracking } };
  });
}

// Widget compact "🏦 Épargner au CET" (07/08, demandé par Olivier — "il faut
// que l'on puisse mettre a jour chaque tableaux en precisant que ce jour a
// ete epargne dans le cet") — posable dans n'importe quel panneau source
// (Congés, RQ, RN, TY, TC) pour créer une demande d'épargne directement
// depuis ce panneau, sans repasser par le module CET. Repliable par défaut
// (pas de clutter dans des modales déjà denses), n'écrit que dans cetLedger
// via ajouterEpargneDemande — ne touche jamais aux fonctions de calcul du
// compteur source (computeCompteurAvecDetail, computeDashboardConges, etc.),
// exactement comme le reste du module CET.
export function EpargneCetWidget({ agent, agentProfiles, setAgentProfiles, source, sourceLabel, year, besoinValeur }) {
  const [ouvert, setOuvert] = useState(false);
  const [sousCompte, setSousCompte] = useState("courant");
  const [jours, setJours] = useState("1");
  const [valH, setValH] = useState("0");
  const [valM, setValM] = useState("0");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const data = useMemo(() => computeDashboardCet(agentProfiles, agent?.id, year), [agentProfiles, agent?.id, year]);

  const ajouter = () => {
    setErr(""); setInfo("");
    const j = parseInt(jours, 10) || 0;
    if (j <= 0) { setErr("Indique un nombre de jours valide."); return; }
    const hh = parseInt(valH, 10) || 0, mm = parseInt(valM, 10) || 0;
    if (besoinValeur && hh === 0 && mm === 0) { setErr("Indique la valeur en heures/minutes à déduire."); return; }
    // Plafond du sous-compte visé (08/08, demandé par Olivier — "il faut
    // bloquer en donnant un message sur le motif et proposer d'epargner vers
    // l'autre sous compte").
    const disponible = joursDisponiblesSousCompte(data, sousCompte);
    if (j > disponible) {
      const sc = SOUS_COMPTES.find(s => s.key === sousCompte);
      const autre = SOUS_COMPTES.find(s => s.key !== sousCompte);
      setErr(`⚠️ ${sc.label} est à ${sc.plafond - disponible}j/${sc.plafond}j — cette demande (${j}j) dépasserait le plafond. Choisis "${autre.label}", ou réduis le nombre de jours.`);
      return;
    }
    ajouterEpargneDemande(setAgentProfiles, agent.id, { source, sousCompte, jours: j, valeurMinutes: besoinValeur ? (hh * 60 + mm) : null, annee: year });
    const projete = data.totalAccordeAnneeHorsAbondement + j;
    setInfo(projete > CAP_EPARGNE_AN
      ? `⚠️ Demande ajoutée — cap de ${CAP_EPARGNE_AN}j/an (tous compteurs confondus) dépassé (${projete}j). À accorder depuis "🏦 CET".`
      : `Demande ajoutée — à accorder depuis "🏦 CET".`);
    setJours("1"); setValH("0"); setValM("0");
  };

  return (
    <div style={{ border: "1px solid #e9d5ff", background: "#faf5ff", borderRadius: 10, padding: "10px 12px" }}>
      <button onClick={() => setOuvert(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 800, color: "#5b21b6", display: "flex", alignItems: "center", gap: 6 }}>
        {ouvert ? "▴" : "▾"} 🏦 Épargner {sourceLabel || source} au CET
      </button>
      {ouvert && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {SOUS_COMPTES.map(sc => (
              <button key={sc.key} onClick={() => setSousCompte(sc.key)} style={{
                flex: 1, background: sousCompte === sc.key ? "#5b21b6" : "#fff",
                color: sousCompte === sc.key ? "#fff" : "#5b21b6",
                border: "1.5px solid #e9d5ff", borderRadius: 8, padding: "6px 8px",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}>{sc.icone} {sc.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <input type="number" min="1" value={jours} onChange={e => setJours(e.target.value)}
              style={{ width: 56, textAlign: "center", padding: "6px 4px", border: "1.5px solid #e9d5ff", borderRadius: 8, fontSize: 13, fontWeight: 700 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#334155" }}>jour{parseInt(jours, 10) > 1 ? "s" : ""}</span>
            {besoinValeur && (<>
              <input type="number" min="0" value={valH} onChange={e => setValH(e.target.value)}
                style={{ width: 44, textAlign: "center", padding: "6px 4px", border: "1.5px solid #e9d5ff", borderRadius: 8, fontSize: 13, fontWeight: 700 }} />
              <span style={{ fontSize: 11, color: "#334155" }}>h</span>
              <input type="number" min="0" max="59" value={valM} onChange={e => setValM(e.target.value)}
                style={{ width: 44, textAlign: "center", padding: "6px 4px", border: "1.5px solid #e9d5ff", borderRadius: 8, fontSize: 13, fontWeight: 700 }} />
              <span style={{ fontSize: 11, color: "#334155" }}>min à déduire</span>
            </>)}
            <button onClick={ajouter} style={{ background: "#5b21b6", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>+ Épargner</button>
          </div>
          {err && <div style={{ fontSize: 10.5, fontWeight: 600, color: "#dc2626" }}>{err}</div>}
          {info && <div style={{ fontSize: 10.5, fontWeight: 600, color: "#166534" }}>{info}</div>}
        </div>
      )}
    </div>
  );
}

// Variante du widget ci-dessus, propre aux Fêtes (07/08, demandé par Olivier
// — "il faut pouvoir selectionner la fete epargné; vu que l'on fait un suivi
// precis"). Au lieu d'un simple nombre de jours, l'agent choisit PRÉCISÉMENT
// quelle(s) fête(s) sont épargnées au CET (source RCF) — une ligne par fête
// sélectionnable, jamais un total générique. `fetes` est fourni par
// FetesDashboardModal, déjà filtré aux fêtes éligibles (ni perdues, ni déjà
// épargnées) — inclut aussi bien les fêtes de l'année en cours que celles du
// report N-1 (chacune porte sa propre `annee`, celle de la fête elle-même,
// pas celle du modal ouvert — indispensable pour que le marquage reste
// cohérent qu'on le fasse depuis la vue de l'année N ou celle de N+1).
// Écrit à la fois dans cetLedger (comme EpargneCetWidget) ET dans
// fetesTracking[annee][code].epargneCet (lu par computeFetesLignes via
// `override`, jamais modifié — l'affichage prime juste sur le statut
// réglementaire habituel, voir renderFeteCard/groupeReglees dans App.jsx).
export function EpargneFetesCetWidget({ agent, agentProfiles, setAgentProfiles, fetes, year }) {
  const [ouvert, setOuvert] = useState(false);
  const [selection, setSelection] = useState({});
  const [sousCompte, setSousCompte] = useState("courant");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const data = useMemo(() => computeDashboardCet(agentProfiles, agent?.id, year), [agentProfiles, agent?.id, year]);

  const cle = (f) => `${f.annee}-${f.code}`;
  const toggle = (f) => { if (f.disabled) return; setSelection(prev => ({ ...prev, [cle(f)]: !prev[cle(f)] })); };
  const selectionnables = (fetes || []).filter(f => !f.disabled);

  const epargner = () => {
    setErr(""); setInfo("");
    const choisies = (fetes || []).filter(f => !f.disabled && selection[cle(f)]);
    if (choisies.length === 0) { setErr("Sélectionne au moins une fête à épargner."); return; }
    // Plafond du sous-compte visé (08/08, demandé par Olivier) — vérifié
    // avant tout ajout, jamais partiel (soit toute la sélection rentre, soit
    // rien n'est ajouté, pour ne pas créer une sélection à moitié traitée).
    const disponible = joursDisponiblesSousCompte(data, sousCompte);
    if (choisies.length > disponible) {
      const sc = SOUS_COMPTES.find(s => s.key === sousCompte);
      const autre = SOUS_COMPTES.find(s => s.key !== sousCompte);
      setErr(`⚠️ ${sc.label} est à ${sc.plafond - disponible}j/${sc.plafond}j — cette sélection (${choisies.length}j) dépasserait le plafond. Choisis "${autre.label}", ou réduis la sélection.`);
      return;
    }
    choisies.forEach(f => {
      ajouterEpargneFete(setAgentProfiles, agent.id, { feteCode: f.code, feteAnnee: f.annee, sousCompte, annee: year });
    });
    const projete = data.totalAccordeAnneeHorsAbondement + choisies.length;
    setInfo(projete > CAP_EPARGNE_AN
      ? `⚠️ ${choisies.length} fête(s) ajoutée(s) — cap de ${CAP_EPARGNE_AN}j/an (tous compteurs confondus) dépassé (${projete}j). À accorder depuis "🏦 CET".`
      : `${choisies.length} fête(s) ajoutée(s) — à accorder depuis "🏦 CET".`);
    setSelection({});
  };

  return (
    <div style={{ border: "1px solid #e9d5ff", background: "#faf5ff", borderRadius: 10, padding: "10px 12px" }}>
      <button onClick={() => setOuvert(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 800, color: "#5b21b6", display: "flex", alignItems: "center", gap: 6 }}>
        {ouvert ? "▴" : "▾"} 🏦 Épargner une fête (RCF) au CET
      </button>
      {ouvert && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {(!fetes || fetes.length === 0) ? (
            <div style={{ fontSize: 10.5, color: "#94a3b8", fontStyle: "italic" }}>Aucune fête connue pour l'instant.</div>
          ) : (<>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {fetes.map(f => (
                <label key={cle(f)} style={{
                  display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600,
                  color: f.disabled ? "#94a3b8" : "#1e293b",
                  cursor: f.disabled ? "default" : "pointer",
                }}>
                  <input type="checkbox" checked={!!selection[cle(f)]} disabled={f.disabled} onChange={() => toggle(f)} />
                  <span style={{ textDecoration: f.disabled ? "line-through" : "none" }}>
                    {f.code} — {f.label}{f.annee !== year ? ` (${f.annee})` : ""}
                  </span>
                  {f.disabled && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textDecoration: "none" }}>{f.reason}</span>}
                </label>
              ))}
            </div>
            {selectionnables.length === 0 ? (
              <div style={{ fontSize: 10.5, color: "#94a3b8", fontStyle: "italic" }}>Aucune fête disponible à épargner (toutes déjà réglées ou perdues).</div>
            ) : (<>
              <div style={{ display: "flex", gap: 6 }}>
                {SOUS_COMPTES.map(sc => (
                  <button key={sc.key} onClick={() => setSousCompte(sc.key)} style={{
                    flex: 1, background: sousCompte === sc.key ? "#5b21b6" : "#fff",
                    color: sousCompte === sc.key ? "#fff" : "#5b21b6",
                    border: "1.5px solid #e9d5ff", borderRadius: 8, padding: "6px 8px",
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}>{sc.icone} {sc.label}</button>
                ))}
              </div>
              <button onClick={epargner} style={{ background: "#5b21b6", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>+ Épargner la sélection</button>
            </>)}
          </>)}
          {err && <div style={{ fontSize: 10.5, fontWeight: 600, color: "#dc2626" }}>{err}</div>}
          {info && <div style={{ fontSize: 10.5, fontWeight: 600, color: "#166534" }}>{info}</div>}
        </div>
      )}
    </div>
  );
}

export function CetDashboardModal({ agent, schedule, setSchedule, agentProfiles, setAgentProfiles, year, availableYears, onYearChange, onClose, feteOptions }) {
  const agCp = agent?.immatriculation || agent?.cp || agent?.id;
  const data = useMemo(() => computeDashboardCet(agentProfiles, agent?.id, year), [agentProfiles, agent?.id, year]);

  const [source, setSource] = useState("RQ");
  const [sousCompte, setSousCompte] = useState("courant");
  const [jours, setJours] = useState("1");
  const [feteChoisie, setFeteChoisie] = useState("");
  const [valH, setValH] = useState("0");
  const [valM, setValM] = useState("0");
  const [ajoutErr, setAjoutErr] = useState("");
  const [ajoutInfo, setAjoutInfo] = useState("");
  const [editSousCompte, setEditSousCompte] = useState(null);
  const [editJours, setEditJours] = useState("1");
  const [editNeg, setEditNeg] = useState(false);
  const [monetSousCompte, setMonetSousCompte] = useState("courant");
  const [monetJours, setMonetJours] = useState("1");
  const [monetErr, setMonetErr] = useState("");
  const [utilSousCompte, setUtilSousCompte] = useState("courant");
  const [utilDebut, setUtilDebut] = useState("");
  const [utilFin, setUtilFin] = useState("");
  const [utilErr, setUtilErr] = useState("");
  const [accordErr, setAccordErr] = useState("");
  const [deplaceErr, setDeplaceErr] = useState("");
  const [ajustementsOuvert, setAjustementsOuvert] = useState(false);

  const besoinValeur = source === "RN" || source === "TC" || source === "TY";
  const estRCF = source === "RCF";
  // Fêtes réellement sélectionnables (ni perdues, ni prises/payées, ni déjà
  // épargnées — voir computeFeteOptionsCet dans App.jsx).
  const fetesSelectionnables = (feteOptions || []).filter(f => !f.disabled);

  // Nouvelle demande d'épargne (06/08) : n'écrit rien dans le compteur source
  // tant que non accordée — même principe que Congés/VT. Cas RCF (08/08,
  // demandé par Olivier) : plus un simple nombre de jours en vrac — l'agent
  // choisit PRÉCISÉMENT quelle fête, exactement comme le widget dédié du
  // panneau Fêtes (EpargneFetesCetWidget) — sinon le compteur du sous-compte
  // évoluait mais aucune fête n'était jamais marquée "épargnée" dans le
  // panneau Fêtes lui-même.
  const ajouterDemande = () => {
    setAjoutErr(""); setAjoutInfo("");
    // Plafond du sous-compte visé, commun aux deux branches (08/08).
    const jPlafond = estRCF ? 1 : (parseInt(jours, 10) || 0);
    const disponible = joursDisponiblesSousCompte(data, sousCompte);
    if (jPlafond > disponible) {
      const sc = SOUS_COMPTES.find(s => s.key === sousCompte);
      const autre = SOUS_COMPTES.find(s => s.key !== sousCompte);
      setAjoutErr(`⚠️ ${sc.label} est à ${sc.plafond - disponible}j/${sc.plafond}j — cette demande dépasserait le plafond. Choisis "${autre.label}", ou réduis le nombre de jours.`);
      return;
    }
    if (estRCF) {
      const f = fetesSelectionnables.find(x => `${x.annee}-${x.code}` === feteChoisie);
      if (!f) { setAjoutErr("Choisis une fête à épargner."); return; }
      ajouterEpargneFete(setAgentProfiles, agent.id, { feteCode: f.code, feteAnnee: f.annee, sousCompte, annee: year });
      setFeteChoisie("");
      const projete = data.totalAccordeAnneeHorsAbondement + 1;
      setAjoutInfo(projete > CAP_EPARGNE_AN
        ? `⚠️ Demande ajoutée — attention, en comptant cette demande le total épargné cette année (${projete}j) dépasserait le cap réglementaire de ${CAP_EPARGNE_AN}j/an.`
        : "Demande ajoutée.");
      return;
    }
    const j = parseInt(jours, 10) || 0;
    if (j <= 0) { setAjoutErr("Indique un nombre de jours valide."); return; }
    const hh = parseInt(valH, 10) || 0, mm = parseInt(valM, 10) || 0;
    if (besoinValeur && hh === 0 && mm === 0) { setAjoutErr("Indique la valeur en heures/minutes à déduire du compteur source pour ce jour."); return; }
    ajouterEpargneDemande(setAgentProfiles, agent.id, { source, sousCompte, jours: j, valeurMinutes: besoinValeur ? (hh * 60 + mm) : null, annee: year });
    const projete = data.totalAccordeAnneeHorsAbondement + j;
    if (projete > CAP_EPARGNE_AN) {
      setAjoutInfo(`⚠️ Demande ajoutée — attention, en comptant cette demande le total épargné cette année (${projete}j) dépasserait le cap réglementaire de ${CAP_EPARGNE_AN}j/an.`);
    } else {
      setAjoutInfo("Demande ajoutée.");
    }
    setJours("1"); setValH("0"); setValM("0");
  };

  const trouverMouvement = (sc, id) => (agentProfiles?.[agent.id]?.cetLedger?.[sc] || []).find(m => m.id === id);

  // Écrit/retire le code "CET" dans le planning perso pour chaque jour d'une
  // période d'utilisation en temps — même principe que ecrireVTDansPlanning/
  // annulerAccordDuPlanning (VtDashboardModal, App.jsx) : spread de l'entrée
  // existante (préserve nuit/note perso), un appel réseau par jour.
  const ecrireUtilisationDansPlanning = (debut, fin) => {
    joursEntreDates(debut, fin).forEach(d => {
      const key = `${agCp}-${d}`;
      const entryExistante = schedule[key] || {};
      const fullEntry = { ...entryExistante, equipe: "CET", prive: true };
      setSchedule(prev => ({ ...prev, [key]: fullEntry }));
      api.planning.saveEntry(agCp, d, fullEntry).catch(e => console.error("Erreur sauvegarde CET dans planning:", e));
    });
  };
  const retirerUtilisationDuPlanning = (debut, fin) => {
    joursEntreDates(debut, fin).forEach(d => {
      const key = `${agCp}-${d}`;
      const entryExistante = schedule[key];
      if (!entryExistante || entryExistante.equipe !== "CET") return;
      const { equipe, ...reste } = entryExistante;
      const videTotal = !reste.equipe2 && !reste.finNuit && !reste.notePerso;
      if (videTotal) {
        setSchedule(prev => { const n = { ...prev }; delete n[key]; return n; });
        api.planning.deleteEntry(agCp, d).catch(e => console.error("Erreur suppression CET du planning:", e));
      } else {
        const fullEntry = { ...reste, equipe: null };
        setSchedule(prev => ({ ...prev, [key]: fullEntry }));
        api.planning.saveEntry(agCp, d, fullEntry).catch(e => console.error("Erreur suppression CET du planning:", e));
      }
    });
  };

  // Accorder : branche selon le type de mouvement.
  // - epargne : déduit le compteur source (RN/TC/TY via une écriture
  //   négative dans leur ledger existant, RQ n'a rien à écrire — voir
  //   getCetTransfereJours) et déclenche l'abondement automatique si c'est
  //   le tout premier mouvement épargne accordé de l'année civile.
  // - monetisation : aucun effet ailleurs, juste un débit du solde CET.
  // - utilisation : écrit "CET" dans le planning perso pour toute la
  //   période — bloqué (garde-fou) si un jour de la période contient déjà
  //   autre chose, message affiché via accordErr sans rien modifier.
  const accorderDemande = (sc, id) => {
    setAccordErr("");
    const mouvement = trouverMouvement(sc, id);
    if (!mouvement) return;

    if (mouvement.type === "utilisation" && mouvement.dateDebut && mouvement.dateFin) {
      const occupe = joursEntreDates(mouvement.dateDebut, mouvement.dateFin).find(d => {
        const v = schedule[`${agCp}-${d}`];
        return v?.equipe && v.equipe !== "CET";
      });
      if (occupe) {
        setAccordErr(`Le ${fmtDate(occupe)} contient déjà quelque chose dans ton planning perso. Modifie ou efface ce jour d'abord.`);
        return;
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    setAgentProfiles(prev => {
      const profil = prev[agent.id] || {};
      const ledger = profil.cetLedger || { courant: [], finActivite: [] };
      const mv = (ledger[sc] || []).find(m => m.id === id);
      if (!mv) return prev;

      // L'abondement ne se déclenche que sur une vraie épargne accordée —
      // un ajustement manuel, une monétisation ou une utilisation ne sont
      // pas des épargnes au sens réglementaire et ne doivent ni déclencher
      // l'abondement, ni empêcher qu'une épargne ultérieure le déclenche.
      const dejaAccordeCetteAnnee = mv.type === "epargne" && SOUS_COMPTES.some(s =>
        (ledger[s.key] || []).some(m => m.statut === "accorde" && m.annee === mv.annee && m.type === "epargne")
      );

      const nextLedger = { ...ledger };
      nextLedger[sc] = (ledger[sc] || []).map(m => m.id === id ? { ...m, statut: "accorde", dateAccord: today } : m);
      if (mv.type === "epargne" && !dejaAccordeCetteAnnee) {
        // Destination de l'abondement (08/08, précisé par Olivier : "de base
        // il va dans le courant et si c'est plein dans fin d'activité") —
        // toujours "Compte courant" par défaut, quel que soit le sous-compte
        // choisi pour l'épargne qui l'a déclenché, sauf si ça dépasserait son
        // plafond (20j) : bascule alors sur "Compte fin d'activité" (250j,
        // repli quasiment toujours possible). Déplaçable ensuite à la main
        // via "↔ Déplacer" sur la ligne (voir plus bas).
        const courantCompte = SOUS_COMPTES.find(s => s.key === "courant");
        const soldeCourantApres = (nextLedger.courant || []).filter(m => m.statut === "accorde").reduce((s, m) => s + (m.sens === "debit" ? -m.jours : m.jours), 0);
        const scAbondement = (soldeCourantApres + 1 > courantCompte.plafond) ? "finActivite" : "courant";
        nextLedger[scAbondement] = [...(nextLedger[scAbondement] || []), {
          id: `abond-${mv.id}`, type: "abondement", source: null, jours: 1,
          valeurMinutes: null, sens: "credit", statut: "accorde",
          dateDemande: today, dateAccord: today, dateRefus: null, annee: mv.annee,
        }];
      }

      const next = { ...profil, cetLedger: nextLedger };
      if (mv.type === "epargne") {
        const ledgerKey = LEDGER_KEY_BY_SOURCE[mv.source];
        if (ledgerKey && mv.valeurMinutes) {
          const entry = { id: `cet-${mv.id}`, mois: today.slice(0, 7), deltaMinutes: -mv.valeurMinutes, saisiLe: today, cetSousCompte: sc };
          next[ledgerKey] = [...(profil[ledgerKey] || []), entry];
        }
      }
      return { ...prev, [agent.id]: next };
    });

    if (mouvement.type === "utilisation" && mouvement.dateDebut && mouvement.dateFin) {
      ecrireUtilisationDansPlanning(mouvement.dateDebut, mouvement.dateFin);
    }
  };

  // Nouvelle demande de monétisation (Phase 3, 06/08) : débit du solde CET,
  // aucun lien avec un compteur source ni le planning perso.
  const ajouterMonetisationDemande = () => {
    setMonetErr("");
    const j = parseInt(monetJours, 10) || 0;
    if (j <= 0) { setMonetErr("Indique un nombre de jours valide."); return; }
    const compte = data.comptes.find(c => c.key === monetSousCompte);
    if (compte && j > compte.solde) { setMonetErr(`Solde insuffisant sur ${compte.label} (${compte.solde}j disponibles).`); return; }
    const today = new Date().toISOString().slice(0, 10);
    const mouvement = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "monetisation", source: null, jours: j, valeurMinutes: null,
      sens: "debit", statut: "demande", dateDemande: today, dateAccord: null, dateRefus: null, annee: year,
    };
    setAgentProfiles(prev => {
      const profil = prev[agent.id] || {};
      const ledger = profil.cetLedger || { courant: [], finActivite: [] };
      return { ...prev, [agent.id]: { ...profil, cetLedger: { ...ledger, [monetSousCompte]: [...(ledger[monetSousCompte] || []), mouvement] } } };
    });
    setMonetJours("1");
  };

  // Nouvelle demande d'utilisation en temps (Phase 3, 06/08) : débit du
  // solde CET, période Du/Au — le planning perso n'est écrit qu'à l'accord
  // (voir accorderDemande), jamais à la demande.
  const ajouterUtilisationDemande = () => {
    setUtilErr("");
    if (!utilDebut || !utilFin) { setUtilErr("Choisis une date de début et de fin."); return; }
    const j = joursEntreDates(utilDebut, utilFin).length;
    if (j <= 0) { setUtilErr("La période n'est pas valide."); return; }
    const compte = data.comptes.find(c => c.key === utilSousCompte);
    if (compte && j > compte.solde) { setUtilErr(`Solde insuffisant sur ${compte.label} (${compte.solde}j disponibles).`); return; }
    const today = new Date().toISOString().slice(0, 10);
    const mouvement = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "utilisation", source: null, jours: j, valeurMinutes: null,
      dateDebut: utilDebut, dateFin: utilFin,
      sens: "debit", statut: "demande", dateDemande: today, dateAccord: null, dateRefus: null, annee: year,
    };
    setAgentProfiles(prev => {
      const profil = prev[agent.id] || {};
      const ledger = profil.cetLedger || { courant: [], finActivite: [] };
      return { ...prev, [agent.id]: { ...profil, cetLedger: { ...ledger, [utilSousCompte]: [...(ledger[utilSousCompte] || []), mouvement] } } };
    });
    setUtilDebut(""); setUtilFin("");
  };

  // Ajustement manuel du solde (06/08, demandé par Olivier — "quasiment
  // tout le monde a deja des jours") : effectif immédiatement, pas de
  // cycle demande/accord (comme le "+ Ajuster le solde" déjà utilisé pour
  // TC/RN/TY), aucun lien avec un compteur source, jamais compté dans le
  // cap d'épargne ni dans l'éligibilité à l'abondement (voir plus haut).
  const ajusterSolde = (sc, deltaJours, type = "ajustement") => {
    if (!deltaJours) return;
    const today = new Date().toISOString().slice(0, 10);
    const mouvement = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type, source: null, jours: Math.abs(deltaJours),
      valeurMinutes: null, sens: deltaJours < 0 ? "debit" : "credit", statut: "accorde",
      dateDemande: today, dateAccord: today, dateRefus: null, annee: year,
    };
    setAgentProfiles(prev => {
      const profil = prev[agent.id] || {};
      const ledger = profil.cetLedger || { courant: [], finActivite: [] };
      return { ...prev, [agent.id]: { ...profil, cetLedger: { ...ledger, [sc]: [...(ledger[sc] || []), mouvement] } } };
    });
  };

  const refuserDemande = (sc, id) => {
    const today = new Date().toISOString().slice(0, 10);
    setAgentProfiles(prev => {
      const profil = prev[agent.id] || {};
      const ledger = profil.cetLedger || { courant: [], finActivite: [] };
      return { ...prev, [agent.id]: { ...profil, cetLedger: { ...ledger, [sc]: (ledger[sc] || []).map(m => m.id === id ? { ...m, statut: "refuse", dateRefus: today } : m) } } };
    });
  };

  // Retirer une demande en attente (jamais rien écrit ailleurs, rien à
  // défaire). Annuler un mouvement déjà accordé retire aussi l'écriture
  // correspondante du ledger source (RN/TC/TY) ou du planning perso
  // (utilisation) — l'abondement éventuellement déclenché par ce mouvement
  // n'est volontairement pas retiré automatiquement (même logique que
  // "Annuler" sur Congés/VT : pas de restauration en cascade, l'agent
  // ajuste manuellement si besoin). Un mouvement issu d'EpargneFetesCetWidget
  // (feteCode/feteAnnee, 07/08) efface aussi le marquage epargneCet
  // correspondant dans fetesTracking — sinon la fête resterait affichée
  // "🏦 Épargnée au CET" (App.jsx, renderFeteCard) alors que le mouvement lui-
  // même a disparu. `null` explicite (pas `delete`) : le backend fusionne
  // donnees_json via JSON_MERGE_PATCH, une clé simplement absente du patch
  // n'est jamais supprimée côté serveur (piège déjà rencontré plusieurs fois
  // sur ce projet, voir CLAUDE.md).
  const retirerMouvement = (sc, id) => {
    const mouvement = trouverMouvement(sc, id);
    if (mouvement?.type === "utilisation" && mouvement.statut === "accorde" && mouvement.dateDebut && mouvement.dateFin) {
      retirerUtilisationDuPlanning(mouvement.dateDebut, mouvement.dateFin);
    }
    setAgentProfiles(prev => {
      const profil = prev[agent.id] || {};
      const ledger = profil.cetLedger || { courant: [], finActivite: [] };
      const next = { ...profil, cetLedger: { ...ledger, [sc]: (ledger[sc] || []).filter(m => m.id !== id) } };
      const ledgerKey = mouvement && LEDGER_KEY_BY_SOURCE[mouvement.source];
      if (ledgerKey && mouvement?.statut === "accorde") {
        next[ledgerKey] = (profil[ledgerKey] || []).filter(e => e.id !== `cet-${id}`);
      }
      if (mouvement?.feteCode && mouvement?.feteAnnee) {
        const tracking = profil.fetesTracking || {};
        const yearTracking = { ...(tracking[mouvement.feteAnnee] || {}) };
        const codeTracking = { ...(yearTracking[mouvement.feteCode] || {}) };
        codeTracking.epargneCet = null;
        yearTracking[mouvement.feteCode] = codeTracking;
        next.fetesTracking = { ...tracking, [mouvement.feteAnnee]: yearTracking };
      }
      return { ...prev, [agent.id]: next };
    });
  };

  // Déplacer un mouvement accordé (typiquement un abondement) vers l'autre
  // sous-compte (08/08, demandé par Olivier : "il faudrait pouvoir deplacer
  // l'abondement vers un ou l'autres des sous comptes") — refusé si ça ferait
  // dépasser le plafond du sous-compte de destination, message explicite.
  const deplacerMouvement = (sc, id) => {
    setDeplaceErr("");
    const mouvement = trouverMouvement(sc, id);
    if (!mouvement) return;
    const destKey = SOUS_COMPTES.find(s => s.key !== sc)?.key;
    const dest = SOUS_COMPTES.find(s => s.key === destKey);
    const disponible = joursDisponiblesSousCompte(data, destKey);
    if (mouvement.jours > disponible) {
      setDeplaceErr(`⚠️ ${dest.label} est déjà à son plafond (${dest.plafond - disponible}j/${dest.plafond}j) — impossible d'y déplacer ce mouvement.`);
      return;
    }
    setAgentProfiles(prev => {
      const profil = prev[agent.id] || {};
      const ledger = profil.cetLedger || { courant: [], finActivite: [] };
      return {
        ...prev, [agent.id]: {
          ...profil, cetLedger: {
            ...ledger,
            [sc]: (ledger[sc] || []).filter(m => m.id !== id),
            [destKey]: [...(ledger[destKey] || []), mouvement],
          },
        },
      };
    });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 700,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "85vh",
        overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.3)",
      }}>
        <div style={{
          background: "linear-gradient(135deg,#7c3aed,#5b21b6)", padding: "18px 20px",
          display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0,
        }}>
          <div style={{ color: "#fff", fontSize: 16, fontWeight: 800, flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            🏦 CET {year}
          </div>
          <YearSwitcherMini year={year} availableYears={availableYears} onChange={onYearChange} />
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", opacity: .8, flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          <div style={{ fontSize: 10, color: "#64748b", fontStyle: "italic" }}>
            Compte Épargne Temps — 2 sous-comptes distincts, chacun avec son propre plafond.
          </div>

          {/* Les 2 sous-comptes côte à côte — le chiffre lui-même est
              cliquable (07/08, retour d'Olivier : l'ancienne section "✏️
              Ajuster le solde" séparée plus bas dans la modale était "fouilli
              [...] pas intuitif") : un clic ouvre directement, sous la carte
              concernée, un mini-formulaire d'ajustement + sur-abondement —
              plus besoin de re-sélectionner le sous-compte, c'est celui sur
              lequel on vient de cliquer. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {data.comptes.map(c => {
              const editing = editSousCompte === c.key;
              return (
                <div key={c.key} style={{ background: "#faf5ff", borderRadius: 12, border: editing ? "1.5px solid #5b21b6" : "1.5px solid #e9d5ff", padding: "12px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#5b21b6" }}>{c.icone} {c.label}</div>
                  <button
                    onClick={() => { setEditSousCompte(v => v === c.key ? null : c.key); setEditJours("1"); setEditNeg(false); }}
                    title="Cliquer pour ajuster le solde"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 8, font: "inherit", width: "100%" }}
                  >
                    <div style={{ fontSize: 28, fontWeight: 900, color: "#5b21b6", lineHeight: 1, marginTop: 6 }}>{c.solde}</div>
                  </button>
                  <div style={{ fontSize: 9, color: "#7c3aed", marginTop: 2 }}>jour{c.solde > 1 ? "s" : ""} épargné{c.solde > 1 ? "s" : ""}</div>
                  <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 6 }}>Plafond : {c.plafond}j</div>
                  {c.enAttente.length > 0 && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#a16207", marginTop: 5 }}>⏳ {c.enAttente.length} en attente</div>
                  )}

                  {editing && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #e9d5ff", display: "flex", flexDirection: "column", gap: 7 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <button onClick={() => setEditNeg(n => !n)} style={{
                          border: "1.5px solid #cbd5e1", borderRadius: 7, padding: "5px 9px", cursor: "pointer",
                          background: editNeg ? "#fee2e2" : "#dcfce7", color: editNeg ? "#dc2626" : "#16a34a", fontWeight: 800, fontSize: 12,
                        }}>{editNeg ? "−" : "+"}</button>
                        <input type="number" min="0" value={editJours} onChange={e => setEditJours(e.target.value)}
                          style={{ width: 48, textAlign: "center", padding: "5px 4px", border: "1.5px solid #e9d5ff", borderRadius: 7, fontSize: 13, fontWeight: 700 }} />
                        <span style={{ fontSize: 10, color: "#334155" }}>j</span>
                      </div>
                      <button onClick={() => {
                        const n = parseInt(editJours, 10) || 0;
                        if (n <= 0) return;
                        ajusterSolde(c.key, editNeg ? -n : n);
                        setEditSousCompte(null);
                      }} style={{ background: "#5b21b6", color: "#fff", border: "none", borderRadius: 7, padding: "6px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Valider l'ajustement</button>
                      {/* 🎁 Sur-abondement : même mouvement qu'un ajustement
                          (hors cap, hors éligibilité à l'abondement — voir le
                          filtre type==="epargne" du cap et de l'abondement
                          automatique, qui l'exclut naturellement comme il
                          excluait déjà "ajustement"), tagué différemment pour
                          rester traçable dans l'historique. Toujours un
                          crédit, jamais négatif (bouton indépendant du +/-). */}
                      <button onClick={() => {
                        const n = parseInt(editJours, 10) || 0;
                        if (n <= 0) return;
                        ajusterSolde(c.key, n, "surAbondement");
                        setEditSousCompte(null);
                      }} style={{ background: "#fff7ed", color: "#c2410c", border: "1.5px solid #fed7aa", borderRadius: 7, padding: "6px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>🎁 Sur-abondement</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: "#475569", textAlign: "center", marginTop: -6 }}>
            ✏️ Clique sur un solde pour l'ajuster (jours déjà acquis, correction...) ou activer un sur-abondement.
          </div>

          <div style={{ fontSize: 10.5, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px" }}>
            Cap d'épargne : {CAP_EPARGNE_AN} jours par année civile (hors abondement), tous sous-comptes confondus — {data.totalAccordeAnneeHorsAbondement}j déjà épargnés cette année. Le premier jour épargné dans l'année est abondé à 100% par l'entreprise.
          </div>

          {/* + Nouvelle épargne (Phase 2, 06/08) */}
          <div style={SECTION_CARD}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>+ Nouvelle épargne</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {SOURCES_EPARGNE.map(s => (
                <button key={s.code} onClick={() => setSource(s.code)} style={{
                  background: source === s.code ? "#5b21b6" : "#faf5ff",
                  color: source === s.code ? "#fff" : "#5b21b6",
                  border: "1.5px solid #e9d5ff", borderRadius: 8, padding: "6px 10px",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>{s.code === "MEDAILLE" ? "🎖️ Médaille" : s.code}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {SOUS_COMPTES.map(sc => (
                <button key={sc.key} onClick={() => setSousCompte(sc.key)} style={{
                  flex: 1, background: sousCompte === sc.key ? "#5b21b6" : "#faf5ff",
                  color: sousCompte === sc.key ? "#fff" : "#5b21b6",
                  border: "1.5px solid #e9d5ff", borderRadius: 8, padding: "6px 8px",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>{sc.icone} {sc.label}</button>
              ))}
            </div>
            {/* RCF (08/08, demandé par Olivier) : plus un simple nombre de
                jours en vrac — sélection PRÉCISE de la fête épargnée, même
                principe que EpargneFetesCetWidget (panneau Fêtes). Sans ça,
                le solde du sous-compte évoluait mais aucune fête n'était
                jamais marquée "épargnée" dans le panneau Fêtes lui-même. */}
            {estRCF ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {fetesSelectionnables.length === 0 ? (
                  <div style={{ fontSize: 10.5, color: "#94a3b8", fontStyle: "italic" }}>Aucune fête disponible à épargner pour l'instant (voir 🩷 Fêtes).</div>
                ) : (
                  <select value={feteChoisie} onChange={e => setFeteChoisie(e.target.value)}
                    style={{ padding: "7px 9px", border: "1.5px solid #e9d5ff", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                    <option value="">— Choisir une fête —</option>
                    {fetesSelectionnables.map(f => (
                      <option key={`${f.annee}-${f.code}`} value={`${f.annee}-${f.code}`}>{f.code} — {f.label}{f.annee !== year ? ` (${f.annee})` : ""}</option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <input type="number" min="1" value={jours} onChange={e => setJours(e.target.value)}
                  style={{ width: 56, textAlign: "center", padding: "7px 4px", border: "1.5px solid #e9d5ff", borderRadius: 8, fontSize: 14, fontWeight: 700 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>jour{parseInt(jours, 10) > 1 ? "s" : ""}</span>
                {besoinValeur && (<>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>· déduire</span>
                  <input type="number" min="0" value={valH} onChange={e => setValH(e.target.value)}
                    style={{ width: 48, textAlign: "center", padding: "7px 4px", border: "1.5px solid #e9d5ff", borderRadius: 8, fontSize: 14, fontWeight: 700 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>h</span>
                  <input type="number" min="0" max="59" value={valM} onChange={e => setValM(e.target.value)}
                    style={{ width: 48, textAlign: "center", padding: "7px 4px", border: "1.5px solid #e9d5ff", borderRadius: 8, fontSize: 14, fontWeight: 700 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>min de {source}</span>
                </>)}
              </div>
            )}
            <button onClick={ajouterDemande} style={{ marginTop: 8, background: "#5b21b6", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>+ Ajouter la demande</button>
            {ajoutErr && <div style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", marginTop: 6 }}>{ajoutErr}</div>}
            {ajoutInfo && <div style={{ fontSize: 11, fontWeight: 600, color: "#166534", marginTop: 6 }}>{ajoutInfo}</div>}
            {besoinValeur && <div style={{ fontSize: 10.5, color: "#475569", marginTop: 6 }}>Valeur libre — indique combien d'heures/minutes ce jour représente pour toi dans ton compteur {source}, déduites au moment de l'accord.</div>}
          </div>

          {/* 💶 Nouvelle monétisation (Phase 3, 06/08) — débit du solde CET,
              éligibilité (jours épargnés l'année précédente) rappelée dans
              la notice, non bloquée ici (même philosophie que le cap
              d'épargne : informer plutôt que bloquer). */}
          <div style={SECTION_CARD}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>💶 Nouvelle monétisation</div>
            <div style={{ fontSize: 10.5, color: "#475569", marginBottom: 8 }}>Seuls les jours épargnés l'année précédente sont normalement éligibles (voir notice) — vérifie avant d'envoyer ta demande.</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {SOUS_COMPTES.map(sc => (
                <button key={sc.key} onClick={() => setMonetSousCompte(sc.key)} style={{
                  flex: 1, background: monetSousCompte === sc.key ? "#5b21b6" : "#faf5ff",
                  color: monetSousCompte === sc.key ? "#fff" : "#5b21b6",
                  border: "1.5px solid #e9d5ff", borderRadius: 8, padding: "6px 8px",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>{sc.icone} {sc.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" min="1" value={monetJours} onChange={e => setMonetJours(e.target.value)}
                style={{ width: 64, textAlign: "center", padding: "7px 4px", border: "1.5px solid #e9d5ff", borderRadius: 8, fontSize: 14, fontWeight: 700 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>jour{parseInt(monetJours, 10) > 1 ? "s" : ""}</span>
              <button onClick={ajouterMonetisationDemande} style={{ background: "#5b21b6", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>+ Ajouter la demande</button>
            </div>
            {monetErr && <div style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", marginTop: 6 }}>{monetErr}</div>}
          </div>

          {/* 📅 Nouvelle utilisation en temps (Phase 3, 06/08) — période Du/Au,
              écrit "CET" dans le planning perso à l'accord (jamais à la
              demande), débite le solde CET du nombre de jours de la période. */}
          <div style={SECTION_CARD}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>📅 Nouvelle utilisation en temps</div>
            <div style={{ fontSize: 10.5, color: "#475569", marginBottom: 8 }}>Le compte courant est normalement dispo par blocs de 5 à 20 jours, le compte fin d'activité seulement à l'approche de la retraite ou pour un évènement familial (voir notice) — vérifie avant d'envoyer ta demande.</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {SOUS_COMPTES.map(sc => (
                <button key={sc.key} onClick={() => setUtilSousCompte(sc.key)} style={{
                  flex: 1, background: utilSousCompte === sc.key ? "#5b21b6" : "#faf5ff",
                  color: utilSousCompte === sc.key ? "#fff" : "#5b21b6",
                  border: "1.5px solid #e9d5ff", borderRadius: 8, padding: "6px 8px",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>{sc.icone} {sc.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: "1 1 120px" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", marginBottom: 2 }}>Du</div>
                <input type="date" value={utilDebut} onChange={e => setUtilDebut(e.target.value)}
                  style={{ width: "100%", padding: "7px 9px", border: "1.5px solid #e9d5ff", borderRadius: 8, fontSize: 12 }} />
              </div>
              <div style={{ flex: "1 1 120px" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", marginBottom: 2 }}>Au</div>
                <input type="date" value={utilFin} onChange={e => setUtilFin(e.target.value)}
                  style={{ width: "100%", padding: "7px 9px", border: "1.5px solid #e9d5ff", borderRadius: 8, fontSize: 12 }} />
              </div>
              <button onClick={ajouterUtilisationDemande} style={{ alignSelf: "flex-end", background: "#5b21b6", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>+ Ajouter la demande</button>
            </div>
            {utilDebut && utilFin && joursEntreDates(utilDebut, utilFin).length > 0 && (
              <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 600, marginTop: 6 }}>{joursEntreDates(utilDebut, utilFin).length} jour{joursEntreDates(utilDebut, utilFin).length > 1 ? "s" : ""}</div>
            )}
            {utilErr && <div style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", marginTop: 6 }}>{utilErr}</div>}
          </div>

          {/* Demandées — regroupe épargne/monétisation/utilisation, toutes
              statut "demande" (voir computeDashboardCet, générique par
              statut). Filtré sur l'année consultée depuis le 08/08 (voir note
              plus bas) — change d'année en haut pour retrouver une demande
              faite une autre année. */}
          <div style={SECTION_CARD}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>⏳ Demandées {year} ({data.demandesEnAttente.length})</div>
            {accordErr && <div style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", marginBottom: 8, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 10px" }}>{accordErr}</div>}
            {data.demandesEnAttente.length === 0 ? <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Aucune demande en attente.</div> :
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {parCategorie(data.demandesEnAttente).map(m => (
                  <div key={m.id} style={{ border: "1px solid #e2e8f0", borderRadius: 9, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{labelMouvement(m)} — {m.jours}j</span>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => accorderDemande(m.sousCompte, m.id)} style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✓ Accorder</button>
                        <button onClick={() => refuserDemande(m.sousCompte, m.id)} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✕ Refuser</button>
                        <button onClick={() => retirerMouvement(m.sousCompte, m.id)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 11, fontWeight: 700, textDecoration: "underline" }}>🗑 Retirer</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>
                      {SOUS_COMPTES.find(s => s.key === m.sousCompte)?.icone} {SOUS_COMPTES.find(s => s.key === m.sousCompte)?.label}
                      {m.valeurMinutes ? ` · ${Math.floor(m.valeurMinutes / 60)}h${String(m.valeurMinutes % 60).padStart(2, "0")} à déduire` : ""}
                      {m.type === "utilisation" && m.dateDebut && m.dateFin ? ` · du ${fmtDate(m.dateDebut)} au ${fmtDate(m.dateFin)}` : ""}
                      {` · Demandé le ${fmtDate(m.dateDemande)}`}
                    </div>
                  </div>
                ))}
              </div>}
          </div>

          {/* Épargnées (crédit accordé) — mention du nombre de jours
              d'abondement (ou sur-abondement) inclus dans le total, quand il
              y en a (08/08, demandé par Olivier), pour distinguer d'un coup
              d'œil ce qui vient d'une vraie épargne de ce que l'entreprise a
              ajouté automatiquement. */}
          <div style={SECTION_CARD}>
            {(() => {
              const credites = parCategorie(data.mouvementsAccordes.filter(m => m.sens === "credit"));
              const jAbondement = credites.filter(m => m.type === "abondement").reduce((s, m) => s + (m.jours || 0), 0);
              // Le sur-abondement vit désormais dans "✏️ Ajustements manuels"
              // (jamais filtré par année, voir plus bas) — recompté ici sur
              // l'année consultée uniquement, pour la mention sur cette ligne.
              const jSurAbondement = data.mouvementsAjustements.filter(m => m.type === "surAbondement" && m.annee === year).reduce((s, m) => s + (m.jours || 0), 0);
              const mentions = [];
              if (jAbondement > 0) mentions.push(`dont ${jAbondement}j d'abondement`);
              if (jSurAbondement > 0) mentions.push(`${jSurAbondement}j de sur-abondement`);
              return (<>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>
                  ✅ Épargnées {year} ({credites.length}){mentions.length > 0 ? ` — ${mentions.join(", ")}` : ""}
                </div>
                <div style={{ fontSize: 10.5, color: "#475569", marginBottom: 8, marginTop: -4 }}>Le solde ci-dessus reste cumulé sur toutes les années — seule cette liste change avec l'année sélectionnée en haut.</div>
                {/* Regroupées par sous-compte (08/08, demandé par Olivier :
                    "une separation aussi avec le compte courant et compte fin
                    d'activite dans les epargnés et tu met a coté le nombre
                    total par sous compte. et tu garde le global dans la
                    ligne epargné") — le total global reste sur la ligne
                    "✅ Épargnées" ci-dessus, chaque groupe affiche son propre
                    total à côté de son titre. Un sous-compte sans mouvement
                    n'affiche aucun groupe, pour rester lisible. */}
                {credites.length === 0 ? <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Aucune.</div> :
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {SOUS_COMPTES.map(sc => {
                      const groupe = credites.filter(m => m.sousCompte === sc.key);
                      if (groupe.length === 0) return null;
                      return (
                        <div key={sc.key}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#5b21b6", marginBottom: 6 }}>{sc.icone} {sc.label} ({groupe.length})</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                            {groupe.map(m => (
                              <div key={m.id} style={{ border: "1px solid #dcfce7", background: "#f0fdf4", borderRadius: 9, padding: "9px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <div>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{labelMouvement(m)} — {m.jours}j</span>
                                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>Accordé le {fmtDate(m.dateAccord)}</div>
                                </div>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  {/* Déplacer un sous-compte vers l'autre (08/08, demandé
                                      par Olivier — surtout utile pour un abondement placé
                                      automatiquement, mais fonctionne sur n'importe quel
                                      mouvement accordé). */}
                                  <button onClick={() => deplacerMouvement(m.sousCompte, m.id)} title={`Déplacer vers ${SOUS_COMPTES.find(s => s.key !== m.sousCompte)?.label}`} style={{ background: "none", border: "none", color: "#5b21b6", cursor: "pointer", fontSize: 11, fontWeight: 700, textDecoration: "underline" }}>↔ Déplacer</button>
                                  <button onClick={() => retirerMouvement(m.sousCompte, m.id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 700, textDecoration: "underline" }}>✕ Annuler</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>}
                {deplaceErr && <div style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", marginTop: 8 }}>{deplaceErr}</div>}
              </>);
            })()}
          </div>

          {/* Sorties (débit accordé : monétisation + utilisation) */}
          <div style={SECTION_CARD}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>📤 Sorties {year} — monétisées / utilisées ({data.mouvementsAccordes.filter(m => m.sens === "debit").length})</div>
            {data.mouvementsAccordes.filter(m => m.sens === "debit").length === 0 ? <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Aucune.</div> :
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {data.mouvementsAccordes.filter(m => m.sens === "debit").map(m => (
                  <div key={m.id} style={{ border: "1px solid #ede9fe", background: "#faf5ff", borderRadius: 9, padding: "9px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{labelMouvement(m)} — {m.jours}j</span>
                      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>
                        {SOUS_COMPTES.find(s => s.key === m.sousCompte)?.icone} {SOUS_COMPTES.find(s => s.key === m.sousCompte)?.label}
                        {m.type === "utilisation" && m.dateDebut && m.dateFin ? ` · du ${fmtDate(m.dateDebut)} au ${fmtDate(m.dateFin)}` : ""}
                        {` · Accordé le ${fmtDate(m.dateAccord)}`}
                      </div>
                    </div>
                    <button onClick={() => retirerMouvement(m.sousCompte, m.id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 700, textDecoration: "underline" }}>✕ Annuler</button>
                  </div>
                ))}
              </div>}
          </div>

          {/* Ajustements manuels — solde de départ / corrections (08/08) :
              pas une épargne datée, jamais filtrés par année (voir
              computeDashboardCet), repliés par défaut pour ne pas polluer la
              lecture du panneau tant qu'on ne va pas volontairement les
              consulter. */}
          <div style={SECTION_CARD}>
            <button onClick={() => setAjustementsOuvert(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 800, color: "#334155", display: "flex", alignItems: "center", gap: 6 }}>
              {ajustementsOuvert ? "▴" : "▾"} ✏️ Ajustements manuels ({data.mouvementsAjustements.length})
            </button>
            {ajustementsOuvert && (
              data.mouvementsAjustements.length === 0 ? <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", marginTop: 8 }}>Aucun.</div> :
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
                  {data.mouvementsAjustements.map(m => (
                    <div key={m.id} style={{ border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 9, padding: "9px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{labelMouvement(m)} — {m.jours}j</span>
                        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>
                          {SOUS_COMPTES.find(s => s.key === m.sousCompte)?.icone} {SOUS_COMPTES.find(s => s.key === m.sousCompte)?.label} · {fmtDate(m.dateAccord)}
                        </div>
                      </div>
                      <button onClick={() => retirerMouvement(m.sousCompte, m.id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 700, textDecoration: "underline" }}>✕ Annuler</button>
                    </div>
                  ))}
                </div>
            )}
          </div>

          {/* Refusées */}
          {data.mouvementsRefuses.length > 0 && (
            <div style={SECTION_CARD}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>❌ Refusées {year} ({data.mouvementsRefuses.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {data.mouvementsRefuses.map(m => (
                  <div key={m.id} style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 9, padding: "9px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{labelMouvement(m)} — {m.jours}j</span>
                    <button onClick={() => retirerMouvement(m.sousCompte, m.id)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 11, fontWeight: 700, textDecoration: "underline" }}>🗑 Retirer</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <NoticeSection />
        </div>
      </div>
    </div>
  );
}
