// ─── DayEditPopup.jsx ─────────────────────────────────────────────────────────
// Popup de saisie — F2P.PMP
// Logique définitive :
//   - 🌙 toggle indépendant : coexiste avec tout, non comptabilisé, sauvegardé
//   - N = nuit du soir, s'affiche toujours en bas de case
//   - Pas de propagation automatique sur J+1
//   - Pas de grisage, pas de blocage
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";

const CODES_REPOS = [
  { code:"RP",  label:"RP",        color:"#16a34a" },
  { code:"RPP", label:"RPP",       color:"#0d9488" },
  { code:"RU",  label:"RU",        color:"#ca8a04" },
  { code:"RQ",  label:"RQ",        color:"#ca8a04" },
  { code:"TC",  label:"TC",        color:"#0284c7" },
  { code:"TY",  label:"TY",        color:"#0284c7" },
  { code:"RN",  label:"RN",        color:"#4338ca" },
  { code:"NU",  label:"NU",        color:"#475569" },
  { code:"CA",  label:"Congés",    color:"#eab308" },
  { code:"MA",  label:"Maladie",   color:"#dc2626" },
  { code:"VT",  label:"VT",        color:"#eab308" },
  { code:"ABS", label:"Absent",    color:"#dc2626" },
  { code:"FOR", label:"Formation", color:"#b45309" },
];

const CODES_TRAVAIL = [
  { code:"M",  label:"Matin",    heures:"06h10–14h17", color:"#8B0000" },
  { code:"AM", label:"Soir",     heures:"14h05–22h17", color:"#8B0000" },
  { code:"N",  label:"Nuit ↓",   heures:"22h15–06h17", color:"#1e293b" },
  { code:"J",  label:"Journée",  heures:"08h00–17h45", color:"#8B0000" },
];

const FETES = [
  {code:"F1",label:"1er Jan."},{code:"F2",label:"Lundi Pâques"},
  {code:"F3",label:"1er Mai"},{code:"F4",label:"Ascension"},
  {code:"FV",label:"8 Mai"},{code:"F5",label:"Pentecôte"},
  {code:"F6",label:"14 Juil."},{code:"F7",label:"15 Août"},
  {code:"F8",label:"1er Nov."},{code:"F9",label:"11 Nov."},
  {code:"F0",label:"Noël"},{code:"VN",label:"Veille Noël"},
  {code:"JF",label:"Fête SNCF"},
];

const POSTES_PRCI = [
  {code:"CCL",  label:"CCL",         types:["M","AM","N"]},
  {code:"ADJ",  label:"Adj CCL",     types:["M","AM","N"]},
  {code:"LNE",  label:"AC LNE",      types:["M","AM","N"]},
  {code:"LNO",  label:"AC LNO",      types:["M","AM","N"]},
  {code:"VGD",  label:"AC VGD",      types:["M","AM"]},
  {code:"LC",   label:"AC LC",       types:["M","AM","N"]},
  {code:"PA1J", label:"Pauseur PA1", types:["J"]},
  {code:"PA2J", label:"Pauseur PA2", types:["J"]},
  {code:"PA3J", label:"Pauseur PA3", types:["J"]},
  {code:"DPXJ", label:"DPX PRCI",    types:["J"]},
  {code:"ASSJ", label:"Adj DPX",     types:["J"]},
  {code:"PPRCI",label:"PPRCI",       types:["J","M","AM"]},
  {code:"AFOPR",label:"AFO PRCI",    types:["J"]},
];

const POSTES_PAR = [
  {code:"AC1",  label:"AC PAR",      types:["M","AM","N"]},
  {code:"AC2",  label:"Aide AC PAR", types:["M","AM","N"]},
  {code:"ACXX", label:"CT Travaux",  types:["N"]},
  {code:"PARJ", label:"Pauseur PAR", types:["J"]},
  {code:"DPXP", label:"DPX PAR",     types:["J"]},
  {code:"ASMP", label:"ASMTE PAR",   types:["J"]},
  {code:"PPAR", label:"PPAR", types:["J"]},
];

