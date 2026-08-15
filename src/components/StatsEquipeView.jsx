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
const POSTE_LABELS = {
  PICCL: "CCL", PIADJ: "Adj CCL", PILNE: "AC LNE", PILNO: "AC LNO", PILCL: "AC LC", PIVGD: "AC VGD",
  PIPA1J: "Pauseur CCL", PIPA2J: "Pauseur Adjoint", PIPA3J: "Pauseur VGD",
  PIDPXJ: "DPX PRCI", PIASSJ: "Adj DPX", PPRCI: "PPRCI", AFOPRCI: "AFO PRCI",
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
  "PIPA1J", "PIPA2J", "PIPA3J", "PIDPXJ", "PIASSJ", "PPRCI", "AFOPRCI", "A-PRCI", "SD%",
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
              <Tuile label="Agents équipe" valeur={data.headcounts.totalEquipe} />
              <Tuile label="Réserve régionale" valeur={data.headcounts.totalReserve} />
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 11, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .04 }}>Temps partiel</div>
                  <div style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: 15, fontWeight: 800, color: "#1e293b" }}>{fmtPct(data.headcounts.pctTempsPartiel)}</div>
                </div>
                <Barre pct={data.headcounts.pctTempsPartiel} />
                <div style={{ fontSize: 10.5, color: "#94a3b8" }}>Temps plein {fmtPct(pctTempsPlein)}</div>
              </div>
            </div>
          </div>

          {/* Couverture Réserve régionale */}
          <div style={card}>
            <div style={sectionTitle}>🔁 Couverture des postes par la Réserve régionale</div>
            <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 10 }}>
              Part des journées CPS couvertes par un réserviste (présent directement, ou couvrant un poste vacant via un signalement d'échange) sur le total des journées importées cette année.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <Tuile label="Global" valeur={fmtPct(data.coverageReserve.global.pct)} sousLabel={`${data.coverageReserve.global.numerateur} / ${data.coverageReserve.global.denominateur} j.`} />
              <Tuile label="PRCI" valeur={fmtPct(data.coverageReserve.PRCI.pct)} sousLabel={`${data.coverageReserve.PRCI.numerateur} / ${data.coverageReserve.PRCI.denominateur} j.`} />
              <Tuile label="PAR" valeur={fmtPct(data.coverageReserve.PAR.pct)} sousLabel={`${data.coverageReserve.PAR.numerateur} / ${data.coverageReserve.PAR.denominateur} j.`} />
            </div>
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

function Barre({ pct }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ height: 8, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${clamped}%`, borderRadius: 999, background: NAVY.from, transition: "width .2s ease" }} />
    </div>
  );
}

function PostesNonTenusSection({ data }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={sectionTitle}>⚠️ Postes non tenus (signalements manuels)</div>
        <button onClick={() => setOuvert(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: NAVY.from, fontSize: 12, fontWeight: 700 }}>
          {ouvert ? "▲ Masquer le détail" : "▼ Voir le détail"}
        </button>
      </div>
      <Tuile label="Total" valeur={data.total} large />
      {ouvert && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {data.parPoste.map(p => (
            <div key={p.js_code} style={{ borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
              <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 12.5, marginBottom: 4 }}>{labelPoste(p.js_code)} — {p.nb} fois</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {p.entries.map((e, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: "#64748b" }}>
                    {fmtDate(e.date_jour)}{e.motif ? ` — ${e.motif}` : ""}
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
