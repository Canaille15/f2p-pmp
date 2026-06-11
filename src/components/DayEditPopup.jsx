// ─── DayEditPopup.jsx ─────────────────────────────────────────────────────────
// Popup de saisie multi-périodes pour le planning agent F2P.PMP
// À placer dans : src/components/DayEditPopup.jsx
//
// Props :
//   date        — "YYYY-MM-DD"
//   entry       — { equipe, equipe2, jsCode, horaires, prive, finNuit, ... }
//   agent       — { cp, nom, prenom, famille, ... }
//   agentProfiles — profils pour habilitations
//   onSave(newEntry) — appelé avec la nouvelle entrée
//   onDelete()  — appelé pour supprimer la journée
//   onClose()   — fermer le popup
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";

// ─── DONNÉES POSTES ───────────────────────────────────────────────────────────

const POSTES_PRCI_3x8 = [
  { code:"CCL", label:"CCL",     M:"PICCL-", AM:"PICCLO", N:"PICCLX", heures:{ M:"06h10–14h17", AM:"14h05–22h17", N:"22h15–06h17" } },
  { code:"ADJ", label:"Adj CCL", M:"PIADJ-", AM:"PIADJO", N:"PIADJX", heures:{ M:"06h10–14h17", AM:"14h05–22h17", N:"22h15–06h17" } },
  { code:"LNE", label:"AC LNE",  M:"PILNE-", AM:"PILNEO", N:"PILNEX", heures:{ M:"06h10–14h17", AM:"14h05–22h17", N:"22h15–06h17" } },
  { code:"LNO", label:"AC LNO",  M:"PILNO-", AM:"PILNOO", N:"PILNOX", heures:{ M:"06h10–14h17", AM:"14h05–22h17", N:"22h15–06h17" } },
  { code:"VGD", label:"AC VGD",  M:"PIVGD-", AM:"PIVGDO", N:null,     heures:{ M:"06h10–14h17", AM:"14h05–22h17", N:null } },
  { code:"LC",  label:"AC LC",   M:"PILCL-", AM:"PILCLO", N:"PILCLX", heures:{ M:"06h10–14h17", AM:"14h05–22h17", N:"22h15–06h17" } },
];

const POSTES_PAR_3x8 = [
  { code:"AC1",  label:"AC PAR",        M:"PAAC1-", AM:"PAAC1O", N:"PAAC1X",  heures:{ M:"06h10–14h17", AM:"14h05–22h17", N:"22h15–06h17" } },
  { code:"AC2",  label:"Aide AC PAR",   M:"PAAC2-", AM:"PAAC2O", N:"PAAC2X",  heures:{ M:"06h10–14h17", AM:"14h05–22h17", N:"22h15–06h17" } },
  { code:"ACXX", label:"CT AC Travaux", M:null,      AM:null,     N:"PAACXX",  heures:{ M:null, AM:null, N:"22h15–06h17" } },
];

const CODES_SIMPLES = [
  { code:"RP",   label:"RP",        color:"#16a34a" },
  { code:"RU",   label:"RU",        color:"#ca8a04" },
  { code:"RQ",   label:"RQ",        color:"#ca8a04" },
  { code:"TC",   label:"TC",        color:"#0284c7" },
  { code:"TY",   label:"TY",        color:"#0284c7" },
  { code:"RN",   label:"RN",        color:"#4338ca" },
  { code:"NU",   label:"NU",        color:"#475569" },
  { code:"CA",   label:"Congés",    color:"#eab308" },
  { code:"MA",   label:"Maladie",   color:"#dc2626" },
  { code:"VT",   label:"VT",        color:"#eab308" },
  { code:"ABS",  label:"Absent",    color:"#dc2626" },
  { code:"FOR",  label:"Formation", color:"#b45309" },
  { code:"DISPO",label:"Dispo",     color:"#059669" },
  { code:"JF",   label:"Fête",      color:"#ec4899" },
];

const FETES = ["F0","F1","F2","F3","F4","F5","F6","F7","F8","F9","FV","VN"];
const FETES_LABELS = {
  F0:"Noël", F1:"1er Janvier", F2:"Lundi de Pâques", F3:"1er Mai",
  F4:"Ascension", F5:"Lundi de Pentecôte", F6:"14 Juillet",
  F7:"15 Août", F8:"1er Novembre", F9:"11 Novembre",
  FV:"8 Mai", VN:"Veille Noël",
};

