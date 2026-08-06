import { useState, useMemo } from "react";

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

// Constantes réglementaires — jamais en dur dans la logique de calcul, pour
// pouvoir les ajuster sans toucher au reste du fichier.
export const PLAFOND_COURANT = 20;
export const PLAFOND_FIN_ACTIVITE = 250;
export const CAP_EPARGNE_AN = 10; // jours/an, hors abondement, tous sous-comptes confondus

export const SOUS_COMPTES = [
  { key: "courant", label: "Compte courant", icone: "💼", plafond: PLAFOND_COURANT },
  { key: "finActivite", label: "Compte fin d'activité", icone: "🏁", plafond: PLAFOND_FIN_ACTIVITE },
];

// Sources d'épargne éligibles (confirmées par Olivier le 06/08) — RS et RG
// exclus (aucun compteur correspondant dans l'appli). "Médaille" est une
// source propre au module CET, sans compteur dédié ailleurs dans l'appli.
export const SOURCES_EPARGNE = [
  { code: "RQ", label: "RQ (repos supplémentaires)", detail: "articles 32-I, 38-5 et 47 du RH0077" },
  { code: "RN", label: "RN (repos compensateur de nuit)" },
  { code: "TC", label: "TC (temps compensé mensuel)" },
  { code: "TY", label: "TY (temps compensé semestriel)" },
  { code: "MEDAILLE", label: "Congé médaille d'honneur des Chemins de Fer", detail: "article 8 chapitre 10 du Statut — saisie libre, propre au CET, ne déduit aucun autre compteur" },
];
// Congés (CA) reste hors de cette liste en Phase 2 — cycle d'épargne à part
// (intention → confirmation manuelle par l'agent), prévu en Phase 5.

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
  const demandesEnAttente = comptes.flatMap(c => c.enAttente.map(m => ({ ...m, sousCompte: c.key })));
  const mouvementsAccordes = comptes.flatMap(c => c.accordes.map(m => ({ ...m, sousCompte: c.key })));
  const mouvementsRefuses = comptes.flatMap(c => c.refusees.map(m => ({ ...m, sousCompte: c.key })));
  return { comptes, soldeTotal, ledger, demandesEnAttente, mouvementsAccordes, mouvementsRefuses, totalAccordeAnneeHorsAbondement };
}

