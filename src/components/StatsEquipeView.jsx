import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import api from "../api/client";

// ─── Stat'Equip ──────────────────────────────────────────────────────────────
// Module de statistiques d'équipe agrégées (effectifs, couverture Réserve
// régionale, congés/VT refusés — anonymisés, jamais de liste nominative —,
// postes non tenus, âge moyen, formation interne, habilitations par poste,
// % temps partiel).
// Composant autonome (même principe que CetView.jsx/FormationView.jsx) : toute
// la donnée vient d'un seul appel à /api/stats-equipe, ouvert à tout agent
// connecté (rien de nominatif n'y transite, voir CLAUDE.md).
// ────────────────────────────────────────────────────────────────────────────

const NAVY = { from: "#0f4c81", to: "#1e3a5f", bgLight: "#eff6ff", borderLight: "#bfdbfe" };

// Sous-onglets (09/09, demande d'Olivier -- "la page s'allonge à chaque
// ajout [...] je proposerais de la découper en sous-onglets [...] pour
// rester lisible sur mobile", "tente pour voir [...] tu fais attention de
// ne rien effacer. et sans risque") -- regroupe les ~9 sections existantes
// en 4 groupes affichés un par un, sans toucher au rendu ni à la logique
// d'AUCUNE section : chacune garde son JSX, son état interne (ouvert/fermé,
// tri...) et ses props strictement identiques à avant ce chantier, seul le
// regroupement/l'affichage conditionnel change. Répartition (proposée à
// Olivier, non contestée) : Effectifs = démographie (vue d'ensemble,
// grades, Réserve/Roulement, âge) ; Couverture = qui couvre quoi (Réserve
// régionale + évolution, Dispo) ; Formation = compétences (sessions AFO +
// étude de poste, habilitations) ; Alertes = ce qui appelle une action
// (congés/VT refusés, postes non tenus).
const TABS = [
  { key: "effectifs", label: "👥 Effectifs" },
  { key: "couverture", label: "🔁 Couverture" },
  { key: "formation", label: "🎓 Formation" },
  { key: "alertes", label: "⚠️ Alertes" },
];

// Table de libellés recopiée telle quelle depuis HAB_PRCI/HAB_PAR (App.jsx,
// non exportés) — code = code_poste réel de la table `habilitation`. Toujours
// afficher nom ET code ensemble (Olivier : "sinon trop fastidieux à lire").
// PPRCI retiré le 16/08 (Olivier : "tout le monde est apte à ça") — DISPO ne
// le remplace pas ici, c'est une stat à part non nominative (voir plus bas).
const POSTE_LABELS = {
  PICCL: "CCL", PIADJ: "Adj CCL", PILNE: "AC LNE", PILNO: "AC LNO", PILCL: "AC LC", PIVGD: "AC VGD",
  PIPA1J: "Pauseur CCL", PIPA2J: "Pauseur Adjoint", PIPA3J: "Pauseur VGD",
  PIDPXJ: "DPX PRCI", PIASSJ: "Adj DPX", AFOPRCI: "AFO PRCI",
  "A-PRCI": "A-PRCI", "SD%": "SD",
  "PAAC1-": "AC PAR", "PAAC2-": "Aide AC PAR", PAACXX: "CT AC Travaux",
  PAPAUJ: "Pauseur PAR", PADPXJ: "DPX PAR", PAASMJ: "ASMTE PAR", "AFO PAR": "AFO PAR",
};
// Ordre du planning (Olivier : "ccl en 1er adj ensuite [...] journee en dernier")
// — PRCI d'abord, PAR ensuite ; dans chaque famille, les postes 3×8 (ccl,
// adjoint...) d'abord, les postes journée en dernier.
const POSTE_ORDER = [
  // PRCI — 3×8
  "PICCL", "PIADJ", "PILNE", "PILNO", "PILCL", "PIVGD",
  // PRCI — journée
  "PIPA1J", "PIPA2J", "PIPA3J", "PIDPXJ", "PIASSJ", "AFOPRCI", "A-PRCI", "SD%",
  // PAR — 3×8
  "PAAC1-", "PAAC2-", "PAACXX",
  // PAR — journée
  "PAPAUJ", "PADPXJ", "PAASMJ", "AFO PAR",
];
function ordrePoste(code) {
  const i = POSTE_ORDER.indexOf(code);
  return i === -1 ? POSTE_ORDER.length : i;
}
function labelPoste(code) {
  const label = POSTE_LABELS[code];
  return label ? `${label} (${code})` : code;
}

// Étude de poste (27/08, refondu le même jour) : planning_periode.code_poste
// stocke le code COURT local (ex: "LNE", "AC1", "PA1J" -- voir MAPPING_3X8/
// MAPPING_JOURNEE dans client.js), pas le jsCode canonique keyant
// POSTE_LABELS/JSCODE_TO_POSTE -- petite table de correspondance dédiée,
// puis réutilise POSTE_LABELS pour le libellé final (jamais de table de
// libellés dupliquée).
const ETUDE_SHORT_TO_CANON = {
  CCL: "PICCL", ADJ: "PIADJ", LNE: "PILNE", LNO: "PILNO", VGD: "PIVGD", LC: "PILCL",
  AC1: "PAAC1-", AC2: "PAAC2-", ACXX: "PAACXX",
  PA1J: "PIPA1J", PA2J: "PIPA2J", PA3J: "PIPA3J", DPXJ: "PIDPXJ", ASSJ: "PIASSJ", AFOPR: "AFOPRCI",
  PARJ: "PAPAUJ", DPXP: "PADPXJ", ASMP: "PAASMJ",
};
function labelPosteEtude(code) {
  const canon = ETUDE_SHORT_TO_CANON[code] || code;
  return POSTE_LABELS[canon] || canon;
}