const EQUIPES_TRAVAIL = [
  { code:"M",  label:"Matin",  color:"#8B0000", heures:"06h10–14h17" },
  { code:"AM", label:"Soir",   color:"#8B0000", heures:"14h05–22h17" },
  { code:"N",  label:"Nuit",   color:"#1e293b", heures:"22h15–06h17" },
  { code:"J",  label:"Journée",color:"#8B0000", heures:"08h00–17h45" },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getColor(code) {
  if (!code) return "#e2e8f0";
  if (code === "N") return "#1e293b";
  if (["M","AM","J"].includes(code)) return "#8B0000";
  if (["RP"].includes(code)) return "#16a34a";
  if (["RU","RQ","VT","CA"].includes(code)) return "#ca8a04";
  if (["TC","TY"].includes(code)) return "#0284c7";
  if (["RN"].includes(code)) return "#4338ca";
  if (["NU"].includes(code)) return "#475569";
  if (["MA","ABS"].includes(code)) return "#dc2626";
  if (["FOR"].includes(code)) return "#b45309";
  if (["DISPO"].includes(code)) return "#059669";
  if (["JF",...FETES].includes(code)) return "#ec4899";
  return "#64748b";
}

// ─── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────────

export default function DayEditPopup({ date, entry, agent, agentProfiles, onSave, onDelete, onClose }) {

  const profile = agentProfiles?.[agent?.immatriculation || agent?.cp || agent?.id] || {};
  const famille = agent?.famille || "PRCI";
  const postes3x8 = famille === "PAR" ? POSTES_PAR_3x8 : POSTES_PRCI_3x8;

  // Habilitations validées
  const habilitations = profile.habilitations || {};
  const postesHabilites = postes3x8.filter(p => habilitations[p.code] === "HC");

  // État local des périodes
  const [periode1, setPeriode1] = useState(() => ({
    type:     entry?.equipe  || "",
    jsCode:   entry?.jsCode  || "",
    horaires: entry?.horaires || "",
  }));

  const [periode2, setPeriode2] = useState(() => ({
    type:     entry?.equipe2 || "",
    jsCode:   "",
    horaires: "",
  }));

  const [finNuit, setFinNuit] = useState(!!entry?.finNuit);
  const [onglet, setOnglet] = useState("p1"); // "p1" | "p2" | "fetes"
  const [showFetes, setShowFetes] = useState(false);

  // Date formatée
  const dateObj = new Date(date + "T12:00:00");
  const dateLabel = dateObj.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });

  // Postes disponibles selon type
  function getPostesDisponibles(type) {
    if (!["M","AM","N"].includes(type)) return [];
    return postesHabilites.filter(p => p[type] !== null);
  }

  // Quand on choisit un type pour la période 1
  function choisirType1(type) {
    const postes = getPostesDisponibles(type);
    const premier = postes[0];
    const horaires = premier?.heures?.[type] || EQUIPES_TRAVAIL.find(e=>e.code===type)?.heures || "";
    const jsCode = premier ? premier[type] : type;
    setPeriode1({ type, jsCode, horaires });
  }

  // Quand on choisit un code simple (RP, RU, CA...)
  function choisirCodeSimple(code) {
    setPeriode1({ type: code, jsCode: code, horaires: "" });
    setPeriode2({ type: "", jsCode: "", horaires: "" });
    setFinNuit(false);
  }

  // Quand on choisit une fête
  function choisirFete(code) {
    setPeriode1({ type: code, jsCode: code, horaires: "" });
    setShowFetes(false);
    setOnglet("p1");
  }

  // Quand on choisit un poste pour la période 1
  function choisirPoste1(poste) {
    const type = periode1.type;
    const jsCode = poste[type];
    const horaires = poste.heures?.[type] || "";
    setPeriode1(p => ({ ...p, jsCode, horaires }));
  }

  // Quand on choisit le type nuit pour la période 2
  function choisirNuit() {
    setPeriode2({ type: "N", jsCode: "", horaires: "22h15–06h17" });
    setOnglet("p2");
  }

  function supprimerPeriode2() {
    setPeriode2({ type: "", jsCode: "", horaires: "" });
    setFinNuit(false);
  }

  // Sauvegarder
  function sauvegarder() {
    const newEntry = {
      equipe:   periode1.type   || null,
      jsCode:   periode1.jsCode || periode1.type || null,
      horaires: periode1.horaires || null,
      equipe2:  periode2.type   || null,
      prive:    !["M","AM","N","J","JF","FOR","DISPO"].includes(periode1.type),
      finNuit:  finNuit,
    };
    onSave(newEntry);
  }

  const hasPeriode1 = !!periode1.type;
  const hasPeriode2 = !!periode2.type;

  // ─── RENDU ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position:"fixed", inset:0,
      background:"rgba(15,23,42,.7)",
      zIndex:500,
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:16,
      backdropFilter:"blur(4px)",
    }} onClick={e => e.target === e.currentTarget && onClose()}>

      <div style={{
        background:"#fff",
        borderRadius:20,
        width:"100%", maxWidth:420,
        boxShadow:"0 24px 60px rgba(0,0,0,.3)",
        overflow:"hidden",
        maxHeight:"90vh",
        display:"flex", flexDirection:"column",
      }}>

        {/* ── HEADER ── */}
        <div style={{
          background:"linear-gradient(135deg,#1e293b,#334155)",
          padding:"16px 20px",
          display:"flex", justifyContent:"space-between", alignItems:"center",
          flexShrink:0,
        }}>
          <div>
            <div style={{ color:"#94a3b8", fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:.5 }}>
              Modifier la journée
            </div>
            <div style={{ color:"#fff", fontSize:15, fontWeight:700, marginTop:2, textTransform:"capitalize" }}>
              {dateLabel}
            </div>
          </div>
          <button onClick={onClose} style={{
            background:"rgba(255,255,255,.1)", border:"none",
            color:"#fff", cursor:"pointer", borderRadius:8,
            width:32, height:32, fontSize:16,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>✕</button>
        </div>

        {/* ── PREVIEW CASE ── */}
        <div style={{ padding:"12px 20px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0", flexShrink:0 }}>
          <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:8, textTransform:"uppercase", letterSpacing:.5 }}>
            Aperçu de la case
          </div>
          <div style={{
            width:80, borderRadius:10, overflow:"hidden",
            border:"2px solid #e2e8f0",
            fontSize:11, fontWeight:700,
          }}>
            {/* Fin de nuit précédente (si applicable) */}
            {finNuit && (
              <div style={{ background:"#1e293b", color:"#fff", padding:"4px 6px", textAlign:"center", fontSize:10 }}>
                ↓ Nuit
              </div>
            )}
            {/* Période 1 */}
            {hasPeriode1 ? (
              <div style={{
                background: getColor(periode1.type),
                color:"#fff", padding:"8px 6px",
                textAlign:"center",
                minHeight:36,
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              }}>
                <div>{periode1.type}</div>
                {periode1.horaires && <div style={{ fontSize:9, opacity:.8 }}>{periode1.horaires.split("–")[0]}</div>}
              </div>
            ) : (
              <div style={{ background:"#f1f5f9", padding:"8px 6px", textAlign:"center", color:"#94a3b8", minHeight:36, display:"flex", alignItems:"center", justifyContent:"center" }}>
                —
              </div>
            )}
            {/* Période 2 (nuit) */}
            {hasPeriode2 && (
              <div style={{ background:"#1e293b", color:"#fff", padding:"4px 6px", textAlign:"center", fontSize:10 }}>
                N ↓
              </div>
            )}
          </div>
        </div>

        {/* ── CONTENU SCROLLABLE ── */}
        <div style={{ overflowY:"auto", flex:1 }}>

          {/* ── ONGLETS ── */}
          <div style={{ display:"flex", borderBottom:"1px solid #e2e8f0", background:"#f8fafc" }}>
            {[
              { id:"p1", label:"Période 1" },
              { id:"p2", label:"+ Nuit" },
              { id:"fetes", label:"🩷 Fêtes" },
            ].map(o => (
              <button key={o.id} onClick={() => setOnglet(o.id)} style={{
                flex:1, padding:"10px 8px",
                border:"none", background:"none", cursor:"pointer",
                fontSize:12, fontWeight:700,
                color: onglet === o.id ? "#1e293b" : "#94a3b8",
                borderBottom: onglet === o.id ? "2px solid #1e293b" : "2px solid transparent",
              }}>{o.label}</button>
            ))}
          </div>

          <div style={{ padding:"16px 20px" }}>

            {/* ── ONGLET PÉRIODE 1 ── */}
            {onglet === "p1" && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                {/* Codes simples */}
                <div>
                  <div style={{ fontSize:11, color:"#64748b", fontWeight:700, marginBottom:8, textTransform:"uppercase" }}>
                    Repos / Absences
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {CODES_SIMPLES.map(c => (
                      <button key={c.code} onClick={() => choisirCodeSimple(c.code)} style={{
                        padding:"6px 12px", borderRadius:8, border:"none", cursor:"pointer",
                        fontSize:12, fontWeight:700,
                        background: periode1.type === c.code ? c.color : "#f1f5f9",
                        color: periode1.type === c.code ? "#fff" : "#475569",
                        transition:"all .15s",
                      }}>{c.label}</button>
                    ))}
                  </div>
                </div>

                {/* Types de travail */}
                <div>
                  <div style={{ fontSize:11, color:"#64748b", fontWeight:700, marginBottom:8, textTransform:"uppercase" }}>
                    Travail
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    {EQUIPES_TRAVAIL.map(e => (
                      <button key={e.code} onClick={() => choisirType1(e.code)} style={{
                        flex:1, padding:"10px 6px", borderRadius:10, border:"none", cursor:"pointer",
                        fontSize:13, fontWeight:800,
                        background: periode1.type === e.code ? e.color : "#f1f5f9",
                        color: periode1.type === e.code ? "#fff" : "#475569",
                        transition:"all .15s",
                      }}>
                        {e.label}
                        <div style={{ fontSize:9, marginTop:2, opacity:.7 }}>{e.heures.split("–")[0]}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Postes disponibles */}
                {["M","AM","N"].includes(periode1.type) && getPostesDisponibles(periode1.type).length > 0 && (
                  <div>
                    <div style={{ fontSize:11, color:"#64748b", fontWeight:700, marginBottom:8, textTransform:"uppercase" }}>
                      Poste
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {getPostesDisponibles(periode1.type).map(p => {
                        const jsCode = p[periode1.type];
                        return (
                          <button key={p.code} onClick={() => choisirPoste1(p)} style={{
                            padding:"6px 12px", borderRadius:8, border:"none", cursor:"pointer",
                            fontSize:12, fontWeight:700,
                            background: periode1.jsCode === jsCode ? "#1e293b" : "#f1f5f9",
                            color: periode1.jsCode === jsCode ? "#fff" : "#475569",
                          }}>
                            {p.label}
                            <span style={{ fontSize:10, opacity:.7, marginLeft:4 }}>{jsCode}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Poste */}
                {hasPeriode1 && ["M","AM","N","J"].includes(periode1.type) && (
                  <div>
                    <div style={{ fontSize:11, color:"#64748b", fontWeight:700, marginBottom:6, textTransform:"uppercase" }}>
                      Poste
                    </div>
                    <input
                      value={periode1.jsCode && !["M","AM","N","J"].includes(periode1.jsCode) ? periode1.jsCode : ""}
                      onChange={e => setPeriode1(p => ({ ...p, jsCode: e.target.value }))}
                      placeholder="ex: CCL, LNE, LC..."
                      style={{
                        width:"100%", padding:"8px 12px",
                        border:"1.5px solid #e2e8f0", borderRadius:8,
                        fontSize:13, outline:"none",
                      }}
                    />
                  </div>
                )}
                {/* Horaires */}
                {hasPeriode1 && periode1.horaires !== undefined && (
                  <div>
                    <div style={{ fontSize:11, color:"#64748b", fontWeight:700, marginBottom:6, textTransform:"uppercase" }}>
                      Horaires
                    </div>
                    <input
                      value={periode1.horaires}
                      onChange={e => setPeriode1(p => ({ ...p, horaires: e.target.value }))}
                      placeholder="ex: 06h10–14h17"
                      style={{
                        width:"100%", padding:"8px 12px",
                        border:"1.5px solid #e2e8f0", borderRadius:8,
                        fontSize:13, fontFamily:"monospace", outline:"none",
                      }}
                    />
                  </div>
                )}

                {/* Fin de nuit */}
                <div style={{
                  background: finNuit ? "#f0f9ff" : "#f8fafc",
                  border: `1.5px solid ${finNuit ? "#0284c7" : "#e2e8f0"}`,
                  borderRadius:10, padding:"10px 14px",
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  cursor:"pointer",
                }} onClick={() => setFinNuit(v => !v)}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color: finNuit ? "#0284c7" : "#475569" }}>
                      🌙 Descente de nuit
                    </div>
                    <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>
                      Fin de nuit le matin (haut de la case)
                    </div>
                  </div>
                  <div style={{
                    width:20, height:20, borderRadius:10,
                    background: finNuit ? "#0284c7" : "#e2e8f0",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    {finNuit && <span style={{ color:"#fff", fontSize:12 }}>✓</span>}
                  </div>
                </div>

              </div>
            )}

            {/* ── ONGLET PÉRIODE 2 (NUIT) ── */}
            {onglet === "p2" && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{
                  background:"#f0f9ff", border:"1.5px solid #bae6fd",
                  borderRadius:10, padding:"12px 14px",
                }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#0369a1" }}>
                    🌙 Début de nuit
                  </div>
                  <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>
                    La nuit débutera le soir de cette journée (22h15) et se terminera le lendemain matin.
                  </div>
                </div>

                {!hasPeriode2 ? (
                  <button onClick={choisirNuit} style={{
                    padding:"12px", background:"#1e293b", color:"#fff",
                    border:"none", borderRadius:10, cursor:"pointer",
                    fontSize:13, fontWeight:700,
                  }}>
                    + Ajouter début de nuit (22h15–06h17)
                  </button>
                ) : (
                  <div>
                    <div style={{
                      background:"#1e293b", color:"#fff",
                      borderRadius:10, padding:"12px 14px",
                      display:"flex", justifyContent:"space-between", alignItems:"center",
                    }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700 }}>🌙 Nuit — 22h15–06h17</div>
                        <div style={{ fontSize:11, opacity:.7, marginTop:2 }}>Bas de la case + haut du lendemain</div>
                      </div>
                      <button onClick={supprimerPeriode2} style={{
                        background:"rgba(255,255,255,.15)", border:"none",
                        color:"#fff", cursor:"pointer", borderRadius:6,
                        padding:"4px 8px", fontSize:11,
                      }}>Supprimer</button>
                    </div>

                    {/* Postes de nuit */}
                    {getPostesDisponibles("N").length > 0 && (
                      <div style={{ marginTop:12 }}>
                        <div style={{ fontSize:11, color:"#64748b", fontWeight:700, marginBottom:8, textTransform:"uppercase" }}>
                          Poste de nuit
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                          {getPostesDisponibles("N").map(p => (
                            <button key={p.code} onClick={() => setPeriode2(pp => ({ ...pp, jsCode: p.N }))} style={{
                              padding:"6px 12px", borderRadius:8, border:"none", cursor:"pointer",
                              fontSize:12, fontWeight:700,
                              background: periode2.jsCode === p.N ? "#1e293b" : "#f1f5f9",
                              color: periode2.jsCode === p.N ? "#fff" : "#475569",
                            }}>
                              {p.label}
                              <span style={{ fontSize:10, opacity:.7, marginLeft:4 }}>{p.N}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── ONGLET FÊTES ── */}
            {onglet === "fetes" && (
              <div>
                <div style={{ fontSize:11, color:"#64748b", fontWeight:700, marginBottom:10, textTransform:"uppercase" }}>
                  Sélectionner une fête légale
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {FETES.map(f => (
                    <button key={f} onClick={() => choisirFete(f)} style={{
                      padding:"8px 14px", borderRadius:10, border:"none", cursor:"pointer",
                      fontSize:12, fontWeight:700,
                      background: periode1.type === f ? "#ec4899" : "#fdf2f8",
                      color: periode1.type === f ? "#fff" : "#9d174d",
                    }}>
                      <div>{f}</div>
                      <div style={{ fontSize:10, opacity:.8 }}>{FETES_LABELS[f]}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ── ACTIONS ── */}
        <div style={{
          padding:"14px 20px",
          borderTop:"1px solid #e2e8f0",
          display:"flex", gap:8,
          flexShrink:0, background:"#fff",
        }}>
          <button onClick={onDelete} style={{
            padding:"10px 14px", background:"#fef2f2", color:"#dc2626",
            border:"none", borderRadius:10, cursor:"pointer",
            fontSize:12, fontWeight:700,
          }}>🗑 Effacer</button>
          <button onClick={onClose} style={{
            flex:1, padding:"10px", background:"#f1f5f9", color:"#64748b",
            border:"none", borderRadius:10, cursor:"pointer",
            fontSize:13, fontWeight:600,
          }}>Annuler</button>
          <button onClick={sauvegarder} disabled={!hasPeriode1 && !finNuit} style={{
            flex:2, padding:"10px", background: (hasPeriode1 || finNuit) ? "#1e293b" : "#e2e8f0",
            color: (hasPeriode1 || finNuit) ? "#fff" : "#94a3b8",
            border:"none", borderRadius:10, cursor: (hasPeriode1 || finNuit) ? "pointer" : "default",
            fontSize:13, fontWeight:700,
          }}>✓ Enregistrer</button>
        </div>

      </div>
    </div>
  );
}
