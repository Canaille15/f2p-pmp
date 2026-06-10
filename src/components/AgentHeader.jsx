// ─── AgentHeader.jsx ─────────────────────────────────────────────────────────
// Bandeau agent Option C — bande colorée fine + fond blanc + badges compteurs
// À placer dans : src/components/AgentHeader.jsx
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

const FAMILLES = {
  PRCI: { label: "PRCI PMP", color: "#1e3a5f", accent: "#3b82f6", gradient: "linear-gradient(90deg,#1e3a5f,#2d5a8e,#3b82f6)" },
  PAR:  { label: "PAR",      color: "#065f46", accent: "#10b981", gradient: "linear-gradient(90deg,#065f46,#047857,#10b981)" },
};

const HAB_PRCI = [
  { code:"CCL",  label:"CCL"        },
  { code:"ADJ",  label:"Adj CCL"    },
  { code:"LNE",  label:"AC LNE"     },
  { code:"LNO",  label:"AC LNO"     },
  { code:"VGD",  label:"AC VGD"     },
  { code:"LC",   label:"AC LC"      },
];
const HAB_PAR = [
  { code:"AC1",  label:"AC PAR"        },
  { code:"AC2",  label:"Aide AC PAR"   },
  { code:"ACXX", label:"CT AC Travaux" },
];