const HORAIRES_DEFAUT = { M:"06h10–14h17", AM:"14h05–22h17", N:"22h15–06h17", J:"08h00–17h45" };

export default function DayEditPopup({ date, entry, agent, agentProfiles, onSave, onDelete, onClose }) {

  const agKey = agent?.immatriculation || agent?.cp || agent?.id;
  const profile = agentProfiles?.[agKey] || {};
  const noteColor = profile.agentColors?.NOTE || "#b45309";
  const famille = agent?.famille || "PRCI";
  const tous_postes = famille === "PAR"
    ? [...POSTES_PAR, ...POSTES_PRCI]
    : [...POSTES_PRCI, ...POSTES_PAR];

  const habCodes = useMemo(() => {
    const habs = profile.habilitations || {};
    if (Array.isArray(habs)) return habs.map(h => h.code_poste);
    return Object.entries(habs).filter(([,v]) => v === "HC").map(([k]) => k);
  }, [profile.habilitations]);

  const getPostes = (type) => {
    if (!["M","AM","N","J"].includes(type)) return [];
    const postes = tous_postes.filter(p => p.types.includes(type));
    if (habCodes.length === 0) return postes;
    return postes.filter(p =>
      p.code === "PPRCI" || p.code === "PPAR" ||
      habCodes.some(h => h.includes(p.code) || p.code.includes(h.slice(0,4)))
    );
  };

  // ── Initialisation ────────────────────────────────────────────────────────
  // N seule (equipe="N" sans equipe2) = nuit du soir → typeN="N", type1=null
  // N avec equipe2="N" = journée + nuit → type1=entry.equipe (M/AM/J), typeN="N"
  // Sinon : type1=entry.equipe, typeN=null

  // Nuit seule = equipe="N" sans journée (equipe2=null OU equipe2="N" avec equipe="N")
  const isNuitSeule = entry?.equipe === "N" && (entry?.equipe2 === "N" || !entry?.equipe2);

  const initType1 = isNuitSeule ? null : (entry?.equipe || null);
  const initTypeN = (entry?.equipe2 === "N" || isNuitSeule) ? "N" : null;
  const initPoste1 = isNuitSeule ? "" : (entry?.jsCode || "");
  const initPosteN = isNuitSeule ? (entry?.jsCode || "") : (entry?.jsCode2 || "");
  const initHoraires = isNuitSeule ? "" : (entry?.horaires || "");

  const [type1,     setType1]     = useState(initType1);
  const [poste1,    setPoste1]    = useState(initPoste1);
  const [horaires1, setHoraires1] = useState(initHoraires);
  const [typeN,     setTypeN]     = useState(initTypeN);
  const [posteN,    setPosteN]    = useState(initPosteN);
  // 🌙 finNuit : toggle indépendant, coexiste avec tout
  const [finNuit,   setFinNuit]   = useState(!!entry?.finNuit);
  const [notePerso, setNotePerso] = useState(entry?.notePerso || "");
  const [showFetes, setShowFetes] = useState(false);

  const dateObj = new Date(date + "T12:00:00");
  const dateLabel = dateObj.toLocaleDateString("fr-FR", {
    weekday:"long", day:"numeric", month:"long"
  });

  const getColor = (code) => {
    const t = CODES_TRAVAIL.find(t => t.code === code);
    if (t) return t.color;
    const r = CODES_REPOS.find(r => r.code === code);
    if (r) return r.color;
    if (FETES.find(f => f.code === code)) return "#ec4899";
    return "#64748b";
  };

  // Toggle type journée
  const toggleType1 = (code) => {
    if (code === "N") {
      // N = nuit du soir, géré par typeN
      setTypeN(prev => prev ? null : "N");
      if (typeN) setPosteN("");
      return;
    }
    if (type1 === code) {
      setType1(null);
      setPoste1("");
      setHoraires1("");
    } else {
      setType1(code);
      setHoraires1(["M","AM","J"].includes(code) ? (HORAIRES_DEFAUT[code] || "") : "");
      setPoste1("");
      setShowFetes(false);
    }
  };

  const isTravailJ = type1 && ["M","AM","J"].includes(type1);
  const postesJ = isTravailJ ? getPostes(type1) : [];
  const postesN = getPostes("N");

  const sauvegarder = () => {
    const newEntry = {
      equipe:     type1 || null,
      jsCode:     isTravailJ ? (poste1 || null) : null,
      horaires:   horaires1 || null,
      equipe2:    typeN || null,
      jsCodeNuit: typeN ? (posteN || null) : null,
      prive:      (type1===null&&typeN==="N") ? false : !["M","AM","N","J","JF","FOR","DISPO",
                    ...FETES.map(f=>f.code)].includes(type1),
      finNuit:    finNuit,
      notePerso:  notePerso || null,   // indépendant, disponible sur tout type de jour, sauvegardé tel quel
    };
    onSave(newEntry);
  };

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
          padding:"14px 18px",
          display:"flex", justifyContent:"space-between", alignItems:"center",
          flexShrink:0,
        }}>
          <div>
            <div style={{
              color:"#94a3b8", fontSize:10, fontWeight:700,
              textTransform:"uppercase", letterSpacing:.5,
            }}>
              {dateLabel}
            </div>
            {/* Aperçu */}
            <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap"}}>
              {finNuit && (
                <span style={{
                  background:"#0f172a", border:"1px solid #3b82f6",
                  color:"#93c5fd", fontSize:10, fontWeight:700,
                  padding:"2px 8px", borderRadius:5,
                }}>🌙</span>
              )}
              {notePerso && (
                <span style={{
                  background:"#422006", border:"1px solid #d97706",
                  color:"#fcd34d", fontSize:10, fontWeight:700,
                  padding:"2px 8px", borderRadius:5,
                }}>📝</span>
              )}
              {type1 && (
                <span style={{
                  background:getColor(type1), color:"#fff",
                  fontSize:10, fontWeight:700,
                  padding:"2px 7px", borderRadius:5,
                }}>
                  {type1}{poste1 ? " · "+poste1 : ""}
                </span>
              )}
              {typeN && (
                <span style={{
                  background:"#1e293b", color:"#fff",
                  fontSize:10, fontWeight:700,
                  padding:"2px 7px", borderRadius:5,
                }}>
                  Nuit{posteN ? " · "+posteN : ""} ↓
                </span>
              )}
              {!finNuit && !type1 && !typeN && !notePerso && (
                <span style={{color:"#475569",fontSize:10}}>case vide</span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            background:"rgba(255,255,255,.1)", border:"none",
            color:"#fff", cursor:"pointer", borderRadius:8,
            width:32, height:32, fontSize:16, flexShrink:0,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>✕</button>
        </div>

        {/* CONTENU */}
        <div style={{
          overflowY:"auto", flex:1, padding:"14px 16px",
          display:"flex", flexDirection:"column", gap:14,
        }}>

          {/* ── 🌙 Toggle fin nuit — indépendant ── */}
          <button onClick={() => setFinNuit(v => !v)} style={{
            width:"100%", padding:"10px 14px",
            background: finNuit ? "#0f172a" : "#f8fafc",
            border: finNuit ? "2px solid #3b82f6" : "1.5px dashed #cbd5e1",
            borderRadius:10, cursor:"pointer",
            fontSize:12, fontWeight:700,
            color: finNuit ? "#93c5fd" : "#64748b",
            display:"flex", alignItems:"center", gap:8,
            transition:"all .15s",
          }}>
            🌙 Descente de nuit
            <span style={{
              marginLeft:"auto", fontSize:10, fontWeight:700,
              background: finNuit ? "#1e3a8a" : "#e2e8f0",
              color: finNuit ? "#bfdbfe" : "#94a3b8",
              borderRadius:6, padding:"1px 8px",
            }}>
              {finNuit ? "actif" : "inactif"}
            </span>
          </button>

          {/* ── 📝 Note perso — indépendant, visible uniquement par toi ── */}
          <div style={{
            padding:"10px 14px",
            background: notePerso ? "#1a1207" : "#f8fafc",
            border: `2px solid ${notePerso ? noteColor : "#cbd5e1"}`,
            borderStyle: notePerso ? "solid" : "dashed",
            borderRadius:10,
            transition:"all .15s",
          }}>
            <div style={{
              fontSize:12, fontWeight:700,
              color: notePerso ? noteColor : "#64748b",
              display:"flex", alignItems:"center", gap:8,
              marginBottom:8,
            }}>
              📝 Note (visible uniquement par toi)
              <span style={{
                marginLeft:"auto", fontSize:10, fontWeight:700,
                background: notePerso ? noteColor : "#e2e8f0",
                color: notePerso ? "#fff" : "#94a3b8",
                borderRadius:6, padding:"1px 8px",
              }}>
                {notePerso ? "actif" : "inactif"}
              </span>
            </div>
            <div style={{display:"flex", gap:6, alignItems:"center"}}>
              <input
                value={notePerso}
                onChange={e => setNotePerso(e.target.value)}
                placeholder="ex: Réunion service, visite de poste, rappel..."
                style={{
                  flex:1, padding:"9px 11px",
                  border: `1.5px solid ${notePerso ? noteColor : "#e2e8f0"}`,
                  borderRadius:8, background:"#fff",
                  fontSize:14, fontWeight:600, color:"#1e293b",
                  outline:"none", boxSizing:"border-box",
                }}
              />
              {notePerso && (
                <button onClick={() => setNotePerso("")} title="Effacer la note"
                  style={{
                    flexShrink:0, width:36, height:36,
                    background:"#fff", border:"1.5px solid #fca5a5",
                    borderRadius:8, cursor:"pointer",
                    color:"#dc2626", fontSize:15, fontWeight:800,
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>✕</button>
              )}
            </div>
          </div>

          {/* ── Repos / Absences ── */}
          <div>
            <div style={{
              fontSize:10, color:"#94a3b8", fontWeight:700,
              marginBottom:7, textTransform:"uppercase", letterSpacing:.5,
            }}>
              Repos / Absences
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {CODES_REPOS.map(r => (
                <button key={r.code} onClick={() => toggleType1(r.code)} style={{
                  padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                  fontSize:12, fontWeight:700,
                  background: type1 === r.code ? r.color : "#f1f5f9",
                  color: type1 === r.code ? "#fff" : "#475569",
                  transition:"all .1s",
                }}>{r.label}</button>
              ))}
              <button onClick={() => setShowFetes(v=>!v)} style={{
                padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                fontSize:12, fontWeight:700,
                background: showFetes || FETES.find(f=>f.code===type1) ? "#ec4899" : "#fdf2f8",
                color: showFetes || FETES.find(f=>f.code===type1) ? "#fff" : "#9d174d",
              }}>🩷 Fêtes</button>
            </div>
            {showFetes && (
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:7}}>
                {FETES.map(f => (
                  <button key={f.code} onClick={() => {
                    toggleType1(f.code); setShowFetes(false);
                  }} style={{
                    padding:"4px 9px", borderRadius:7, border:"none", cursor:"pointer",
                    fontSize:11, fontWeight:700,
                    background: type1 === f.code ? "#ec4899" : "#fdf2f8",
                    color: type1 === f.code ? "#fff" : "#9d174d",
                  }}>
                    <span>{f.code}</span>
                    <span style={{fontSize:9,opacity:.8,marginLeft:3}}>{f.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Travail ── */}
          <div>
            <div style={{
              fontSize:10, color:"#94a3b8", fontWeight:700,
              marginBottom:7, textTransform:"uppercase", letterSpacing:.5,
            }}>
              Travail
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:7}}>
              {CODES_TRAVAIL.map(t => {
                const isActive = t.code === "N" ? !!typeN : type1 === t.code;
                return (
                  <button key={t.code} onClick={() => toggleType1(t.code)} style={{
                    padding:"9px 5px", borderRadius:10, border:"none", cursor:"pointer",
                    fontSize:12, fontWeight:800,
                    background: isActive ? t.color : "#f1f5f9",
                    color: isActive ? "#fff" : "#475569",
                    display:"flex", flexDirection:"column", alignItems:"center", gap:2,
                    transition:"all .1s",
                    outline: t.code === "N" && typeN ? "2px solid #3b82f6" : "none",
                  }}>
                    <span>{t.label}</span>
                    <span style={{fontSize:8,opacity:.7}}>{t.heures.split("–")[0]}</span>
                  </button>
                );
              })}
            </div>
            <div style={{fontSize:9,color:"#94a3b8",marginTop:5,fontStyle:"italic"}}>
              Nuit ↓ = prise de nuit ce soir — s'affiche en bas de case
            </div>
          </div>

          {/* ── Poste journée ── */}
          {isTravailJ && postesJ.length > 0 && (
            <div>
              <div style={{
                fontSize:10, color:"#94a3b8", fontWeight:700,
                marginBottom:7, textTransform:"uppercase", letterSpacing:.5,
              }}>
                Poste
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {postesJ.map(p => (
                  <button key={p.code} onClick={() => setPoste1(poste1===p.code?"":p.code)} style={{
                    padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                    fontSize:12, fontWeight:700,
                    background: poste1 === p.code ? "#1e293b" : "#f1f5f9",
                    color: poste1 === p.code ? "#fff" : "#475569",
                  }}>{p.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* ── Horaires ── */}
          {isTravailJ && (
            <div>
              <div style={{
                fontSize:10, color:"#94a3b8", fontWeight:700,
                marginBottom:5, textTransform:"uppercase", letterSpacing:.5,
              }}>
                Horaires
              </div>
              <input
                value={horaires1}
                onChange={e => setHoraires1(e.target.value)}
                placeholder="ex: 06h10–14h17"
                style={{
                  width:"100%", padding:"8px 12px",
                  border:"1.5px solid #e2e8f0", borderRadius:8,
                  fontSize:13, fontFamily:"monospace",
                  outline:"none", boxSizing:"border-box",
                }}
              />
            </div>
          )}

          {/* ── Poste de nuit ── */}
          {typeN && postesN.length > 0 && (
            <div>
              <div style={{
                fontSize:10, color:"#94a3b8", fontWeight:700,
                marginBottom:5, textTransform:"uppercase", letterSpacing:.5,
              }}>
                Poste de nuit
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {postesN.map(p => (
                  <button key={p.code} onClick={() => setPosteN(posteN===p.code?"":p.code)} style={{
                    padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                    fontSize:12, fontWeight:700,
                    background: posteN === p.code ? "#1e293b" : "#f1f5f9",
                    color: posteN === p.code ? "#fff" : "#475569",
                  }}>{p.label}</button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ACTIONS */}
        <div style={{
          padding:"12px 16px", borderTop:"1px solid #e2e8f0",
          display:"flex", gap:8, flexShrink:0, background:"#fff",
        }}>
          <button onClick={onClose} style={{
            flex:1, padding:"10px", background:"#f1f5f9", color:"#64748b",
            border:"none", borderRadius:10, cursor:"pointer",
            fontSize:13, fontWeight:600,
          }}>Annuler</button>
          <button onClick={sauvegarder} style={{
            flex:2, padding:"10px",
            background:"#1e293b", color:"#fff",
            border:"none", borderRadius:10, cursor:"pointer",
            fontSize:13, fontWeight:700,
          }}>✓ Enregistrer</button>
        </div>

      </div>
    </div>
  );
}