// Table dédiée pour "Postes non tenus" (18/08, demande d'Olivier : "il faut
// indiquer en plus du code du poste l'intitulé du poste et le détail par
// service") — POSTE_LABELS ci-dessus est keyée par code DE BASE sans
// suffixe de vacation (ex: "PICCL"), utilisée pour les Habilitations où
// c'est la convention de la table `habilitation`. Mais cps_aleas.js_code
// (source de postesNonTenus) stocke toujours le code COMPLET avec suffixe
// de service (ex: "PICCL-"/"PICCLO"/"PICCLX"), exactement comme
// planning_cps.js_code — labelPoste() ne matchait donc jamais rien pour ces
// entrées, affichant juste le code brut sans intitulé. Recopié depuis
// POSTES_PRCI_3x8/POSTES_PAR_3x8/POSTES_JOURNEE (App.jsx, non exportés).
const JSCODE_TO_POSTE = {
  // PRCI — 3×8
  "PICCL-": { label: "CCL", service: "Matin" }, "PICCLO": { label: "CCL", service: "Soirée" }, "PICCLX": { label: "CCL", service: "Nuit" },
  "PIADJ-": { label: "Adj CCL", service: "Matin" }, "PIADJO": { label: "Adj CCL", service: "Soirée" }, "PIADJX": { label: "Adj CCL", service: "Nuit" },
  "PILNE-": { label: "AC LNE", service: "Matin" }, "PILNEO": { label: "AC LNE", service: "Soirée" }, "PILNEX": { label: "AC LNE", service: "Nuit" },
  "PILNO-": { label: "AC LNO", service: "Matin" }, "PILNOO": { label: "AC LNO", service: "Soirée" }, "PILNOX": { label: "AC LNO", service: "Nuit" },
  "PIVGD-": { label: "AC VGD", service: "Matin" }, "PIVGDO": { label: "AC VGD", service: "Soirée" },
  "PILCL-": { label: "AC LC", service: "Matin" }, "PILCLO": { label: "AC LC", service: "Soirée" }, "PILCLX": { label: "AC LC", service: "Nuit" },
  // PAR — 3×8
  "PAAC1-": { label: "AC PAR", service: "Matin" }, "PAAC1O": { label: "AC PAR", service: "Soirée" }, "PAAC1X": { label: "AC PAR", service: "Nuit" },
  "PAAC2-": { label: "Aide AC PAR", service: "Matin" }, "PAAC2O": { label: "Aide AC PAR", service: "Soirée" }, "PAAC2X": { label: "Aide AC PAR", service: "Nuit" },
  "PAACXX": { label: "CT AC Travaux", service: "Nuit" },
  // PRCI — journée
  "PIPA1J": { label: "Pauseur CCL", service: "Journée" },
  "PIPA2J": { label: "Pauseur Adjoint", service: "Journée" },
  "PIPA3J": { label: "Pauseur VGD", service: "Journée" },
  "PIDPXJ": { label: "DPX PRCI", service: "Journée" },
  "PIASSJ": { label: "Adj DPX PRCI", service: "Journée" },
  "SD%": { label: "SD", service: "Journée" },
  "F-PRCI": { label: "K-PRCI", service: "Journée" },
  "AFOPRCI": { label: "AFO PRCI", service: "Journée" },
  "CAF": { label: "CAF", service: "Journée" },
  "EIA": { label: "EIA", service: "Journée" },
  "PPRCI": { label: "PPRCI", service: "Journée" },
  "VM": { label: "VM", service: "Journée" },
  "K-PRCI": { label: "K-PRCI", service: "Journée" },
  "A-PRCI": { label: "A-PRCI", service: "Journée" },
  "DISPO": { label: "DISPO", service: "Journée" },
  // PAR — journée
  "PAPAUJ": { label: "Pauseur PAR", service: "Journée" },
  "PADPXJ": { label: "DPX PAR", service: "Journée" },
  "PAASMJ": { label: "ASMTE PAR", service: "Journée" },
  "AFO PAR": { label: "AFO PAR", service: "Journée" },
  "K-PAR": { label: "K-PAR", service: "Journée" },
  "F-PAR": { label: "F-PAR", service: "Journée" },
};
// Regroupe les entrées "postes non tenus" par intitulé de poste (les 3
// variantes M/AM/N d'un même poste comptent ensemble), avec un sous-détail
// par service — un code inconnu (jamais vu dans la table ci-dessus) reste
// affiché tel quel plutôt que de disparaître silencieusement.
function groupPostesNonTenus(parPoste) {
  const groupes = {};
  parPoste.forEach(p => {
    const info = JSCODE_TO_POSTE[p.js_code] || { label: null, service: null };
    const label = info.label || p.js_code;
    if (!groupes[label]) groupes[label] = { label, nb: 0, codes: new Set(), parService: {} };
    const g = groupes[label];
    g.nb += p.nb;
    g.codes.add(p.js_code);
    const service = info.service || "Service inconnu";
    if (!g.parService[service]) g.parService[service] = { service, nb: 0, entries: [] };
    g.parService[service].nb += p.nb;
    g.parService[service].entries.push(...p.entries.map(e => ({ ...e, js_code: p.js_code })));
  });
  return Object.values(groupes).sort((a, b) => b.nb - a.nb);
}
// Code affiché à côté du nom du poste (18/08, demande d'Olivier : "tu met
// le nom du poste avec son code", pour TOUS les postes, pas seulement ceux
// à un seul code) — pour un poste à plusieurs variantes M/AM/N (3 codes
// distincts, ex. PICCL-/PICCLO/PICCLX), le code affiché est leur base
// commune obtenue en retirant le suffixe de vacation (dernier caractère :
// "-"/"O"/"X") plutôt que d'afficher les 3 codes ou aucun.
function codeAffichePoste(codes) {
  const arr = [...codes];
  if (arr.length === 1) return arr[0];
  const bases = new Set(arr.map(c => c.slice(0, -1)));
  return bases.size === 1 ? [...bases][0] : arr.join("/");
}
// En-tête de section collapsible : titre + bouton, protégés contre le
// wrap cassé sur mobile (le titre peut passer sur plusieurs lignes, le
// bouton reste toujours entier sur sa propre ligne plutôt que de voir
// son texte lui-même se couper au milieu — bug signalé par Olivier le
// 18/08 sur un téléphone réel, "Voir le détail par année" cassé en 3
// lignes illisibles faute de flexWrap sur le conteneur).
function SectionHeader({ icon, titre, ouvert, onToggle, labelOuvert = "Voir le détail", labelFerme = "Masquer le détail" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "4px 10px" }}>
      <div style={{ ...sectionTitle, marginBottom: 0, flex: "1 1 180px", minWidth: 0 }}>{icon} {titre}</div>
      {/* 27/08 (test réel en mode sombre) : NAVY.from (#0f4c81) utilisé ici
          en simple COULEUR DE TEXTE sur fond transparent (donc celui de la
          carte) -- devient illisible une fois la carte passée en sombre
          (texte bleu-marine sur fond bleu-marine, exactement le piège déjà
          documenté le 19/08 sur l'accent "actif" ailleurs dans l'appli).
          var(--accent-active) existe précisément pour ce cas -- clair en
          mode clair (même #0a3a63/proche), éclairci en mode sombre. Les
          autres usages de NAVY.from dans ce fichier (boutons année/tri,
          lignes 203/323/327 plus haut) restent inchangés : c'est un
          remplissage plein avec texte blanc, toujours lisible sur les deux
          thèmes. */}
      <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-active)", fontSize: 12, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap", padding: 0 }}>
        {ouvert ? `▲ ${labelFerme}` : `▼ ${labelOuvert}`}
      </button>
    </div>
  );
}
// L'API ne renvoie que les postes avec au moins 1 agent habilité — un poste
// à 0 (ex: DPX PRCI si personne n'est habilité dessus) disparaissait sinon
// silencieusement de la liste, donnant l'impression qu'il avait été oublié.
function completerAvecPostesConnus(rows) {
  const presents = new Set(rows.map(r => r.code_poste));
  const manquants = Object.keys(POSTE_LABELS).filter(c => !presents.has(c)).map(code_poste => ({ code_poste, nbAgents: 0 }));
  return [...rows, ...manquants];
}

function fmtPct(v) { return `${v}%`; }

// 27/08 -- retrofit mode sombre (Olivier : "faut le mode sombre pour sat
// equipe et verifie bien que tu les testes soit lisible en sombre") -- ce
// fichier n'avait jamais été touché lors du chantier dark-mode du 19/08 ni
// de ses suites (0 occurrence de `var(--` avant ce jour). Même convention
// que les autres modules déjà retrofités (FormationView.jsx 25/08) :
// fond/bordure/texte neutres → tokens theme.css, les "îlots" pastel
// auto-suffisants (ligne d'année en cours surlignée plus bas, voir
// CoverageParAnneeTable) gardent leurs couleurs fixes, jamais touchées.
const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 3px var(--shadow-card)" };
const sectionTitle = { fontSize: 14, fontWeight: 800, color: "var(--text-primary)", marginBottom: 10 };

