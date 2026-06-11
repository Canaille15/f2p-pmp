// ─── DayEditPopup.jsx ─────────────────────────────────────────────────────────
// Popup de saisie journée — F2P.PMP
// Logique : clic case → voir/modifier période 1 + bouton "+ Ajouter nuit"
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";

// ─── DONNÉES ──────────────────────────────────────────────────────────────────

const CODES_SIMPLES = [
  { code:"RP",  label:"RP",       color:"#16a34a" },
  { code:"RU",  label:"RU",       color:"#ca8a04" },
  { code:"RQ",  label:"RQ",       color:"#ca8a04" },
  { code:"TC",  label:"TC",       color:"#0284c7" },
  { code:"TY",  label:"TY",       color:"#0284c7" },
  { code:"RN",  label:"RN",       color:"#4338ca" },
  { code:"NU",  label:"NU",       color:"#475569" },
  { code:"CA",  label:"Congés",   color:"#eab308" },
  { code:"MA",  label:"Maladie",  color:"#dc2626" },
  { code:"VT",  label:"VT",       color:"#eab308" },
  { code:"ABS", label:"Absent",   color:"#dc2626" },
  { code:"FOR", label:"Formation",color:"#b45309" },
];

const TRAVAIL = [
  { code:"M",  label:"Matin",   heures:"06h10–14h17", color:"#8B0000" },
  { code:"AM", label:"Soir",    heures:"14h05–22h17", color:"#8B0000" },
  { code:"N",  label:"Nuit",    heures:"22h15–06h17", color:"#1e293b" },
  { code:"J",  label:"Journée", heures:"08h00–17h45", color:"#8B0000" },
];

const FETES = [
  {code:"F1",label:"1er Janvier"},{code:"F2",label:"Lundi de Pâques"},
  {code:"F3",label:"1er Mai"},{code:"F4",label:"Ascension"},
  {code:"FV",label:"8 Mai"},{code:"F5",label:"Lundi de Pentecôte"},
  {code:"F6",label:"14 Juillet"},{code:"F7",label:"15 Août"},
  {code:"F8",label:"1er Novembre"},{code:"F9",label:"11 Novembre"},
  {code:"F0",label:"Noël"},{code:"VN",label:"Veille Noël"},
  {code:"JF",label:"Fête SNCF"},
];

const POSTES_PRCI = [
  {code:"CCL",   label:"CCL",          famille:"PRCI", types:["M","AM","N"]},
  {code:"ADJ",   label:"Adj CCL",      famille:"PRCI", types:["M","AM","N"]},
  {code:"LNE",   label:"AC LNE",       famille:"PRCI", types:["M","AM","N"]},
  {code:"LNO",   label:"AC LNO",       famille:"PRCI", types:["M","AM","N"]},
  {code:"VGD",   label:"AC VGD",       famille:"PRCI", types:["M","AM"]},
  {code:"LC",    label:"AC LC",        famille:"PRCI", types:["M","AM","N"]},
  {code:"PA1J",  label:"Pauseur PA1",  famille:"PRCI", types:["J"]},
  {code:"PA2J",  label:"Pauseur PA2",  famille:"PRCI", types:["J"]},
  {code:"PA3J",  label:"Pauseur PA3",  famille:"PRCI", types:["J"]},
  {code:"DPXJ",  label:"DPX PRCI",     famille:"PRCI", types:["J"]},
  {code:"ASSJ",  label:"Adj DPX",      famille:"PRCI", types:["J"]},
  {code:"PPRCI", label:"PPRCI",        famille:"PRCI", types:["J"]},
  {code:"AFOPR", label:"AFO PRCI",     famille:"PRCI", types:["J"]},
];

const POSTES_PAR = [
  {code:"AC1",   label:"AC PAR",       famille:"PAR",  types:["M","AM","N"]},
  {code:"AC2",   label:"Aide AC PAR",  famille:"PAR",  types:["M","AM","N"]},
  {code:"ACXX",  label:"CT Travaux",   famille:"PAR",  types:["N"]},
  {code:"PARJ",  label:"Pauseur PAR",  famille:"PAR",  types:["J"]},
  {code:"DPXP",  label:"DPX PAR",      famille:"PAR",  types:["J"]},
  {code:"ASMP",  label:"ASMTE PAR",    famille:"PAR",  types:["J"]},
];

const HORAIRES_DEFAUT = {
  M:  "06h10–14h17",
  AM: "14h05–22h17",
  N:  "22h15–06h17",
  J:  "08h00–17h45",
};

