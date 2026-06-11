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
  { code:"PICCL",   label:"CCL"         },
  { code:"PIADJ",   label:"Adj CCL"     },
  { code:"PILNE",   label:"AC LNE"      },
  { code:"PILNO",   label:"AC LNO"      },
  { code:"PIVGD",   label:"AC VGD"      },
  { code:"PILCL",   label:"AC LC"       },
  { code:"PIPA1J",  label:"Pauseur PA1" },
  { code:"PIPA2J",  label:"Pauseur PA2" },
  { code:"PIPA3J",  label:"Pauseur PA3" },
  { code:"PIDPXJ",  label:"DPX PRCI"   },
  { code:"PIASSJ",  label:"Adj DPX"    },
  { code:"PPRCI",   label:"PPRCI"      },
  { code:"AFOPRCI", label:"AFO PRCI"   },
];
const HAB_PAR = [
  { code:"PAAC1-", label:"AC PAR"        },
  { code:"PAAC2-", label:"Aide AC PAR"   },
  { code:"PAACXX", label:"CT AC Travaux" },
  { code:"PAPAUJ", label:"Pauseur PAR"   },
  { code:"PADPXJ", label:"DPX PAR"      },
  { code:"PAASMJ", label:"ASMTE PAR"    },
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



      {/* ── ACCORDÉON PROFIL COMPLET ── */}
      {ouvert && isOwnProfile && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "14px 16px", background: "#f8fafc", display: "flex", flexDirection: "column", gap: 16 }}>

 
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