export default function AgentHeader({
  agent,
  profile,
  counts,
  compteurYear,
  setCompteurYear,
  onImportDP,
  onDemandeConges,
  onCouleurs,
  onHabilitations,
  onRoulementChange,
  onReservisteChange,
  isOwnProfile,
}) {
  const [ouvert, setOuvert] = useState(false);
  const fam = FAMILLES[agent?.famille] || FAMILLES.PRCI;
  const initiales = agent?.initiales || agent?.initials ||
    ((agent?.prenom?.[0] || "") + (agent?.nom?.[0] || "")).toUpperCase();

  const ROULEMENTS = ["Roulement 3×8", "Journée"];
  const allPostes = [...HAB_PRCI, ...HAB_PAR];
  const postesHab = Object.entries(profile?.habilitations || {})
    .filter(([, v]) => v === "HC")
    .map(([code]) => allPostes.find(p => p.code === code))
    .filter(Boolean);

  const currentYear = new Date().getFullYear();

  return (
    <div style={{ borderRadius: 16, overflow: "hidden", background: "#fff", boxShadow: "0 1px 6px rgba(0,0,0,.08)", border: "1px solid #e2e8f0" }}>

      {/* ── BANDE COLORÉE ── */}
      <div style={{ height: 4, background: fam.gradient }} />

      {/* ── IDENTITÉ ── */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>

        {/* Avatar */}
        <div style={{
          width: 42, height: 42, borderRadius: "50%",
          background: fam.color, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, flexShrink: 0,
        }}>
          {initiales}
        </div>

        {/* Nom + grade */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {agent?.prenom} {agent?.nom}
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ background: "#f1f5f9", color: "#475569", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6 }}>
              {agent?.grade}
            </span>
            <span style={{
              background: agent?.famille === "PAR" ? "#d1fae5" : "#dbeafe",
              color: agent?.famille === "PAR" ? "#065f46" : "#1d4ed8",
              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
            }}>
              {fam.label}
            </span>
            {agent?.poste && (
              <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 500 }}>
                {agent.poste}
              </span>
            )}
          </div>
        </div>

        {/* Boutons actions */}
        {isOwnProfile && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            
              <button onClick={() => onImportDP(agent)} style={btnStyle("#f8fafc", "#475569")} title="Déroulé">
                📋
              </button>
            )}
            {onDemandeConges && (
              <button onClick={onDemandeConges} style={btnStyle("#f8fafc", "#475569")} title="Congés">
                📝
              </button>
            )}
            {onCouleurs && (
              <button onClick={onCouleurs} style={btnStyle("#f8fafc", "#475569")} title="Couleurs">
                🎨
              </button>
            )}
            <button onClick={() => setOuvert(o => !o)} style={btnStyle(ouvert ? fam.color : "#f8fafc", ouvert ? "#fff" : "#475569")} title="Profil">
              {ouvert ? "▲" : "▼"}
            </button>
          </div>
        )}
      </div>

      {/* ── COMPTEURS RAPIDES ── */}
      <div style={{ padding: "8px 16px 12px", borderTop: "1px solid #f1f5f9" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {/* Sélecteur année */}
          <div style={{ display: "flex", gap: 3, marginRight: 4 }}>
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <button key={y} onClick={() => setCompteurYear?.(y)} style={{
                border: `1px solid ${compteurYear === y ? fam.accent : "#e2e8f0"}`,
                background: compteurYear === y ? fam.accent : "#fff",
                color: compteurYear === y ? "#fff" : "#94a3b8",
                borderRadius: 6, padding: "2px 7px", cursor: "pointer",
                fontSize: 10, fontWeight: 700,
              }}>{y}</button>
            ))}
          </div>

          {counts?.RP > 0 && <Badge label={`${counts.RP} RP`} bg="#d1fae5" color="#065f46" />}
          {(counts?.RU > 0 || counts?.RQ > 0) && <Badge label={`${(counts?.RU || 0) + (counts?.RQ || 0)} RU/RQ`} bg="#fef9c3" color="#713f12" />}
          {counts?.FETE > 0 && <Badge label={`${counts.FETE} fêtes`} bg="#fce7f3" color="#9d174d" />}
          {(counts?.CA > 0 || counts?.CP > 0) && <Badge label={`${(counts?.CA || 0) + (counts?.CP || 0)} congés`} bg="#dbeafe" color="#1e40af" />}
          {counts?.travail > 0 && <Badge label={`${counts.travail} trav.`} bg="#fee2e2" color="#991b1b" />}
          {counts?.RN > 0 && <Badge label={`${counts.RN} RN`} bg="#ede9fe" color="#5b21b6" />}
          {counts?.TC > 0 && <Badge label={`${counts.TC} TC`} bg="#e0f2fe" color="#0369a1" />}
        </div>
      </div>

      {/* ── ACCORDÉON PROFIL COMPLET ── */}
      {ouvert && isOwnProfile && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "14px 16px", background: "#f8fafc", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Roulement */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>
              🔄 Roulement
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ROULEMENTS.map(r => {
                const sel = profile?.roulement === r;
                return (
                  <button key={r} onClick={() => onRoulementChange?.(sel ? null : r)} style={{
                    padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                    border: `1.5px solid ${sel ? fam.accent : "#e2e8f0"}`,
                    background: sel ? fam.color : "#fff",
                    color: sel ? "#fff" : "#475569",
                    fontSize: 12, fontWeight: sel ? 700 : 400,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${sel ? "#fff" : "#cbd5e1"}`, background: sel ? "#fff" : "transparent", display: "inline-block" }} />
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Habilitations */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>
              ⚡ Postes habilités
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {postesHab.length > 0
                ? postesHab.map(p => (
                  <span key={p.code} style={{
                    padding: "4px 10px", borderRadius: 8,
                    background: agent?.famille === "PAR" ? "#d1fae5" : "#dbeafe",
                    color: agent?.famille === "PAR" ? "#065f46" : "#1d4ed8",
                    fontSize: 11, fontWeight: 700,
                  }}>⚡ {p.label}</span>
                ))
                : <span style={{ fontSize: 11, color: "#94a3b8" }}>Aucune habilitation enregistrée</span>
              }
              <button onClick={onHabilitations} style={{
                padding: "4px 10px", borderRadius: 8,
                background: "#f1f5f9", color: "#64748b",
                border: "1px dashed #cbd5e1",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}>⚙️ Modifier</button>
            </div>
          </div>

          {/* Réserviste */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#fff", borderRadius: 10, padding: "10px 14px",
            border: "1px solid #e2e8f0",
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>🛡️ Réserviste</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Activez pour gérer vos habilitations</div>
            </div>
            <div
              onClick={() => onReservisteChange?.(!profile?.isReserve)}
              style={{
                width: 44, height: 24, borderRadius: 12, cursor: "pointer",
                background: profile?.isReserve ? "#10b981" : "#e2e8f0",
                position: "relative", transition: "background .2s",
              }}>
              <div style={{
                position: "absolute", top: 2,
                left: profile?.isReserve ? 22 : 2,
                width: 20, height: 20, borderRadius: "50%",
                background: "#fff", transition: "left .2s",
                boxShadow: "0 1px 3px rgba(0,0,0,.2)",
              }} />
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function Badge({ label, bg, color }) {
  return (
    <span style={{
      background: bg, color, fontSize: 11, fontWeight: 700,
      padding: "3px 9px", borderRadius: 6,
    }}>{label}</span>
  );
}

function btnStyle(bg, color) {
  return {
    background: bg, color, border: "1px solid #e2e8f0",
    borderRadius: 8, width: 32, height: 32,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", fontSize: 14,
  };
}