function NoticeSection() {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
      <button onClick={() => setOuvert(v => !v)} style={{
        background: "none", border: "none", color: "#5b21b6", cursor: "pointer",
        fontSize: 12, fontWeight: 800, padding: 0, display: "flex", alignItems: "center", gap: 6,
      }}>
        {ouvert ? "▴" : "▾"} 📖 Notice — ce qu'il faut savoir sur le CET
      </button>
      {ouvert && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
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

export function CetDashboardModal({ agent, agentProfiles, setAgentProfiles, year, availableYears, onYearChange, onClose }) {
  const data = useMemo(() => computeDashboardCet(agentProfiles, agent?.id, year), [agentProfiles, agent?.id, year]);

  const [source, setSource] = useState("RQ");
  const [sousCompte, setSousCompte] = useState("courant");
  const [jours, setJours] = useState("1");
  const [valH, setValH] = useState("0");
  const [valM, setValM] = useState("0");
  const [ajoutErr, setAjoutErr] = useState("");
  const [ajoutInfo, setAjoutInfo] = useState("");

  const besoinValeur = source === "RN" || source === "TC" || source === "TY";

  // Nouvelle demande d'épargne (06/08) : n'écrit rien dans le compteur source
  // tant que non accordée — même principe que Congés/VT.
  const ajouterDemande = () => {
    setAjoutErr(""); setAjoutInfo("");
    const j = parseInt(jours, 10) || 0;
    if (j <= 0) { setAjoutErr("Indique un nombre de jours valide."); return; }
    const hh = parseInt(valH, 10) || 0, mm = parseInt(valM, 10) || 0;
    if (besoinValeur && hh === 0 && mm === 0) { setAjoutErr("Indique la valeur en heures/minutes à déduire du compteur source pour ce jour."); return; }
    const today = new Date().toISOString().slice(0, 10);
    const mouvement = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "epargne", source, jours: j,
      valeurMinutes: besoinValeur ? (hh * 60 + mm) : null,
      sens: "credit", statut: "demande",
      dateDemande: today, dateAccord: null, dateRefus: null, annee: year,
    };
    setAgentProfiles(prev => {
      const profil = prev[agent.id] || {};
      const ledger = profil.cetLedger || { courant: [], finActivite: [] };
      return { ...prev, [agent.id]: { ...profil, cetLedger: { ...ledger, [sousCompte]: [...(ledger[sousCompte] || []), mouvement] } } };
    });
    const projete = data.totalAccordeAnneeHorsAbondement + j;
    if (projete > CAP_EPARGNE_AN) {
      setAjoutInfo(`⚠️ Demande ajoutée — attention, en comptant cette demande le total épargné cette année (${projete}j) dépasserait le cap réglementaire de ${CAP_EPARGNE_AN}j/an.`);
    } else {
      setAjoutInfo("Demande ajoutée.");
    }
    setJours("1"); setValH("0"); setValM("0");
  };

  const trouverMouvement = (sc, id) => (agentProfiles?.[agent.id]?.cetLedger?.[sc] || []).find(m => m.id === id);

  // Accorder : déduit le compteur source (RN/TC/TY via une écriture négative
  // dans leur ledger existant, RQ n'a rien à écrire — voir
  // getCetTransfereJours, recalcul à la volée) et déclenche l'abondement
  // automatique si c'est le tout premier mouvement accordé de l'année civile
  // (tous sous-comptes confondus, texte réglementaire fourni par Olivier).
  const accorderDemande = (sc, id) => {
    const today = new Date().toISOString().slice(0, 10);
    setAgentProfiles(prev => {
      const profil = prev[agent.id] || {};
      const ledger = profil.cetLedger || { courant: [], finActivite: [] };
      const mouvement = (ledger[sc] || []).find(m => m.id === id);
      if (!mouvement) return prev;

      const dejaAccordeCetteAnnee = SOUS_COMPTES.some(s =>
        (ledger[s.key] || []).some(m => m.statut === "accorde" && m.annee === mouvement.annee)
      );

      const nextLedger = { ...ledger };
      nextLedger[sc] = (ledger[sc] || []).map(m => m.id === id ? { ...m, statut: "accorde", dateAccord: today } : m);
      if (!dejaAccordeCetteAnnee) {
        nextLedger[sc] = [...nextLedger[sc], {
          id: `abond-${mouvement.id}`, type: "abondement", source: null, jours: 1,
          valeurMinutes: null, sens: "credit", statut: "accorde",
          dateDemande: today, dateAccord: today, dateRefus: null, annee: mouvement.annee,
        }];
      }

      const next = { ...profil, cetLedger: nextLedger };
      const ledgerKey = LEDGER_KEY_BY_SOURCE[mouvement.source];
      if (ledgerKey && mouvement.valeurMinutes) {
        const entry = { id: `cet-${mouvement.id}`, mois: today.slice(0, 7), deltaMinutes: -mouvement.valeurMinutes, saisiLe: today, cetSousCompte: sc };
        next[ledgerKey] = [...(profil[ledgerKey] || []), entry];
      }
      return { ...prev, [agent.id]: next };
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
  // correspondante du ledger source (RN/TC/TY) — l'abondement éventuellement
  // déclenché par ce mouvement n'est volontairement pas retiré automatiquement
  // (même logique que "Annuler" sur Congés/VT : pas de restauration en
  // cascade, l'agent ajuste manuellement si besoin).
  const retirerMouvement = (sc, id) => {
    const mouvement = trouverMouvement(sc, id);
    setAgentProfiles(prev => {
      const profil = prev[agent.id] || {};
      const ledger = profil.cetLedger || { courant: [], finActivite: [] };
      const next = { ...profil, cetLedger: { ...ledger, [sc]: (ledger[sc] || []).filter(m => m.id !== id) } };
      const ledgerKey = mouvement && LEDGER_KEY_BY_SOURCE[mouvement.source];
      if (ledgerKey && mouvement?.statut === "accorde") {
        next[ledgerKey] = (profil[ledgerKey] || []).filter(e => e.id !== `cet-${id}`);
      }
      return { ...prev, [agent.id]: next };
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

          {/* Les 2 sous-comptes côte à côte */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {data.comptes.map(c => (
              <div key={c.key} style={{ background: "#faf5ff", borderRadius: 12, border: "1.5px solid #e9d5ff", padding: "12px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#5b21b6" }}>{c.icone} {c.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#5b21b6", lineHeight: 1, marginTop: 6 }}>{c.solde}</div>
                <div style={{ fontSize: 9, color: "#7c3aed", marginTop: 2 }}>jour{c.solde > 1 ? "s" : ""} épargné{c.solde > 1 ? "s" : ""}</div>
                <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 6 }}>Plafond : {c.plafond}j</div>
                {c.enAttente.length > 0 && (
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#a16207", marginTop: 5 }}>⏳ {c.enAttente.length} en attente</div>
                )}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10.5, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px" }}>
            Cap d'épargne : {CAP_EPARGNE_AN} jours par année civile (hors abondement), tous sous-comptes confondus — {data.totalAccordeAnneeHorsAbondement}j déjà épargnés cette année. Le premier jour épargné dans l'année est abondé à 100% par l'entreprise.
          </div>

          {/* + Nouvelle épargne (Phase 2, 06/08) */}
          <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
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
            <button onClick={ajouterDemande} style={{ marginTop: 8, background: "#5b21b6", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>+ Ajouter la demande</button>
            {ajoutErr && <div style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", marginTop: 6 }}>{ajoutErr}</div>}
            {ajoutInfo && <div style={{ fontSize: 11, fontWeight: 600, color: "#166534", marginTop: 6 }}>{ajoutInfo}</div>}
            {besoinValeur && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>Valeur libre — indique combien d'heures/minutes ce jour représente pour toi dans ton compteur {source}, déduites au moment de l'accord.</div>}
          </div>

          {/* Demandées */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>⏳ Demandées ({data.demandesEnAttente.length})</div>
            {data.demandesEnAttente.length === 0 ? <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Aucune demande en attente.</div> :
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {data.demandesEnAttente.map(m => (
                  <div key={m.id} style={{ border: "1px solid #e2e8f0", borderRadius: 9, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{labelSource(m.source)} — {m.jours}j</span>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => accorderDemande(m.sousCompte, m.id)} style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✓ Accorder</button>
                        <button onClick={() => refuserDemande(m.sousCompte, m.id)} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✕ Refuser</button>
                        <button onClick={() => retirerMouvement(m.sousCompte, m.id)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 11, fontWeight: 700, textDecoration: "underline" }}>🗑 Retirer</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>
                      {SOUS_COMPTES.find(s => s.key === m.sousCompte)?.icone} {SOUS_COMPTES.find(s => s.key === m.sousCompte)?.label}
                      {m.valeurMinutes ? ` · ${Math.floor(m.valeurMinutes / 60)}h${String(m.valeurMinutes % 60).padStart(2, "0")} à déduire` : ""}
                      {` · Demandé le ${fmtDate(m.dateDemande)}`}
                    </div>
                  </div>
                ))}
              </div>}
          </div>

          {/* Épargnées (accordées) */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>✅ Épargnées ({data.mouvementsAccordes.length})</div>
            {data.mouvementsAccordes.length === 0 ? <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Aucune.</div> :
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {data.mouvementsAccordes.map(m => (
                  <div key={m.id} style={{ border: "1px solid #dcfce7", background: "#f0fdf4", borderRadius: 9, padding: "9px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{m.type === "abondement" ? "🎁 Abondement" : labelSource(m.source)} — {m.jours}j</span>
                      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>
                        {SOUS_COMPTES.find(s => s.key === m.sousCompte)?.icone} {SOUS_COMPTES.find(s => s.key === m.sousCompte)?.label} · Accordé le {fmtDate(m.dateAccord)}
                      </div>
                    </div>
                    <button onClick={() => retirerMouvement(m.sousCompte, m.id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 700, textDecoration: "underline" }}>✕ Annuler</button>
                  </div>
                ))}
              </div>}
          </div>

          {/* Refusées */}
          {data.mouvementsRefuses.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>❌ Refusées ({data.mouvementsRefuses.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {data.mouvementsRefuses.map(m => (
                  <div key={m.id} style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 9, padding: "9px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{labelSource(m.source)} — {m.jours}j</span>
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
