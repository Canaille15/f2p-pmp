import { useState, useEffect, useMemo } from "react";
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
      <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", color: NAVY.from, fontSize: 12, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap", padding: 0 }}>
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

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,.05)" };
const sectionTitle = { fontSize: 14, fontWeight: 800, color: "#1e293b", marginBottom: 10 };

export default function StatsEquipeView() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [triHab, setTriHab] = useState("planning"); // "planning" | "nombre"

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
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1e293b" }}>📊 Stat'Equip</div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>Statistiques d'équipe — {year}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {availableYears.map(y => (
            <button key={y} onClick={() => setYear(y)}
              style={{
                padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12.5, fontWeight: 700,
                background: year === y ? NAVY.from : "#f1f5f9",
                color: year === y ? "#fff" : "#64748b",
              }}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {err && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 14 }}>⚠️ {err}</div>}
      {loading ? (
        <div style={{ textAlign: "center", color: "#64748b", padding: 40 }}>Chargement...</div>
      ) : !data ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Vue d'ensemble équipe : effectifs + % temps partiel (visuel dédié, pas un simple chiffre) */}
          <div style={card}>
            <div style={sectionTitle}>Vue d'ensemble équipe</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <Tuile label="Agents global" valeur={data.headcounts.totalAgents} />
              <Tuile label="Agents équipe" valeur={data.headcounts.totalEquipe} sousLabel={`dont ${data.reserveRoulement.actuel.nbReserve} réserve · ${data.reserveRoulement.actuel.nbRoulement} roulement`} />
              <Tuile label="Réserve régionale" valeur={data.headcounts.totalReserve} sousLabel="compte à part" />
              <Tuile label="Encadrement" valeur={data.headcounts.totalEncadrement} sousLabel="DPX / Adj DPX — compte à part" />
              <Tuile label="AFO" valeur={data.headcounts.totalAfo} sousLabel="toutes catégories confondues" />
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 11, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .04 }}>Temps partiel</div>
                  <div style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: 15, fontWeight: 800, color: "#1e293b" }}>{fmtPct(data.headcounts.pctTempsPartiel)}</div>
                </div>
                <Barre pct={data.headcounts.pctTempsPartiel} />
                <div style={{ fontSize: 10.5, color: "#94a3b8" }}>Temps plein {fmtPct(pctTempsPlein)}</div>
              </div>
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
            <div style={{ borderTop: "1px solid #f1f5f9", marginTop: 14, paddingTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .04, marginBottom: 8 }}>Par grade</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                <Tuile label="Cadre Op (CP6/CO6)" valeur={data.gradesDetail.cadreOp.total} sousLabel={`dont ${data.gradesDetail.cadreOp.equipe} équipe · ${data.gradesDetail.cadreOp.reserve} réserve régionale`} />
                <Tuile label="Maîtrise (CP5/CO5)" valeur={data.gradesDetail.maitrise.total} sousLabel={`dont ${data.gradesDetail.maitrise.equipe} équipe · ${data.gradesDetail.maitrise.reserve} réserve régionale`} />
                <Tuile label="Maîtrise 2 (CP4/CO4)" valeur={data.gradesDetail.maitrise2.total} sousLabel={`dont ${data.gradesDetail.maitrise2.equipe} équipe · ${data.gradesDetail.maitrise2.reserve} réserve régionale`} />
              </div>
            </div>
          </div>

          {/* Réserve / Roulement — historique mensuel, jamais recalculé rétroactivement */}
          <ReserveRoulementSection data={data.reserveRoulement} />

          {/* Couverture Réserve régionale — tuiles de l'année consultée + évolution
              par année, réunies dans une seule carte (18/08, Olivier : "tu peux pas
              ameliorer ca au meme endroit ?" — les 2 cartes séparées faisaient
              doublon, la ligne surlignée du tableau ci-dessous porte d'ailleurs
              exactement les mêmes 3 chiffres que les tuiles). */}
          <div style={card}>
            <div style={sectionTitle}>🔁 Couverture des postes par la Réserve régionale</div>
            <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 10 }}>
              Part des journées CPS couvertes par la réserve régionale, sur le total des journées importées cette année.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <Tuile label="Global" valeur={fmtPct(data.coverageReserve.global.pct)} sousLabel={`${data.coverageReserve.global.numerateur} / ${data.coverageReserve.global.denominateur} j.`} />
              <Tuile label="PRCI" valeur={fmtPct(data.coverageReserve.PRCI.pct)} sousLabel={`${data.coverageReserve.PRCI.numerateur} / ${data.coverageReserve.PRCI.denominateur} j.`} />
              <Tuile label="PAR" valeur={fmtPct(data.coverageReserve.PAR.pct)} sousLabel={`${data.coverageReserve.PAR.numerateur} / ${data.coverageReserve.PAR.denominateur} j.`} />
            </div>
            {data.coverageReserveParAnnee && <CoverageParAnneeTable data={data.coverageReserveParAnnee} anneeActuelle={year} />}
          </div>

          {/* Congés / VT refusés — anonymisés */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <div style={card}>
              <div style={sectionTitle}>🗓️ Congés refusés</div>
              <Tuile label="Jours refusés (équipe)" valeur={data.congesRefuses.nbJours} sousLabel={`${data.congesRefuses.nbAgentsConcernes} agent(s) concerné(s)`} large />
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>Chiffre global anonymisé — aucun détail par agent.</div>
            </div>
            <div style={card}>
              <div style={sectionTitle}>🕒 VT refusés</div>
              <Tuile label="Jours refusés (équipe)" valeur={data.vtRefuses.nbJours} sousLabel={`${data.vtRefuses.nbAgentsConcernes} agent(s) concerné(s)`} large />
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>Chiffre global anonymisé — aucun détail par agent.</div>
            </div>
          </div>

          {/* Dispo — anonyme, pas de nom d'agent (impossible à attribuer de façon fiable) */}
          <DispoSection data={data.dispo} />

          {/* Postes non tenus */}
          <PostesNonTenusSection data={data.postesNonTenus} />

          {/* Âge moyen + Formation interne */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <div style={card}>
              <div style={sectionTitle}>🎂 Âge moyen (hors Réserve régionale)</div>
              <Tuile label="Âge moyen" valeur={data.ageMoyenHorsReserve.moyenne != null ? `${data.ageMoyenHorsReserve.moyenne} ans` : "—"} sousLabel={`sur ${data.ageMoyenHorsReserve.nbAgentsInclus} agent(s)`} large />
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                Estimé à partir des 2 premiers chiffres du CP (année de naissance). {data.ageMoyenHorsReserve.nbAgentsExclusParseEchec > 0 && `${data.ageMoyenHorsReserve.nbAgentsExclusParseEchec} agent(s) exclu(s), CP non reconnu.`}
              </div>
            </div>
            <div style={card}>
              <div style={sectionTitle}>🎓 Formation interne</div>
              <div style={{ display: "flex", gap: 20 }}>
                <Tuile label="Jours de formation" valeur={data.formationInterne.nbJours} large />
                <Tuile label="Agents formés" valeur={data.formationInterne.nbAgentsFormes} large />
              </div>
            </div>
          </div>

          {/* Habilitations par poste */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <div style={{ ...sectionTitle, marginBottom: 0 }}>🛠️ Agents habilités par poste</div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setTriHab("planning")}
                  style={{ padding: "4px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: triHab === "planning" ? NAVY.from : "#f1f5f9", color: triHab === "planning" ? "#fff" : "#64748b" }}>
                  Ordre planning
                </button>
                <button onClick={() => setTriHab("nombre")}
                  style={{ padding: "4px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: triHab === "nombre" ? NAVY.from : "#f1f5f9", color: triHab === "nombre" ? "#fff" : "#64748b" }}>
                  Nombre d'agents
                </button>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 10 }}>
              Habilitations actives (table Habilitations) — indépendant du module Formation.
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#94a3b8", fontSize: 10.5, textTransform: "uppercase", letterSpacing: .04 }}>
                    <th style={{ padding: "4px 8px", fontWeight: 700 }}>Poste</th>
                    <th style={{ padding: "4px 8px", fontWeight: 700 }}>Agents habilités</th>
                  </tr>
                </thead>
                <tbody>
                  {completerAvecPostesConnus(data.habilitationsParPoste).sort((a, b) => triHab === "planning" ? ordrePoste(a.code_poste) - ordrePoste(b.code_poste) : b.nbAgents - a.nbAgents).map(h => (
                    <tr key={h.code_poste} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 600, color: "#334155" }}>{labelPoste(h.code_poste)}</td>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: "#1e293b" }}>{h.nbAgents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function Tuile({ label, valeur, sousLabel, large }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .04 }}>{label}</div>
      <div style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: large ? 24 : 20, fontWeight: 800, color: "#1e293b" }}>{valeur}</div>
      {sousLabel && <div style={{ fontSize: 11, color: "#64748b" }}>{sousLabel}</div>}
    </div>
  );
}

