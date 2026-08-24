// ─── RemplissageMasseView.jsx ──────────────────────────────────────────────
// Module "Remplissage rapide" (24/08, demandé par Olivier) — Étape 1 : postes
// de travail uniquement, en bloc autonome (RP/RU/Maladie viendront ensuite,
// une fois celui-ci éprouvé — "tu prends le moins de risque du casse rien").
//
// Deux besoins distincts, dans la même fenêtre :
//  A) Remplir plusieurs jours d'un coup — un agent peu habilité (ex: un seul
//     poste) coche vacation + poste, puis les jours concernés sur l'année
//     (même mini-calendrier que RP/RU, copié à l'identique plutôt que
//     factoré, pour ne courir aucun risque sur ces modules déjà éprouvés).
//  B) Effacer le planning sur une période — pour pouvoir recommencer une
//     année déjà partiellement saisie sans que le remplissage en masse ne
//     bute sur des jours déjà occupés. Toujours réversible (sauvegarde
//     complète côté serveur avant suppression, comme l'annulation du dernier
//     import CPS Officiel déjà éprouvée sur ce projet).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import api, { convertirCodePosteVersJsCode } from "../api/client";
import { getPostesPourAgent, HORAIRES_DEFAUT, HORAIRES_POSTE } from "./DayEditPopup";

const VACATIONS = [
  { code:"M",  label:"Matinée" },
  { code:"AM", label:"Soirée" },
  { code:"N",  label:"Nuit" },
  { code:"J",  label:"Journée" },
];

const MOIS_L = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function joursDuMois(year, monthNum) {
  return new Date(year, monthNum, 0).getDate();
}
function offsetLundi(year, monthNum) {
  const dow = new Date(year, monthNum-1, 1).getDay();
  return dow===0 ? 6 : dow-1;
}
function fmtDateCourt(dk) {
  return new Date(dk+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"2-digit",month:"short",year:"numeric"});
}