// ─── COMPOSANT ────────────────────────────────────────────────────────────────

export default function DayEditPopup({ date, entry, agent, agentProfiles, onSave, onDelete, onClose }) {

  const agKey = agent?.immatriculation || agent?.cp || agent?.id;
  const profile = agentProfiles?.[agKey] || {};
  const famille = agent?.famille || "PRCI";
  const tous_postes = famille === "PAR" ? [...POSTES_PAR, ...POSTES_PRCI] : [...POSTES_PRCI, ...POSTES_PAR];

  // Habilitations validées
  const habCodes = useMemo(() => {
    const habs = profile.habilitations || {};
    if (Array.isArray(habs)) return habs.map(h => h.code_poste);
    return Object.entries(habs).filter(([,v]) => v === "HC").map(([k]) => k);
  }, [profile.habilitations]);

  // Postes habilités filtrés par type
  const getPostes = (type) => {
    if (!type || !["M","AM","N","J"].includes(type)) return [];
    const postes = tous_postes.filter(p => p.types.includes(type));
    if (habCodes.length === 0) return postes; // si pas d'hab, tout afficher
    return postes.filter(p => habCodes.some(h => h.includes(p.code) || p.code.includes(h.slice(0,4))));
  };

  // États
  const [type1, setType1]       = useState(entry?.equipe || "");
  const [poste1, setPoste1]     = useState(entry?.jsCode && !["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","DISPO","NU","TC","TY","RN","JF"].includes(entry?.jsCode) ? entry.jsCode : "");
  const [horaires1, setHoraires1] = useState(entry?.horaires || "");
  const [finNuit, setFinNuit]   = useState(!!entry?.finNuit);
  const isFinNuitOnly = !!entry?.finNuit && !entry?.equipe; // case fin de nuit sans periode journee
  const [debutNuit, setDebutNuit] = useState(!!entry?.equipe2);
  const [posteNuit, setPosteNuit] = useState("");
  const [showFetes, setShowFetes] = useState(false);
  const [confirmNuit, setConfirmNuit] = useState(false);

  // Date lisible
  const dateObj = new Date(date + "T12:00:00");
  const dateLabel = dateObj.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });

  // Quand on choisit un type de travail
  const choisirType = (code) => {
    setType1(code);
    setHoraires1(HORAIRES_DEFAUT[code] || "");
    setPoste1("");
    setShowFetes(false);
  };

  // Quand on choisit un code simple
  const choisirSimple = (code) => {
    setType1(code);
    setHoraires1("");
    setPoste1("");
    setDebutNuit(false);
    setShowFetes(false);
  };

  // Quand on choisit un poste
  const choisirPoste = (code) => {
    setPoste1(code);
  };

  // Couleur du type
  const getColor = (code) => {
    const t = TRAVAIL.find(t => t.code === code);
    if (t) return t.color;
    const s = CODES_SIMPLES.find(s => s.code === code);
    if (s) return s.color;
    const f = FETES.find(f => f.code === code);
    if (f) return "#ec4899";
    return "#64748b";
  };

  const isTravail = ["M","AM","N","J"].includes(type1);

  // Sauvegarder
  const sauvegarder = () => {
    const newEntry = {
      equipe:    type1 || null,
      jsCode:    poste1 || null,
      horaires:  horaires1 || null,
      equipe2:   debutNuit ? "N" : null,
      jsCodeNuit: posteNuit || null,
      prive:     !["M","AM","N","J","JF","FOR","DISPO",...FETES.map(f=>f.code)].includes(type1),
      finNuit:   finNuit,
    };
    onSave(newEntry);
  };

  const canSave = !!type1 || finNuit;

  return (
    <div style={{
      position:"fixed", inset:0,
      background:"rgba(15,23,42,.65)",
      zIndex:500, display:"flex",
      alignItems:"center", justifyContent:"center",
      padding:16, backdropFilter:"blur(3px)",
    }} onClick={e => e.target === e.currentTarget && onClose()}>

      <div style={{
        background:"#fff", borderRadius:20,
        width:"100%", maxWidth:420,
        boxShadow:"0 24px 60px rgba(0,0,0,.25)",
        overflow:"hidden", maxHeight:"90vh",
        display:"flex", flexDirection:"column",
      }}>

        {/* HEADER */}
        <div style={{
          background:"linear-gradient(135deg,#1e293b,#334155)",
          padding:"16px 20px",
          display:"flex", justifyContent:"space-between", alignItems:"center",
          flexShrink:0,
        }}>
          <div>
            <div style={{color:"#94a3b8",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>
              Modifier la journée
            </div>
            <div style={{color:"#fff",fontSize:15,fontWeight:700,marginTop:2,textTransform:"capitalize"}}>
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

        {/* CONTENU */}
        <div style={{overflowY:"auto", flex:1, padding:"16px 20px", display:"flex", flexDirection:"column", gap:16}}>

          {/* Fin de nuit (si applicable) */}
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            background: finNuit ? "#f0f9ff" : "#f8fafc",
            border:`1.5px solid ${finNuit ? "#0284c7" : "#e2e8f0"}`,
            borderRadius:10, padding:"10px 14px", cursor:"pointer",
          }} onClick={() => setFinNuit(v => !v)}>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:finNuit?"#0284c7":"#475569"}}>
                🌙 Descente de nuit (fin de nuit le matin)
              </div>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>
                Indique que cette journée commence par la fin d'une nuit
              </div>
            </div>
            <div style={{
              width:20,height:20,borderRadius:10,
              background:finNuit?"#0284c7":"#e2e8f0",
              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
            }}>
              {finNuit && <span style={{color:"#fff",fontSize:12}}>✓</span>}
            </div>
          </div>

          {/* Repos / Absences */}
          <div>
            <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>
              Repos / Absences
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {CODES_SIMPLES.map(c => (
                <button key={c.code} onClick={() => choisirSimple(c.code)} style={{
                  padding:"6px 12px", borderRadius:8, border:"none", cursor:"pointer",
                  fontSize:12, fontWeight:700,
                  background: type1 === c.code ? c.color : "#f1f5f9",
                  color: type1 === c.code ? "#fff" : "#475569",
                }}>{c.label}</button>
              ))}
              <button onClick={() => setShowFetes(v=>!v)} style={{
                padding:"6px 12px", borderRadius:8, border:"none", cursor:"pointer",
                fontSize:12, fontWeight:700,
                background: showFetes || FETES.find(f=>f.code===type1) ? "#ec4899" : "#fdf2f8",
                color: showFetes || FETES.find(f=>f.code===type1) ? "#fff" : "#9d174d",
              }}>🩷 Fêtes</button>
            </div>
            {showFetes && (
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                {FETES.map(f => (
                  <button key={f.code} onClick={() => { setType1(f.code); setHoraires1(""); setPoste1(""); setShowFetes(false); }} style={{
                    padding:"5px 10px", borderRadius:8, border:"none", cursor:"pointer",
                    fontSize:11, fontWeight:700,
                    background: type1 === f.code ? "#ec4899" : "#fdf2f8",
                    color: type1 === f.code ? "#fff" : "#9d174d",
                  }}>
                    <div>{f.code}</div>
                    <div style={{fontSize:9,opacity:.8}}>{f.label}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Travail */}
          <div>
            <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>
              Travail
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
              {TRAVAIL.map(t => (
                <button key={t.code} onClick={() => choisirType(t.code)} style={{
                  padding:"10px 6px", borderRadius:10, border:"none", cursor:"pointer",
                  fontSize:12, fontWeight:800,
                  background: type1 === t.code ? t.color : "#f1f5f9",
                  color: type1 === t.code ? "#fff" : "#475569",
                  display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                }}>
                  <span>{t.label}</span>
                  <span style={{fontSize:9,opacity:.7}}>{t.heures.split("–")[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Poste (si travail) */}
          {isTravail && (
            <div>
              <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>
                Poste
              </div>
              {getPostes(type1).length > 0 ? (
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {getPostes(type1).map(p => (
                    <button key={p.code} onClick={() => choisirPoste(p.code)} style={{
                      padding:"6px 12px", borderRadius:8, border:"none", cursor:"pointer",
                      fontSize:12, fontWeight:700,
                      background: poste1 === p.code ? "#1e293b" : "#f1f5f9",
                      color: poste1 === p.code ? "#fff" : "#475569",
                    }}>{p.label}</button>
                  ))}
                </div>
              ) : (
                <input
                  value={poste1}
                  onChange={e => setPoste1(e.target.value)}
                  placeholder="ex: CCL, LNE, LC..."
                  style={{
                    width:"100%", padding:"8px 12px",
                    border:"1.5px solid #e2e8f0", borderRadius:8,
                    fontSize:13, outline:"none", boxSizing:"border-box",
                  }}
                />
              )}
            </div>
          )}

          {/* Horaires */}
          {isTravail && (
            <div>
              <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>
                Horaires
              </div>
              <input
                value={horaires1}
                onChange={e => setHoraires1(e.target.value)}
                placeholder="ex: 06h10–14h17"
                style={{
                  width:"100%", padding:"8px 12px",
                  border:"1.5px solid #e2e8f0", borderRadius:8,
                  fontSize:13, fontFamily:"monospace", outline:"none", boxSizing:"border-box",
                }}
              />
            </div>
          )}

          {/* Ajouter une nuit */}
          {!debutNuit && type1 && (
            <button onClick={() => setConfirmNuit(true)} style={{
              padding:"12px", background:"#f8fafc",
              border:"1.5px dashed #cbd5e1", borderRadius:10,
              cursor:"pointer", fontSize:13, fontWeight:600, color:"#475569",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            }}>
              🌙 + Ajouter un début de nuit ce soir
            </button>
          )}

          {/* Confirmation nuit */}
          {confirmNuit && !debutNuit && (
            <div style={{background:"#1e293b",borderRadius:12,padding:"14px 16px",color:"#fff"}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>
                🌙 Ajouter une nuit ce soir ?
              </div>
              <div style={{fontSize:11,color:"#94a3b8",marginBottom:12}}>
                La nuit débutera à 22h15 et se terminera le lendemain matin. Elle sera comptée comme 1 seul jour de travail.
              </div>
              {/* Poste nuit */}
              {getPostes("N").length > 0 && (
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>Poste de nuit</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {getPostes("N").map(p => (
                      <button key={p.code} onClick={() => setPosteNuit(p.code)} style={{
                        padding:"5px 10px", borderRadius:7, border:"none", cursor:"pointer",
                        fontSize:11, fontWeight:700,
                        background: posteNuit === p.code ? "#fff" : "rgba(255,255,255,.1)",
                        color: posteNuit === p.code ? "#1e293b" : "#fff",
                      }}>{p.label}</button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                <button onClick={() => setConfirmNuit(false)} style={{
                  flex:1, padding:"8px", background:"rgba(255,255,255,.1)",
                  border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:12,
                }}>Annuler</button>
                <button onClick={() => { setDebutNuit(true); setConfirmNuit(false); }} style={{
                  flex:2, padding:"8px", background:"#3b82f6",
                  border:"none", borderRadius:8, color:"#fff", cursor:"pointer",
                  fontSize:12, fontWeight:700,
                }}>✓ Confirmer la nuit</button>
              </div>
            </div>
          )}

          {/* Nuit ajoutée */}
          {debutNuit && (
            <div style={{
              background:"#1e293b", color:"#fff",
              borderRadius:10, padding:"10px 14px",
              display:"flex", justifyContent:"space-between", alignItems:"center",
            }}>
              <div>
                <div style={{fontSize:12,fontWeight:700}}>🌙 Nuit ajoutée — 22h15–06h17</div>
                <div style={{fontSize:11,opacity:.7,marginTop:2}}>
                  Bas de cette case + haut de demain automatique
                </div>
              </div>
              <button onClick={() => { setDebutNuit(false); setPosteNuit(""); }} style={{
                background:"rgba(255,255,255,.15)", border:"none",
                color:"#fff", cursor:"pointer", borderRadius:6,
                padding:"4px 8px", fontSize:11,
              }}>Retirer</button>
            </div>
          )}

        </div>

        {/* ACTIONS */}
        <div style={{
          padding:"14px 20px", borderTop:"1px solid #e2e8f0",
          display:"flex", gap:8, flexShrink:0, background:"#fff",
        }}>
          <button onClick={onDelete} style={{
            padding:"10px 14px", background:"#fef2f2", color:"#dc2626",
            border:"none", borderRadius:10, cursor:"pointer",
            fontSize:12, fontWeight:700,
          }}>🗑 Effacer</button>
          <button onClick={onClose} style={{
            flex:1, padding:"10px", background:"#f1f5f9", color:"#64748b",
            border:"none", borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:600,
          }}>Annuler</button>
          <button onClick={sauvegarder} disabled={!canSave} style={{
            flex:2, padding:"10px",
            background: canSave ? "#1e293b" : "#e2e8f0",
            color: canSave ? "#fff" : "#94a3b8",
            border:"none", borderRadius:10,
            cursor: canSave ? "pointer" : "default",
            fontSize:13, fontWeight:700,
          }}>✓ Enregistrer</button>
        </div>

      </div>
    </div>
  );
}