export default function StatsEquipeView() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [triHab, setTriHab] = useState("planning"); // "planning" | "nombre"
  const [tab, setTab] = useState("effectifs"); // "effectifs" | "couverture" | "formation" | "alertes"

  const availableYears = useMemo(() => {
    const cur = new Date().getFullYear();
    return [cur + 1, cur, cur - 1, cur - 2, cur - 3];
  }, []);

  useEffect(() => {
    setLoading(true);
    setErr("");
    api.statsEquipe.get(year)
      .then(setData)
      .catch(() => setErr("Impossible de charger les statistiques d'équipe"))
      .finally(() => setLoading(false));
  }, [year]);

  const pctTempsPlein = data ? Math.max(0, 100 - data.headcounts.pctTempsPartiel) : 100;

  return (
    <div style={{ padding: "12px", maxWidth: 1000, margin: "0 auto", fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>📊 Stat'Equip</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>Statistiques d'équipe — {year}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {availableYears.map(y => (
            <button key={y} onClick={() => setYear(y)}
              style={{
                padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12.5, fontWeight: 700,
                background: year === y ? NAVY.from : "var(--bg-page)",
                color: year === y ? "#fff" : "var(--text-secondary)",
              }}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {err && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 14 }}>⚠️ {err}</div>}
      {loading ? (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>Chargement...</div>
      ) : !data ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Sous-onglets (09/09) -- regroupe les sections ci-dessous en 4
              groupes, affichés un par un. Aucune section n'est modifiée ni
              retirée : chaque bloc ci-dessous est EXACTEMENT le même JSX
              qu'avant ce chantier, juste déplacé sous le bon onglet.
              09/09, suite -- Olivier : "met les onglets sur 2 ligne cest
              moche la" : le `flex + flexWrap:wrap` d'origine enroulait les 4
              boutons en un tas irrégulier (2 largeurs différentes par ligne,
              jamais alignées) une fois qu'ils ne tenaient plus sur une seule
              ligne (375px). Remplacé par une vraie grille (même motif déjà
              utilisé ailleurs sur cette page, ex. les tuiles "Vue
              d'ensemble équipe") : `repeat(auto-fit, minmax(150px, 1fr))`
              calcule tout seul 2 colonnes égales sur mobile (2×150+gap ≈
              306px, tient dans 375px moins le padding de page) et les 4 sur
              une seule ligne dès que la largeur le permet (desktop) --
              jamais de ligne à moitié remplie ni de largeurs disparates. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 6, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 12.5, fontWeight: 700, textAlign: "center",
                  background: tab === t.key ? NAVY.from : "var(--bg-page)",
                  color: tab === t.key ? "#fff" : "var(--text-secondary)",
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "effectifs" && (
            <>
              {/* Vue d'ensemble équipe : effectifs + % temps partiel (visuel dédié, pas un simple chiffre) */}
              <div style={card}>
                <div style={sectionTitle}>Vue d'ensemble équipe</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                  <Tuile label="Agents global" valeur={data.headcounts.totalAgents} />
                  <Tuile label="Agents équipe" valeur={data.headcounts.totalEquipe} sousLabel={`dont ${data.reserveRoulement.actuel.nbReserve} réserve · ${data.reserveRoulement.actuel.nbRoulement} roulement`} />
                  <Tuile label="Réserve régionale" valeur={data.headcounts.totalReserve} sousLabel="compte à part" />
                </div>
                {/* 25/08 (Olivier) : "tu mets en ligne 2 : le decompte des AFO,
                    encadrement et ASFP en dernier" -- grille séparée plutôt qu'un
                    seul auto-fit continu, pour que ces 3 tuiles restent TOUJOURS
                    groupées sur leur propre ligne quelle que soit la largeur
                    d'écran (un seul grid auto-fit n'aurait pas garanti que la
                    "ligne 2" corresponde toujours à ces 3-là). */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 10 }}>
                  <Tuile label="AFO" valeur={data.headcounts.totalAfo} sousLabel="toutes catégories confondues" />
                  <Tuile label="Encadrement" valeur={data.headcounts.totalEncadrement} sousLabel="DPX / Adj DPX — compte à part" />
                  <Tuile label="ASFP" valeur={data.headcounts.totalAsfp} sousLabel="Assistant Formation Pro — compte à part" />
                </div>
                {/* Par grade (18/08, demande d'Olivier : "decompté les Cadre Op
                    [...] Maitrises [...] Maytises 2", puis en suite immédiate :
                    "affine chaque groupe pour mettre un decompte en nombre des
                    agent et reserve regionale [...] tu garde le global par
                    groupe") — axe indépendant des catégories ci-dessus (un agent
                    peut être Cadre Op ET DPX, par exemple), jamais soustrait des
                    autres tuiles. Le total global par groupe est conservé
                    (valeur de la tuile), le détail équipe/réserve régionale est
                    ajouté en sous-label, même principe que "Agents équipe"
                    au-dessus. */}
                <div style={{ borderTop: "1px solid var(--border)", marginTop: 14, paddingTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: .04, marginBottom: 8 }}>Par grade</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                    <Tuile label="Cadre Op (CP6/CO6)" valeur={data.gradesDetail.cadreOp.total} sousLabel={`dont ${data.gradesDetail.cadreOp.equipe} équipe · ${data.gradesDetail.cadreOp.reserve} réserve régionale`} />
                    <Tuile label="Maîtrise (CP5/CO5)" valeur={data.gradesDetail.maitrise.total} sousLabel={`dont ${data.gradesDetail.maitrise.equipe} équipe · ${data.gradesDetail.maitrise.reserve} réserve régionale`} />
                    <Tuile label="Maîtrise 2 (CP4/CO4)" valeur={data.gradesDetail.maitrise2.total} sousLabel={`dont ${data.gradesDetail.maitrise2.equipe} équipe · ${data.gradesDetail.maitrise2.reserve} réserve régionale`} />
                  </div>
                </div>
              </div>

              {/* Réserve / Roulement — historique mensuel, jamais recalculé rétroactivement */}
              <ReserveRoulementSection data={data.reserveRoulement} />

              {/* Âge moyen (09/09, étendu -- mockup validé par Olivier : "tu peux
                  faire ca, sans rien casser" -- évolution par année (même
                  mécanisme que la courbe de couverture) + pyramide des âges
                  Équipe/Réserve régionale, regroupées dans la même carte
                  (même principe que FormationSection : sous-sections avec
                  GroupeLabel plutôt que des cartes séparées, tout concerne le
                  même sujet "âge"). */}
              <div style={card}>
                <div style={sectionTitle}>🎂 Âge moyen (hors Réserve régionale)</div>
                <Tuile label="Âge moyen" valeur={data.ageMoyenHorsReserve.moyenne != null ? `${data.ageMoyenHorsReserve.moyenne} ans` : "—"} sousLabel={`sur ${data.ageMoyenHorsReserve.nbAgentsInclus} agent(s)`} large />
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                  Estimé à partir des 2 premiers chiffres du CP (année de naissance). {data.ageMoyenHorsReserve.nbAgentsExclusParseEchec > 0 && `${data.ageMoyenHorsReserve.nbAgentsExclusParseEchec} agent(s) exclu(s), CP non reconnu.`}
                </div>

                {data.ageMoyenParAnnee && <AgeEvolutionSection data={data.ageMoyenParAnnee} anneeActuelle={year} />}

                {data.agePyramide && (
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <GroupeLabel>Pyramide des âges — Équipe / Réserve régionale</GroupeLabel>
                    <AgePyramide data={data.agePyramide} />
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "couverture" && (
            <>
              {/* Couverture Réserve régionale — tuiles de l'année consultée + évolution
                  par année, réunies dans une seule carte (18/08, Olivier : "tu peux pas
                  ameliorer ca au meme endroit ?" — les 2 cartes séparées faisaient
                  doublon, la ligne surlignée du tableau ci-dessous porte d'ailleurs
                  exactement les mêmes 3 chiffres que les tuiles). */}
              <div style={card}>
                <div style={sectionTitle}>🔁 Couverture des postes par la Réserve régionale</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
                  Part des journées CPS couvertes par la réserve régionale, sur le total des journées importées cette année.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                  <Tuile label="Global" valeur={fmtPct(data.coverageReserve.global.pct)} sousLabel={`${data.coverageReserve.global.numerateur} / ${data.coverageReserve.global.denominateur} j.`} />
                  <Tuile label="PRCI" valeur={fmtPct(data.coverageReserve.PRCI.pct)} sousLabel={`${data.coverageReserve.PRCI.numerateur} / ${data.coverageReserve.PRCI.denominateur} j.`} />
                  <Tuile label="PAR" valeur={fmtPct(data.coverageReserve.PAR.pct)} sousLabel={`${data.coverageReserve.PAR.numerateur} / ${data.coverageReserve.PAR.denominateur} j.`} />
                </div>
                {data.coverageReserveParAnnee && <CoverageParAnneeTable data={data.coverageReserveParAnnee} anneeActuelle={year} />}
              </div>

              {/* Dispo — anonyme, pas de nom d'agent (impossible à attribuer de façon fiable) */}
              <DispoSection data={data.dispo} />
            </>
          )}

          {tab === "formation" && (
            <>
              {/* Formation (27/08, regroupée le même jour -- Olivier : "ce serait
                  pas mieux de regruper dans sat equip les stat de formation ?" /
                  "tu legende bien les choses") : les 2 mécanismes de formation
                  (sessions AFO et étude de poste, structurellement indépendants
                  -- l'un vient de formation_session, l'autre du planning perso)
                  regroupés sous UN SEUL titre "Formation" pour que ce ne soit
                  plus 2 cartes presque homonymes éparpillées dans la page, mais
                  chacun garde son propre sous-titre explicite pour ne jamais
                  laisser croire que c'est la même donnée. */}
              <FormationSection formationInterne={data.formationInterne} etudePoste={data.etudePoste} />

              {/* Habilitations par poste */}
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  <div style={{ ...sectionTitle, marginBottom: 0 }}>🛠️ Agents habilités par poste</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setTriHab("planning")}
                      style={{ padding: "4px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: triHab === "planning" ? NAVY.from : "var(--bg-page)", color: triHab === "planning" ? "#fff" : "var(--text-secondary)" }}>
                      Ordre planning
                    </button>
                    <button onClick={() => setTriHab("nombre")}
                      style={{ padding: "4px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: triHab === "nombre" ? NAVY.from : "var(--bg-page)", color: triHab === "nombre" ? "#fff" : "var(--text-secondary)" }}>
                      Nombre d'agents
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
                  Habilitations actives (table Habilitations) — indépendant du module Formation.
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: .04 }}>
                        <th style={{ padding: "4px 8px", fontWeight: 700 }}>Poste</th>
                        <th style={{ padding: "4px 8px", fontWeight: 700 }}>Agents habilités</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completerAvecPostesConnus(data.habilitationsParPoste).sort((a, b) => triHab === "planning" ? ordrePoste(a.code_poste) - ordrePoste(b.code_poste) : b.nbAgents - a.nbAgents).map(h => (
                        <tr key={h.code_poste} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "6px 8px", fontWeight: 600, color: "var(--text-primary)" }}>{labelPoste(h.code_poste)}</td>
                          <td style={{ padding: "6px 8px", fontWeight: 700, color: "var(--text-primary)" }}>{h.nbAgents}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {tab === "alertes" && (
            <>
              {/* Postes non tenus (11/09, Olivier : ordre demandé -- postes non
                  tenus, congés refusés, puis VT en dernier) */}
              <PostesNonTenusSection data={data.postesNonTenus} year={year} />

              {/* Congés / VT refusés — anonymisés */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
                <div style={card}>
                  <div style={sectionTitle}>🗓️ Congés refusés</div>
                  <Tuile label="Jours refusés (équipe)" valeur={data.congesRefuses.nbJours} sousLabel={`${data.congesRefuses.nbAgentsConcernes} agent(s) concerné(s)`} large />
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Chiffre global anonymisé — aucun détail par agent.</div>
                </div>
                <div style={card}>
                  {/* 29/08 (Olivier) : "deplace le % de temps partiel et met le
                      avec vt refusé. c'est plus loqique" -- les deux parlent de
                      VT (temps partiel), regroupés dans la même carte plutôt que
                      Temps partiel isolé dans "Vue d'ensemble équipe". */}
                  <div style={sectionTitle}>🕒 VT (temps partiel)</div>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <Tuile label="Temps partiel" valeur={fmtPct(data.headcounts.pctTempsPartiel)} sousLabel={`${data.headcounts.nbTempsPartiel} agent(s) · Temps plein ${fmtPct(pctTempsPlein)}`} large />
                    <Tuile label="Jours refusés (équipe)" valeur={data.vtRefuses.nbJours} sousLabel={`${data.vtRefuses.nbAgentsConcernes} agent(s) concerné(s)`} large />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Jours refusés : chiffre global anonymisé — aucun détail par agent.</div>
                </div>
              </div>
            </>
          )}

        </div>
      )}
    </div>
  );
}

function Tuile({ label, valeur, sousLabel, large }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: .04 }}>{label}</div>
      <div style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: large ? 24 : 20, fontWeight: 800, color: "var(--text-primary)" }}>{valeur}</div>
      {sousLabel && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{sousLabel}</div>}
    </div>
  );
}

// Cellule pourcentage+fraction empilée verticalement (plutôt qu'en ligne)
// pour garder chaque colonne étroite sur mobile — le tableau à 4 colonnes
// (Année/Global/PRCI/PAR) débordait sinon facilement à 375px de large.
// `light` (27/08, retrofit mode sombre) : utilisée aussi bien dans une ligne
// normale (texte theme-aware) que dans la ligne "année en cours" surlignée
// en pastel bleu clair fixe (voir CoverageParAnneeTable) -- ce 2e cas a
// besoin d'un texte TOUJOURS foncé, jamais du token qui blanchirait en mode
// sombre sur un fond resté volontairement clair.
function CellPct({ pct, num, den, light }) {
  return (
    <div style={{ lineHeight: 1.25 }}>
      <div style={{ fontWeight: 700, color: light ? "#1e293b" : "var(--text-primary)", fontSize: 12.5 }}>{fmtPct(pct)}</div>
      <div style={{ fontSize: 10, color: light ? "#64748b" : "var(--text-muted)" }}>{num}/{den}</div>
    </div>
  );
}


const MOIS_L = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function ReserveRoulementSection({ data }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div style={card}>
      <SectionHeader icon="🔁" titre="Réserve / Roulement (agents équipe) — historique mensuel" ouvert={ouvert} onToggle={() => setOuvert(v => !v)} labelOuvert="Voir le détail par mois" />
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6 }}>
        Porte uniquement sur les agents équipe — la Réserve régionale est comptée à part. Un changement de statut ne modifie jamais le comptage des mois déjà passés.
      </div>
      {ouvert && (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: .04 }}>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>Mois</th>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>Réserve</th>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>Roulement</th>
              </tr>
            </thead>
            <tbody>
              {data.parMois.map(m => (
                <tr key={m.mois} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 600, color: "var(--text-primary)" }}>{MOIS_L[m.mois - 1]}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 700, color: "var(--text-primary)" }}>{m.nbReserve}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 700, color: "var(--text-primary)" }}>{m.nbRoulement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Couverture Réserve régionale sur plusieurs années (18/08, demande
// d'Olivier : "d'ailleurs fait les stat par anee") — même fenêtre de 5 ans
// que le sélecteur d'année du haut de page, même principe collapsible que
// ReserveRoulementSection ci-dessus.
// Sous-bloc "évolution par année" — nesté DANS la carte "Couverture des postes
// par la Réserve régionale" (18/08, fusionné sur demande d'Olivier, voir plus
// haut), plus de carte/titre séparé, juste un filet + un petit titre pour se
// distinguer des tuiles au-dessus. Repliable, ouvert par défaut (c'est la
// donnée elle-même, pas un détail secondaire).
function CoverageParAnneeTable({ data, anneeActuelle }) {
  const [ouvert, setOuvert] = useState(true);
  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 10 }}>
      <SectionHeader icon="📈" titre="Évolution par année" ouvert={ouvert} onToggle={() => setOuvert(v => !v)} labelOuvert="Voir le détail" />
      {ouvert && (
        <div style={{ marginTop: 10 }}>
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: .04 }}>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>Année</th>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>Global</th>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>PRCI</th>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>PAR</th>
              </tr>
            </thead>
            <tbody>
              {data.map(row => {
                const surlignee = row.annee === anneeActuelle;
                return (
                  <tr key={row.annee} style={{ borderTop: "1px solid var(--border)", background: surlignee ? "#eff6ff" : "transparent" }}>
                    <td style={{ padding: "6px 6px", fontWeight: surlignee ? 800 : 600, color: surlignee ? "#1e293b" : "var(--text-primary)" }}>{row.annee}</td>
                    <td style={{ padding: "6px 6px" }}><CellPct light={surlignee} pct={row.global.pct} num={row.global.numerateur} den={row.global.denominateur} /></td>
                    <td style={{ padding: "6px 6px" }}><CellPct light={surlignee} pct={row.PRCI.pct} num={row.PRCI.numerateur} den={row.PRCI.denominateur} /></td>
                    <td style={{ padding: "6px 6px" }}><CellPct light={surlignee} pct={row.PAR.pct} num={row.PAR.numerateur} den={row.PAR.denominateur} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Évolution de l'âge moyen hors Réserve régionale, par année (09/09, portage
// du mockup validé par Olivier -- "tu peux faire ca, sans rien casser") --
// "même mécanisme" que CoverageEvolutionChart ci-dessus (ligne + points +
// étiquette de fin + survol), appliqué à une seule série -- pas de légende
// nécessaire, le titre du bloc suffit (une série unique n'a rien à
// distinguer). Couleur --age-equipe (violet, theme.css) -- choisie pour ne
// jamais chevaucher les teintes amber/bleu/vert déjà utilisées juste
// au-dessus par la courbe de couverture, sur la même page. Un point sans
// donnée coupe la ligne plutôt que de tracer un faux âge (même principe que
// le trou "aucun import CPS" de la courbe de couverture).
function AgeEvolutionChart({ data, anneeActuelle }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const rows = useMemo(() => [...data].sort((a, b) => a.annee - b.annee), [data]);
  const n = rows.length;
  if (n < 2) return null;

  const W = 560, H = 150;
  const padL = 32, padR = 14, padT = 12, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xAt = (i) => padL + (plotW * i) / (n - 1);
  const colW = plotW / (n - 1);

  const vals = rows.filter(r => r.moyenne != null).map(r => r.moyenne);
  let yMin = 0, yMax = 60;
  if (vals.length) {
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.35, 1);
    yMin = Math.max(0, lo - pad);
    yMax = hi + pad;
    if (yMax - yMin < 2) { yMax += 1; yMin = Math.max(0, yMin - 1); }
  }
  const yAt = (v) => padT + plotH - (plotH * (Math.max(yMin, Math.min(yMax, v)) - yMin)) / (yMax - yMin);

  const points = rows.map((r, i) => (r.moyenne != null ? { i, x: xAt(i), y: yAt(r.moyenne), v: r.moyenne } : null));
  const segmentsOf = (pts) => {
    const segs = []; let cur = [];
    pts.forEach(p => { if (p) cur.push(p); else { if (cur.length) segs.push(cur); cur = []; } });
    if (cur.length) segs.push(cur);
    return segs;
  };
  const last = [...points].reverse().find(Boolean);
  const yTicks = [0, 0.5, 1].map(f => Math.round((yMin + (yMax - yMin) * f) * 10) / 10);

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ position: "relative", width: W }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Âge moyen hors Réserve régionale, évolution par année">
            {yTicks.map((t, ti) => (
              <g key={ti}>
                <line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke="var(--border)" strokeWidth="1" />
                <text x={padL - 6} y={yAt(t) + 3} textAnchor="end" fontSize="9.5" fill="var(--text-muted)">{t} ans</text>
              </g>
            ))}
            {hoverIdx != null && (
              <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={padT} y2={padT + plotH} stroke="var(--text-muted)" strokeWidth="1" opacity="0.5" />
            )}
            {segmentsOf(points).map((seg, si) => (
              <polyline key={si} points={seg.map(p => `${p.x},${p.y}`).join(" ")}
                fill="none" stroke="var(--age-equipe)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {points.map((p, i) => p && (
              <circle key={i} cx={p.x} cy={p.y} r={hoverIdx === i ? 5.5 : 4}
                fill="var(--age-equipe)" stroke="var(--bg-card)" strokeWidth="2" style={{ transition: "r .1s" }} />
            ))}
            {last && (
              <text x={last.x + 10} y={last.y + 3} fontSize="10.5" fontWeight="700" fill="var(--text-primary)">{last.v} ans</text>
            )}
            {rows.map((r, i) => (
              <text key={r.annee} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="10.5"
                fontWeight={r.annee === anneeActuelle ? 800 : 600}
                fill={r.annee === anneeActuelle ? "var(--text-primary)" : "var(--text-secondary)"}>{r.annee}</text>
            ))}
            {rows.map((r, i) => (
              <rect key={`hit-${r.annee}`} x={xAt(i) - colW / 2} y={padT} width={colW} height={plotH}
                fill="transparent" style={{ cursor: "pointer" }} tabIndex={0} role="button"
                aria-label={`${r.annee} : âge moyen ${r.moyenne != null ? `${r.moyenne} ans` : "aucune donnée"}`}
                onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}
                onFocus={() => setHoverIdx(i)} onBlur={() => setHoverIdx(null)} />
            ))}
          </svg>
          {hoverIdx != null && (
            <div style={{
              position: "absolute", top: 4,
              left: `${Math.min(Math.max((xAt(hoverIdx) / W) * 100, 18), 82)}%`,
              transform: "translateX(-50%)", background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "6px 10px", boxShadow: "0 2px 8px var(--shadow-card)",
              pointerEvents: "none", minWidth: 110, zIndex: 2,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-primary)", marginBottom: 2 }}>{rows[hoverIdx].annee}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {rows[hoverIdx].moyenne != null ? <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{rows[hoverIdx].moyenne} ans</span> : "—"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgeEvolutionSection({ data, anneeActuelle }) {
  const [ouvert, setOuvert] = useState(true);
  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 10 }}>
      <SectionHeader icon="📈" titre="Évolution par année" ouvert={ouvert} onToggle={() => setOuvert(v => !v)} labelOuvert="Voir le détail" />
      {ouvert && (
        <div style={{ marginTop: 10 }}>
          <AgeEvolutionChart data={data} anneeActuelle={anneeActuelle} />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: .04 }}>
                  <th style={{ padding: "4px 8px", fontWeight: 700 }}>Année</th>
                  <th style={{ padding: "4px 8px", fontWeight: 700 }}>Âge moyen</th>
                  <th style={{ padding: "4px 8px", fontWeight: 700 }}>Agents inclus</th>
                </tr>
              </thead>
              <tbody>
                {data.map(row => {
                  const surlignee = row.annee === anneeActuelle;
                  return (
                    <tr key={row.annee} style={{ borderTop: "1px solid var(--border)", background: surlignee ? "#eff6ff" : "transparent" }}>
                      <td style={{ padding: "6px 6px", fontWeight: surlignee ? 800 : 600, color: surlignee ? "#1e293b" : "var(--text-primary)" }}>{row.annee}</td>
                      <td style={{ padding: "6px 6px", fontWeight: surlignee ? 800 : 700, color: surlignee ? "#1e293b" : "var(--text-primary)" }}>{row.moyenne != null ? `${row.moyenne} ans` : "—"}</td>
                      <td style={{ padding: "6px 6px", color: surlignee ? "#64748b" : "var(--text-secondary)" }}>{row.nbAgentsInclus}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Pyramide des âges Équipe / Réserve régionale (09/09, portage du mockup) --
// barres miroir par tranche, Équipe à gauche / Réserve régionale à droite.
// Couleurs --age-equipe/--age-reserve (violet/rose, theme.css), validées
// CVD via scripts/validate_palette.js -- choisies pour ne jamais chevaucher
// les teintes amber/bleu/vert déjà utilisées par la courbe de couverture
// plus haut sur la même page (un premier candidat partageait par erreur
// l'amber du "Global" avec la Réserve régionale ici, source de confusion).
// overflowX:auto + minWidth, même convention que le reste du fichier pour
// rester lisible sur mobile sans faire rétrécir le texte sous le lisible.
function AgePyramide({ data }) {
  const brackets = data.brackets || [];
  const maxV = Math.max(1, ...brackets.map(b => Math.max(b.equipe, b.reserve)));
  const barMax = 74;
  const rowH = 20;
  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--age-equipe)", display: "inline-block" }} />
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>Équipe ({data.totalEquipe})</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--age-reserve)", display: "inline-block" }} />
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>Réserve régionale ({data.totalReserve})</span>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "stretch", minWidth: 300 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
            {brackets.map(b => (
              <div key={b.label} style={{ height: rowH, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", fontFamily: "ui-monospace,Consolas,monospace", minWidth: 16, textAlign: "right" }}>{b.equipe || ""}</span>
                <div style={{ height: 13, borderRadius: "3px 0 0 3px", background: "var(--age-equipe)", width: b.equipe > 0 ? Math.max(2, (b.equipe / maxV) * barMax) : 0 }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "0 10px", flexShrink: 0, gap: 3 }}>
            {brackets.map(b => (
              <div key={b.label} style={{ fontSize: 10.5, color: "var(--text-secondary)", fontWeight: 600, height: rowH, display: "flex", alignItems: "center", justifyContent: "center" }}>{b.label}</div>
            ))}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
            {brackets.map(b => (
              <div key={b.label} style={{ height: rowH, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ height: 13, borderRadius: "0 3px 3px 0", background: "var(--age-reserve)", width: b.reserve > 0 ? Math.max(2, (b.reserve / maxV) * barMax) : 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", fontFamily: "ui-monospace,Consolas,monospace", minWidth: 16 }}>{b.reserve || ""}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
        Répartition par tranche d'âge, estimée comme la moyenne ci-dessus (2 premiers chiffres du CP). Encadrement (DPX/Adj DPX) exclu des deux colonnes, compté à part.
      </div>
    </div>
  );
}

// Dispo (16/08, étendu 23/08) — 2 sources désormais, toujours anonymes côté
// affichage (aucun nom/CP, même pour la source "identifiée" côté backend --
// voir statsEquipeController.js) :
// - "identifie" : DISPO réel (CPS Officiel) + DISPO sélectionné dans le
//   perso, dédupliqués entre eux par agent+date côté backend.
// - "anonyme" : mécanisme d'origine, message libre CPS contenant "Dispo",
//   structurellement jamais rattachable à un agent (agents_concernes vide).
function DispoSection({ data }) {
  const [ouvert, setOuvert] = useState(false);
  const identifie = data.identifie || { total: 0, parDate: [] };
  const anonyme = data.anonyme || { total: 0, entries: [] };
  return (
    <div style={card}>
      <SectionHeader icon="📢" titre="Dispo" ouvert={ouvert} onToggle={() => setOuvert(v => !v)} />
      <Tuile label="Jours signalés (total)" valeur={data.total} large />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <Tuile label="Planning (CPS/perso)" valeur={identifie.total} />
        <Tuile label="Message libre" valeur={anonyme.total} />
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
        Journées où un agent est disponible sans poste à tenir — soit détecté directement (DISPO réel importé en CPS Officiel, ou sélectionné dans le planning perso), soit signalé par message libre dans CPS Officiel. Chiffre toujours anonymisé, aucun nom.
      </div>
      {ouvert && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {identifie.parDate.length > 0 && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 4 }}>Planning (CPS/perso)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {identifie.parDate.map((e, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: "var(--text-secondary)", borderTop: "1px solid var(--border)", paddingTop: 4 }}>
                    {fmtDate(e.date_jour)} — {e.nb} agent{e.nb > 1 ? "s" : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
          {anonyme.entries.length > 0 && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 4 }}>Message libre</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {anonyme.entries.map((e, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: "var(--text-secondary)", borderTop: "1px solid var(--border)", paddingTop: 4 }}>
                    {fmtDate(e.date_jour)}{e.motif ? ` — ${e.motif}` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Postes non tenus -- carte de chaleur poste/mois (09/09, proposition d'Olivier
// après un mockup validé : "montre moi a quoi ca pourrait ressembler ?" puis
// "mais on perds lla liste avec les dates ?" -- corrigé dans le mockup avant
// d'être porté ici : la heatmap est une VUE SUPPLÉMENTAIRE au-dessus des mêmes
// données, jamais un remplacement -- la liste détaillée d'aujourd'hui (groupée
// par poste puis service, chaque occurrence avec sa date+motif) reste
// intégralement disponible via l'onglet "Liste complète", et cliquer une case
// y saute directement, filtrée sur ce poste/mois précis, avec un surlignage
// temporaire. Instruction finale : "fait ca et on voit si on garde" -- trial
// isolé à cette seule section, à revenir en arrière si jugé non concluant.
const HEAT_MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

function bucketHeat(v) { return v <= 0 ? 0 : v >= 5 ? 5 : v; }

// Rampe séquentielle 0-5 -- direction du dégradé volontairement différente
// clair/sombre (plus foncé = plus de signalements en clair, plus clair = plus
// de signalements en sombre). Bug trouvé en testant en conditions réelles :
// une couleur de texte FIXE par palier (ex. v5 toujours blanc) devenait
// illisible une fois la rampe inversée en sombre (v5 y est la couleur la
// PLUS CLAIRE, texte blanc dessus = ~1.4:1) -- chaque palier a donc son
// propre token de texte (--cell-N-text, theme.css), calculé pour sa vraie
// couleur de fond dans le thème courant, jamais un hex figé ici.
function heatCellStyle(v) {
  const b = bucketHeat(v);
  if (b === 0) return { background: "var(--cell-0)", border: "1px solid var(--cell-0-border)", color: "var(--text-muted)", fontWeight: 500 };
  const parPalier = {
    1: { background: "var(--cell-1)", color: "var(--cell-1-text)" },
    2: { background: "var(--cell-2)", color: "var(--cell-2-text)" },
    3: { background: "var(--cell-3)", color: "var(--cell-3-text)" },
    4: { background: "var(--cell-4)", color: "var(--cell-4-text)" },
    5: { background: "var(--cell-5)", color: "var(--cell-5-text)" },
  };
  return { ...parPalier[b], border: "1px solid transparent", fontWeight: 700 };
}

// Reprend les groupes déjà construits par groupPostesNonTenus (par poste,
// détail par service) pour en dériver les lignes de la heatmap : famille
// déduite du préfixe du 1er code (PI=PRCI, PA=PAR -- fiable, un même poste ne
// mélange jamais les deux familles), entrées aplaties (tous services
// confondus) pour le décompte mensuel ET pour la liste filtrée par mois lors
// d'un clic sur une case.
function buildHeatRows(groupes) {
  return groupes.map(g => {
    const codes = [...g.codes];
    const famille = codes[0]?.startsWith("PA") ? "par" : "prci";
    const entries = [];
    Object.values(g.parService).forEach(s => {
      s.entries.forEach(e => entries.push({ ...e, service: s.service }));
    });
    const values = Array(12).fill(0);
    entries.forEach(e => {
      const m = parseInt(String(e.date_jour).slice(5, 7), 10) - 1;
      if (m >= 0 && m < 12) values[m]++;
    });
    return { label: g.label, codeAffiche: codeAffichePoste(g.codes), famille, nb: g.nb, entries, values };
  });
}

function PostesNonTenusSection({ data, year }) {
  const [ouvert, setOuvert] = useState(false);
  const [vue, setVue] = useState("grid"); // "grid" | "liste"
  const [filtre, setFiltre] = useState(null); // {label, month} -- posé au clic sur une case
  const [hoverCell, setHoverCell] = useState(null); // {label, month}
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [highlightLabel, setHighlightLabel] = useState(null);
  const posteRefs = useRef({});

  const groupes = useMemo(() => groupPostesNonTenus(data.parPoste), [data.parPoste]);
  const heatRows = useMemo(() => buildHeatRows(groupes), [groupes]);
  // Ligne d'agrégat "Total équipe" -- jamais dans la même échelle colorée que
  // les cellules (magnitude bien plus grande, mélanger les deux tromperait
  // l'oeil), gardée en style neutre non chauffé.
  const monthTotals = useMemo(() => HEAT_MOIS.map((_, m) => heatRows.reduce((s, r) => s + r.values[m], 0)), [heatRows]);

  function ouvrirDansListe(label, month) {
    setVue("liste");
    setFiltre({ label, month });
    setHoverCell(null);
    requestAnimationFrame(() => {
      const el = posteRefs.current[label];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightLabel(label);
        setTimeout(() => setHighlightLabel(l => (l === label ? null : l)), 1500);
      }
    });
  }

  const cellDetail = hoverCell
    ? (heatRows.find(r => r.label === hoverCell.label)?.entries.filter(
        e => parseInt(String(e.date_jour).slice(5, 7), 10) - 1 === hoverCell.month
      ) || [])
    : [];

  return (
    <div style={card}>
      <SectionHeader icon="⚠️" titre="Postes non tenus (signalements manuels)" ouvert={ouvert} onToggle={() => setOuvert(v => !v)} />
      <Tuile label="Total" valeur={data.total} large />
      {ouvert && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <button onClick={() => setVue("grid")}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", fontSize: 11.5, fontWeight: 700, background: vue === "grid" ? "var(--accent-active)" : "var(--bg-page)", color: vue === "grid" ? "#fff" : "var(--text-secondary)" }}>
              🔥 Carte de chaleur
            </button>
            <button onClick={() => { setVue("liste"); setFiltre(null); setHoverCell(null); }}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", fontSize: 11.5, fontWeight: 700, background: vue === "liste" ? "var(--accent-active)" : "var(--bg-page)", color: vue === "liste" ? "#fff" : "var(--text-secondary)" }}>
              📋 Liste complète
            </button>
          </div>

          {vue === "grid" ? (
            <>
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "140px repeat(12, 38px) 52px", gap: 3, minWidth: 720, alignItems: "stretch" }}>
                  <div />
                  {HEAT_MOIS.map(m => (
                    <div key={m} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textAlign: "center", paddingBottom: 6, textTransform: "uppercase", letterSpacing: .03 }}>{m}</div>
                  ))}
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", textAlign: "center", paddingBottom: 6, textTransform: "uppercase", letterSpacing: .03 }}>Total</div>

                  {heatRows.map(row => (
                    <Fragment key={row.label}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: "var(--text-primary)", paddingRight: 8, minWidth: 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: row.famille === "prci" ? "var(--prci)" : "var(--par)" }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                      </div>
                      {row.values.map((v, m) => {
                        const isHover = hoverCell?.label === row.label && hoverCell?.month === m;
                        return (
                          <div key={m} tabIndex={0} role="button"
                            aria-label={`${row.label}, ${HEAT_MOIS[m]} — ${v} fois`}
                            onMouseEnter={e => { setHoverCell({ label: row.label, month: m }); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                            onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setHoverCell(null)}
                            onFocus={e => { const r = e.target.getBoundingClientRect(); setHoverCell({ label: row.label, month: m }); setTooltipPos({ x: r.left, y: r.bottom }); }}
                            onBlur={() => setHoverCell(null)}
                            onClick={() => ouvrirDansListe(row.label, m)}
                            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrirDansListe(row.label, m); } }}
                            style={{
                              position: "relative", borderRadius: 6, minHeight: 30, display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 11, cursor: "pointer", transition: "transform .1s",
                              transform: isHover ? "scale(1.1)" : "scale(1)", zIndex: isHover ? 3 : 1,
                              outline: isHover ? "2px solid var(--accent-active)" : "none", outlineOffset: 1,
                              ...heatCellStyle(v),
                            }}>
                            {v > 0 ? v : ""}
                          </div>
                        );
                      })}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 800, color: "var(--text-primary)", background: "var(--bg-page)", borderRadius: 6, border: "1px solid var(--border)" }}>
                        {row.nb}
                      </div>
                    </Fragment>
                  ))}

                  <div style={{ gridColumn: "1 / -1", height: 1, background: "var(--border)", margin: "6px 0 3px" }} />
                  <div style={{ display: "flex", alignItems: "center", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>Total équipe</div>
                  {monthTotals.map((t, m) => (
                    <div key={m} style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "var(--text-primary)", background: "var(--bg-page)", border: "1px dashed var(--border)", borderRadius: 6, minHeight: 26 }}>{t}</div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 800, color: "#fff", background: "var(--accent-active)", borderRadius: 6 }}>
                    {monthTotals.reduce((a, b) => a + b, 0)}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>💡 Clique une case pour voir ses dates et motifs exacts dans la liste complète.</div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Fréquence :</span>
                <div style={{ display: "flex", gap: 2 }}>
                  {[0, 1, 2, 3, 4, 5].map(n => (
                    <span key={n} title={n === 5 ? "5+" : String(n)} style={{ width: 20, height: 13, borderRadius: 3, display: "inline-block", ...heatCellStyle(n) }} />
                  ))}
                </div>
                <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>0 → 5 fois ou plus dans le mois</span>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto", fontSize: 11, color: "var(--text-secondary)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--prci)" }} /> PRCI</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--par)" }} /> PAR</span>
                </div>
              </div>

              {hoverCell && (
                <div style={{ position: "fixed", left: tooltipPos.x + 14, top: tooltipPos.y + 14, zIndex: 50, background: "var(--tooltip-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", boxShadow: "0 8px 24px var(--shadow-card)", fontSize: 11.5, minWidth: 190, maxWidth: 230, pointerEvents: "none" }}>
                  <div style={{ fontWeight: 800, color: "var(--text-primary)", marginBottom: 2, fontSize: 12.5 }}>{hoverCell.label}</div>
                  <div style={{ color: "var(--text-secondary)", marginBottom: 6 }}>{HEAT_MOIS[hoverCell.month]} {year} — {cellDetail.length} fois</div>
                  {cellDetail.length ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {cellDetail.slice(0, 4).map((e, i) => (
                        <div key={i} style={{ color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span>{e.motif || "Motif non précisé"}</span><b style={{ color: "var(--text-primary)", fontWeight: 700 }}>{fmtDate(e.date_jour)}</b>
                        </div>
                      ))}
                      {cellDetail.length > 4 && <div style={{ color: "var(--text-muted)" }}>… +{cellDetail.length - 4} autre(s)</div>}
                    </div>
                  ) : (
                    <div style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Aucun signalement ce mois-ci</div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div>
              {filtre && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 13px", marginBottom: 14, fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
                  <span>📍 Filtré : {filtre.label} — {HEAT_MOIS[filtre.month]} {year}</span>
                  <button onClick={() => setFiltre(null)} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent-active)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>✕ Voir tout</button>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {heatRows.filter(r => !filtre || r.label === filtre.label).map(row => {
                  const entriesFiltrees = filtre
                    ? row.entries.filter(e => parseInt(String(e.date_jour).slice(5, 7), 10) - 1 === filtre.month)
                    : row.entries;
                  const parService = {};
                  entriesFiltrees.forEach(e => {
                    if (!parService[e.service]) parService[e.service] = { service: e.service, nb: 0, entries: [] };
                    parService[e.service].nb++;
                    parService[e.service].entries.push(e);
                  });
                  return (
                    <div key={row.label} ref={el => { posteRefs.current[row.label] = el; }}
                      style={{ borderTop: "1px solid var(--border)", paddingTop: 8, borderRadius: 6, transition: "background .3s", background: highlightLabel === row.label ? "rgba(59,130,246,.15)" : "transparent" }}>
                      <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 12.5, marginBottom: 6 }}>
                        {row.label} ({row.codeAffiche}) — {filtre ? `${entriesFiltrees.length} ce mois-ci` : `${row.nb} fois`}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
                        {Object.values(parService).sort((a, b) => b.nb - a.nb).map(s => (
                          <div key={s.service}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)" }}>
                              {s.service} — {s.nb} fois
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 10, marginTop: 2 }}>
                              {s.entries.map((e, i) => (
                                <div key={i} style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                  {fmtDate(e.date_jour)}{e.motif ? ` — ${e.motif}` : ""}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {!entriesFiltrees.length && <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>Aucun signalement</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  const [a, m, j] = String(iso).slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

// Groupe titre pour un sous-bloc de FormationSection (label en majuscules,
// même style que les libellés de Tuile, pour bien séparer visuellement les
// 2 mécanismes sans dupliquer une carte entière par mécanisme).
function GroupeLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: .3, textTransform: "uppercase", marginBottom: 6 }}>{children}</div>;
}

// Formation (27/08, regroupée le même jour -- Olivier : "ce serait pas mieux
// de regruper dans sat equip les stat de formation ?", puis "tu legende bien
// les choses") : réunit 2 mécanismes structurellement indépendants sous un
// même titre "Formation" -- sessions organisées par un AFO
// (formation_session, jamais nominatif ici) et étude de poste (planning
// perso, planning_periode.etude_poste) -- chacun garde son propre sous-titre
// en majuscules pour qu'on ne confonde jamais les deux données. Seule
// l'étude de poste a un détail par poste (repliable, même principe que
// PostesNonTenusSection) -- la formation interne n'a pas cette granularité
// côté backend, juste ses 2 tuiles globales.
function FormationSection({ formationInterne, etudePoste }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div style={card}>
      <SectionHeader icon="🎓" titre="Formation" ouvert={ouvert} onToggle={() => setOuvert(v => !v)} labelOuvert="Voir le détail par poste (étude)" />

      <div style={{ marginTop: 10 }}>
        <GroupeLabel>Sessions AFO (formation interne)</GroupeLabel>
        <div style={{ display: "flex", gap: 20 }}>
          <Tuile label="Jours de formation" valeur={formationInterne.nbJours} large />
          <Tuile label="Agents formés" valeur={formationInterne.nbAgentsFormes} sousLabel={`${formationInterne.pctAgentsFormes ?? 0}% des agents cette année`} large />
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <GroupeLabel>Étude de poste (planning perso)</GroupeLabel>
        <div style={{ display: "flex", gap: 20 }}>
          <Tuile label="Jours d'étude" valeur={etudePoste.total.nbJours} large />
          <Tuile label="Agents formés" valeur={etudePoste.total.nbAgents} large />
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Formation physique en double avec un titulaire — chiffres anonymisés, aucun nom.</div>
        {ouvert && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {etudePoste.parPoste.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Aucune journée d'étude de poste cette année.</div>
            ) : etudePoste.parPoste.map(p => (
              <div key={p.code_poste} style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 12.5 }}>{labelPosteEtude(p.code_poste)}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 600 }}>{p.nbAgents} agent(s) formé(s) · {p.nbJours} jour(s)</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