// Cellule pourcentage+fraction empilée verticalement (plutôt qu'en ligne)
// pour garder chaque colonne étroite sur mobile — le tableau à 4 colonnes
// (Année/Global/PRCI/PAR) débordait sinon facilement à 375px de large.
function CellPct({ pct, num, den }) {
  return (
    <div style={{ lineHeight: 1.25 }}>
      <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 12.5 }}>{fmtPct(pct)}</div>
      <div style={{ fontSize: 10, color: "#94a3b8" }}>{num}/{den}</div>
    </div>
  );
}

function Barre({ pct }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ height: 8, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${clamped}%`, borderRadius: 999, background: NAVY.from, transition: "width .2s ease" }} />
    </div>
  );
}

const MOIS_L = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function ReserveRoulementSection({ data }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div style={card}>
      <SectionHeader icon="🔁" titre="Réserve / Roulement (agents équipe) — historique mensuel" ouvert={ouvert} onToggle={() => setOuvert(v => !v)} labelOuvert="Voir le détail par mois" />
      <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 6 }}>
        Porte uniquement sur les agents équipe — la Réserve régionale est comptée à part. Un changement de statut ne modifie jamais le comptage des mois déjà passés.
      </div>
      {ouvert && (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#94a3b8", fontSize: 10.5, textTransform: "uppercase", letterSpacing: .04 }}>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>Mois</th>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>Réserve</th>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>Roulement</th>
              </tr>
            </thead>
            <tbody>
              {data.parMois.map(m => (
                <tr key={m.mois} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 600, color: "#334155" }}>{MOIS_L[m.mois - 1]}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 700, color: "#1e293b" }}>{m.nbReserve}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 700, color: "#1e293b" }}>{m.nbRoulement}</td>
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
    <div style={{ borderTop: "1px solid #f1f5f9", marginTop: 12, paddingTop: 10 }}>
      <SectionHeader icon="📈" titre="Évolution par année" ouvert={ouvert} onToggle={() => setOuvert(v => !v)} labelOuvert="Voir le détail" />
      {ouvert && (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#94a3b8", fontSize: 10.5, textTransform: "uppercase", letterSpacing: .04 }}>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>Année</th>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>Global</th>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>PRCI</th>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>PAR</th>
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.annee} style={{ borderTop: "1px solid #f1f5f9", background: row.annee === anneeActuelle ? "#eff6ff" : "transparent" }}>
                  <td style={{ padding: "6px 6px", fontWeight: row.annee === anneeActuelle ? 800 : 600, color: "#334155" }}>{row.annee}</td>
                  <td style={{ padding: "6px 6px" }}><CellPct pct={row.global.pct} num={row.global.numerateur} den={row.global.denominateur} /></td>
                  <td style={{ padding: "6px 6px" }}><CellPct pct={row.PRCI.pct} num={row.PRCI.numerateur} den={row.PRCI.denominateur} /></td>
                  <td style={{ padding: "6px 6px" }}><CellPct pct={row.PAR.pct} num={row.PAR.numerateur} den={row.PAR.denominateur} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DispoSection({ data }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div style={card}>
      <SectionHeader icon="📢" titre="Dispo" ouvert={ouvert} onToggle={() => setOuvert(v => !v)} />
      <Tuile label="Jours signalés" valeur={data.total} large />
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
        Journées où un agent présent est signalé dans le planning CPS Officiel "Dispo" par message libre — chiffre anonymisé, aucun nom (non attribuable de façon fiable).
      </div>
      {ouvert && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 3 }}>
          {data.entries.map((e, i) => (
            <div key={i} style={{ fontSize: 11.5, color: "#64748b", borderTop: "1px solid #f1f5f9", paddingTop: 4 }}>
              {fmtDate(e.date_jour)}{e.motif ? ` — ${e.motif}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PostesNonTenusSection({ data }) {
  const [ouvert, setOuvert] = useState(false);
  const groupes = useMemo(() => groupPostesNonTenus(data.parPoste), [data.parPoste]);
  return (
    <div style={card}>
      <SectionHeader icon="⚠️" titre="Postes non tenus (signalements manuels)" ouvert={ouvert} onToggle={() => setOuvert(v => !v)} />
      <Tuile label="Total" valeur={data.total} large />
      {ouvert && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {groupes.map(g => (
            <div key={g.label} style={{ borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
              <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 12.5, marginBottom: 6 }}>
                {g.label} ({codeAffichePoste(g.codes)}) — {g.nb} fois
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
                {Object.values(g.parService).sort((a, b) => b.nb - a.nb).map(s => (
                  <div key={s.service}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "#475569" }}>
                      {s.service} — {s.nb} fois
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 10, marginTop: 2 }}>
                      {s.entries.map((e, i) => (
                        <div key={i} style={{ fontSize: 11, color: "#64748b" }}>
                          {fmtDate(e.date_jour)}{e.motif ? ` — ${e.motif}` : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