export default function RemplissageMasseModal({ agent, agentProfiles, schedule, setSchedule, onClose }) {
  const agCp = agent?.immatriculation || agent?.cp || agent?.id;

  // ── Section A : remplissage en masse ──────────────────────────────────
  const [vacation, setVacation] = useState("M");
  const [posteCode, setPosteCode] = useState("");
  const postesDispo = getPostesPourAgent(agent, agentProfiles, vacation);

  const [miniMonth, setMiniMonth] = useState(()=>{
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  });
  const [joursSelect, setJoursSelect] = useState([]);
  const [fillBusy, setFillBusy] = useState(false);
  const [fillMsg, setFillMsg] = useState(null); // {ok:bool, text}

  const [miniYear, miniMonthNum] = miniMonth.split("-").map(Number);
  const miniDaysInMonth = joursDuMois(miniYear, miniMonthNum);
  const miniOffset = offsetLundi(miniYear, miniMonthNum);
  const changerMiniMois = (delta) => {
    let m = miniMonthNum + delta, y = miniYear;
    if (m<1) { m=12; y--; } else if (m>12) { m=1; y++; }
    setMiniMonth(`${y}-${String(m).padStart(2,"0")}`);
  };
  const toggleJourSelect = (dk, occupe) => {
    if (occupe) return;
    setFillMsg(null);
    setJoursSelect(prev => prev.includes(dk) ? prev.filter(x=>x!==dk) : [...prev, dk].sort());
  };

  const remplir = async () => {
    if (joursSelect.length===0 || !posteCode) return;
    setFillBusy(true); setFillMsg(null);
    const canon = convertirCodePosteVersJsCode(posteCode, vacation);
    const horaires = (canon && HORAIRES_POSTE[canon]) || HORAIRES_DEFAUT[vacation] || null;
    try {
      const res = await api.planning.bulkFill(agCp, { dates: joursSelect, codeEquipe: vacation, codePoste: posteCode, horaires });
      // Mise à jour optimiste locale des jours réellement appliqués — les
      // "ignorés" (déjà occupés entre-temps) restent inchangés dans schedule.
      setSchedule(prev => {
        const next = {...prev};
        (res.appliques||[]).forEach(d => {
          next[`${agCp}-${d}`] = { equipe: vacation, jsCode: canon || posteCode, horaires, prive: vacation!=="M"&&vacation!=="AM"&&vacation!=="N"&&vacation!=="J" };
        });
        return next;
      });
      setJoursSelect([]);
      setFillMsg({ ok:true, text: `✓ ${res.nb_appliques} jour${res.nb_appliques>1?"s":""} rempli${res.nb_appliques>1?"s":""}${res.ignores?.length ? ` · ${res.ignores.length} déjà occupé${res.ignores.length>1?"s":""} (ignoré${res.ignores.length>1?"s":""})` : ""}.` });
    } catch(e) {
      setFillMsg({ ok:false, text: e.message || "Erreur lors du remplissage. Réessaie." });
    } finally {
      setFillBusy(false);
    }
  };

  // ── Section B : effacement en masse ────────────────────────────────────
  const anneeCourante = new Date().getFullYear();
  const [clearFrom, setClearFrom] = useState(`${anneeCourante}-01-01`);
  const [clearTo, setClearTo] = useState(`${anneeCourante}-12-31`);
  const [clearConfirm, setClearConfirm] = useState(null); // {count}
  const [clearBusy, setClearBusy] = useState(false);
  const [clearMsg, setClearMsg] = useState(null);
  const [lastBatch, setLastBatch] = useState(null); // {batchId, nb, removed:{key:entry}}

  const compterJoursOccupes = () => {
    let n = 0;
    Object.entries(schedule||{}).forEach(([k,v]) => {
      if (!k.startsWith(agCp+"-")) return;
      const dk = k.slice(agCp.length+1);
      if (dk<clearFrom || dk>clearTo) return;
      if (v && (v.equipe || v.equipe2)) n++;
    });
    return n;
  };

  const demanderEffacement = () => {
    setClearMsg(null);
    if (!clearFrom || !clearTo) { setClearMsg({ok:false,text:"Choisis les 2 dates."}); return; }
    if (clearTo<clearFrom) { setClearMsg({ok:false,text:"La date de fin doit être après la date de début."}); return; }
    const n = compterJoursOccupes();
    if (n===0) { setClearMsg({ok:false,text:"Aucun jour saisi dans cette période."}); return; }
    setClearConfirm({ count:n });
  };

  const confirmerEffacement = async () => {
    setClearBusy(true); setClearMsg(null);
    // Sauvegarde locale de ce qui va disparaître, pour une annulation
    // instantanée côté UI sans attendre un rechargement complet — la vraie
    // source de vérité pour l'annulation reste le backend (bulkClearUndo),
    // ceci n'est qu'un raccourci d'affichage.
    const removed = {};
    Object.entries(schedule||{}).forEach(([k,v]) => {
      if (!k.startsWith(agCp+"-")) return;
      const dk = k.slice(agCp.length+1);
      if (dk<clearFrom || dk>clearTo) return;
      if (v && (v.equipe || v.equipe2)) removed[k] = v;
    });
    try {
      const res = await api.planning.bulkClear(agCp, clearFrom, clearTo);
      setSchedule(prev => {
        const next = {...prev};
        Object.keys(removed).forEach(k => delete next[k]);
        return next;
      });
      setLastBatch({ batchId: res.batch_id, nb: res.nb_effaces, removed });
      setClearConfirm(null);
      setClearMsg({ ok:true, text:`✓ ${res.nb_effaces} jour${res.nb_effaces>1?"s":""} effacé${res.nb_effaces>1?"s":""}.` });
    } catch(e) {
      setClearMsg({ ok:false, text: e.message || "Erreur lors de l'effacement. Réessaie." });
    } finally {
      setClearBusy(false);
    }
  };

  const annulerEffacement = async () => {
    if (!lastBatch) return;
    setClearBusy(true);
    try {
      await api.planning.bulkClearUndo(agCp, lastBatch.batchId);
      setSchedule(prev => ({ ...prev, ...lastBatch.removed }));
      setClearMsg({ ok:true, text:"✓ Effacement annulé — le planning est revenu comme avant." });
      setLastBatch(null);
    } catch(e) {
      setClearMsg({ ok:false, text: e.message || "Erreur lors de l'annulation. Réessaie." });
    } finally {
      setClearBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:520,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
        <div style={{background:"linear-gradient(135deg,#0f4c81,#1e3a5f)",padding:"18px 20px",display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",position:"sticky",top:0}}>
          <div style={{color:"#fff",fontSize:16,fontWeight:800}}>🗂️ Remplissage rapide</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer",opacity:.8}}>✕</button>
        </div>

        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:18}}>

          {/* ── Section A ── */}
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#1e293b",marginBottom:2}}>Remplir plusieurs jours</div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Choisis un poste et une vacation, puis coche tous les jours concernés — même dispersés sur l'année. Les jours déjà occupés ne sont jamais écrasés.</div>

            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              {VACATIONS.map(v => (
                <button key={v.code} onClick={()=>{setVacation(v.code);setPosteCode("");}}
                  style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                    background:vacation===v.code?"#0f4c81":"#f1f5f9",color:vacation===v.code?"#fff":"#334155"}}>
                  {v.label}
                </button>
              ))}
            </div>

            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {postesDispo.length===0
                ? <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Aucun poste habilité pour cette vacation.</div>
                : postesDispo.map(p => (
                  <button key={p.code} onClick={()=>setPosteCode(posteCode===p.code?"":p.code)}
                    style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                      background:posteCode===p.code?"#1e293b":"#f1f5f9",color:posteCode===p.code?"#fff":"#334155"}}>
                    {p.label}
                  </button>
                ))
              }
            </div>

            {posteCode && (<>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <button onClick={()=>changerMiniMois(-1)} style={{border:"none",background:"none",cursor:"pointer",fontSize:16,color:"#0f4c81",padding:"2px 8px",fontWeight:700}}>‹</button>
                <span style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>{MOIS_L[miniMonthNum-1]} {miniYear}</span>
                <button onClick={()=>changerMiniMois(1)} style={{border:"none",background:"none",cursor:"pointer",fontSize:16,color:"#0f4c81",padding:"2px 8px",fontWeight:700}}>›</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
                {["L","M","M","J","V","S","D"].map((j,i)=>(
                  <div key={i} style={{fontSize:9,fontWeight:700,color:"#94a3b8",textAlign:"center"}}>{j}</div>
                ))}
                {Array.from({length:miniOffset}).map((_,i)=><div key={"o"+i}/>)}
                {Array.from({length:miniDaysInMonth}).map((_,i)=>{
                  const day = i+1;
                  const dk = `${miniYear}-${String(miniMonthNum).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                  const v = schedule[`${agCp}-${dk}`];
                  const occupe = !!(v && (v.equipe || v.equipe2));
                  const isSel = joursSelect.includes(dk);
                  return (
                    <button key={dk} onClick={()=>toggleJourSelect(dk,occupe)} disabled={occupe}
                      style={{aspectRatio:"1",border:`1.5px solid ${isSel?"#0f4c81":occupe?"#e2e8f0":"#cbd5e1"}`,
                        borderRadius:6,background:isSel?"#0f4c81":occupe?"#f1f5f9":"#fff",
                        color:isSel?"#fff":occupe?"#cbd5e1":"#334155",
                        fontSize:11,fontWeight:700,cursor:occupe?"default":"pointer",
                        display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
                      {day}
                    </button>
                  );
                })}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8,gap:8}}>
                <span style={{fontSize:11,fontWeight:600,color:"#475569"}}>{joursSelect.length} jour{joursSelect.length>1?"s":""} sélectionné{joursSelect.length>1?"s":""}</span>
                <button onClick={remplir} disabled={joursSelect.length===0||fillBusy}
                  style={{background:(joursSelect.length===0||fillBusy)?"#cbd5e1":"#0f4c81",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:(joursSelect.length===0||fillBusy)?"default":"pointer",fontSize:12,fontWeight:700}}>
                  {fillBusy?"⏳...":"+ Remplir"}
                </button>
              </div>
            </>)}
            {fillMsg && <div style={{fontSize:11,fontWeight:600,color:fillMsg.ok?"#16a34a":"#dc2626",marginTop:8}}>{fillMsg.text}</div>}
          </div>

          {/* ── Section B ── */}
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:16}}>
            <div style={{fontSize:13,fontWeight:800,color:"#991b1b",marginBottom:2}}>⚠️ Effacer le planning</div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Pour recommencer une période déjà saisie. Toujours annulable juste après.</div>

            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              <input type="date" value={clearFrom} onChange={e=>{setClearFrom(e.target.value);setClearMsg(null);}}
                style={{flex:1,minWidth:120,padding:"7px 9px",border:"1.5px solid #fecaca",borderRadius:8,fontSize:12}}/>
              <input type="date" value={clearTo} onChange={e=>{setClearTo(e.target.value);setClearMsg(null);}}
                style={{flex:1,minWidth:120,padding:"7px 9px",border:"1.5px solid #fecaca",borderRadius:8,fontSize:12}}/>
            </div>

            {!clearConfirm ? (
              <button onClick={demanderEffacement} disabled={clearBusy}
                style={{background:"#fff",color:"#991b1b",border:"1.5px solid #fca5a5",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                Effacer cette période
              </button>
            ) : (
              <div style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:12,fontWeight:800,color:"#991b1b",marginBottom:8}}>
                  ⚠️ {clearConfirm.count} jour{clearConfirm.count>1?"s":""} seront effacés, du {fmtDateCourt(clearFrom)} au {fmtDateCourt(clearTo)}.
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setClearConfirm(null)} disabled={clearBusy}
                    style={{flex:1,background:"#fff",border:"1px solid #cbd5e1",borderRadius:8,padding:"8px",cursor:"pointer",fontSize:12,fontWeight:700,color:"#334155"}}>Annuler</button>
                  <button onClick={confirmerEffacement} disabled={clearBusy}
                    style={{flex:1,background:"#dc2626",color:"#fff",border:"none",borderRadius:8,padding:"8px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                    {clearBusy?"⏳...":"Poursuivre"}
                  </button>
                </div>
              </div>
            )}

            {clearMsg && <div style={{fontSize:11,fontWeight:600,color:clearMsg.ok?"#16a34a":"#dc2626",marginTop:8}}>{clearMsg.text}</div>}

            {lastBatch && (
              <button onClick={annulerEffacement} disabled={clearBusy}
                style={{marginTop:8,background:"none",border:"1px solid #cbd5e1",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#475569"}}>
                ↩️ Annuler cet effacement
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
