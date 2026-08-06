import { useState } from "react";

// ─── CET (Compte Épargne Temps) ─────────────────────────────────────────────
// Module volontairement isolé du reste de l'appli (même principe que
// DemandeCongesView.jsx) : toute la logique métier CET (constantes, calcul
// des soldes, notice réglementaire) vit dans ce fichier, pas dans App.jsx.
// App.jsx se contente d'importer computeDashboardCet + CetDashboardModal et
// d'afficher une carte cliquable, comme pour n'importe quel autre compteur.
//
// Phase 1 (06/08) : structure + notice + soldes à 0, AUCUN lien avec les
// autres compteurs (RQ/RN/TC/TY/Congés) — ça viendra en phase 2+.

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
  { code: "CA", label: "Congés annuels", detail: "à partir du 21e jour (20 jours doivent rester pris dans l'année)" },
  { code: "RQ", label: "RQ (repos supplémentaires)", detail: "articles 32-I, 38-5 et 47 du RH0077" },
  { code: "RN", label: "RN (repos compensateur de nuit)" },
  { code: "TC", label: "TC (temps compensé mensuel)" },
  { code: "TY", label: "TY (temps compensé semestriel)" },
  { code: "MEDAILLE", label: "Congé médaille d'honneur des Chemins de Fer", detail: "article 8 chapitre 10 du Statut — saisie libre, propre au CET" },
];

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

// ─── Calcul (phase 1 : structure seule, aucun lien avec les autres compteurs) ──
// Le ledger est une simple liste de mouvements par sous-compte — un mouvement
// "accordé" avec sens "credit" alimente le solde, "debit" (monétisation ou
// utilisation) le réduit. Rien n'est encore écrit nulle part : le ledger est
// vide tant qu'aucune action n'existe (phases suivantes).
export function computeDashboardCet(agentProfiles, agentId, year) {
  const ledger = agentProfiles?.[agentId]?.cetLedger || { courant: [], finActivite: [] };
  const comptes = SOUS_COMPTES.map(sc => {
    const mouvements = ledger[sc.key] || [];
    const accordes = mouvements.filter(m => m?.statut === "accorde");
    const solde = accordes.reduce((s, m) => s + (m.sens === "debit" ? -m.jours : m.jours), 0);
    const enAttente = mouvements.filter(m => m?.statut === "demande").length;
    return { ...sc, solde, mouvements, enAttente };
  });
  const soldeTotal = comptes.reduce((s, c) => s + c.solde, 0);
  return { comptes, soldeTotal, ledger };
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

export function CetDashboardModal({ agent, agentProfiles, setAgentProfiles, year, availableYears, onYearChange, onClose }) {
  const data = computeDashboardCet(agentProfiles, agent?.id, year);

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
            Compte Épargne Temps — 2 sous-comptes distincts, chacun avec son propre plafond. Module en construction : la structure et la notice sont en place, les mouvements (épargne/monétisation/utilisation) arrivent dans une prochaine étape.
          </div>

          {/* Les 2 sous-comptes côte à côte */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {data.comptes.map(c => (
              <div key={c.key} style={{ background: "#faf5ff", borderRadius: 12, border: "1.5px solid #e9d5ff", padding: "12px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#5b21b6" }}>{c.icone} {c.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#5b21b6", lineHeight: 1, marginTop: 6 }}>{c.solde}</div>
                <div style={{ fontSize: 9, color: "#7c3aed", marginTop: 2 }}>jour{c.solde > 1 ? "s" : ""} épargné{c.solde > 1 ? "s" : ""}</div>
                <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 6 }}>Plafond : {c.plafond}j</div>
                {c.enAttente > 0 && (
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#a16207", marginTop: 5 }}>⏳ {c.enAttente} en attente</div>
                )}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10.5, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px" }}>
            Cap d'épargne : {CAP_EPARGNE_AN} jours par année civile (hors abondement), tous sous-comptes confondus. Le premier jour épargné dans l'année est abondé à 100% par l'entreprise.
          </div>

          <NoticeSection />
        </div>
      </div>
    </div>
  );
}
