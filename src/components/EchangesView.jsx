// ─── EchangesView.jsx ──────────────────────────────────────────────────────
// Extrait d'App.jsx le 20/09 (nettoyage/perf, code-splitting) — aucun
// changement de logique, copie exacte. Demandes d'échange de poste entre
// agents, poste/horaires auto-capturés, aucune modification auto de planning
// (juste un tableau d'annonces avec intérêts) — sauf clôture, voir plus bas.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from "react";
import api, { resolveJsCode } from "../api/client";
import { Av, POSTE_REGISTRY } from "../App";

export default function EchangesView({agents,currentAgent}){
  const [echanges,setEchanges]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [form,setForm]=useState({date:"",creneaux:[],urgent:false,motif:""});
  const [cloturantId,setCloturantId]=useState(null);
  const [cloturantCp,setCloturantCp]=useState("");

  const CRENEAUX=[["matin","Matin"],["journee","Journée"],["soiree","Soirée"],["nuit","Nuit"],["indifferent","Indifférent"]];

  const charger=useCallback(()=>{
    api.echanges.getAll().then(rows=>{setEchanges(rows||[]);setLoading(false);}).catch(()=>setLoading(false));
  },[]);

  useEffect(()=>{
    charger();
    const idInterval=setInterval(charger,45000);
    return ()=>clearInterval(idInterval);
  },[charger]);

  if(!currentAgent)return(<div style={{textAlign:"center",padding:"62px 22px",color:"#94a3b8"}}><div style={{fontSize:42,marginBottom:12}}>🔄</div><div style={{fontSize:17,fontWeight:600,color:"#475569"}}>Sélectionne ton profil</div></div>);

  const toggleVal=(arr,v)=>arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];

  const resetForm=()=>{setForm({date:"",creneaux:[],urgent:false,motif:""});setEditingId(null);setShowForm(false);};

  const soumettre=async()=>{
    if(!form.date){alert("Choisis une date.");return;}
    try{
      if(editingId){
        await api.echanges.update(editingId,{date_jour:form.date,creneaux_souhaites:form.creneaux,urgent:form.urgent,motif:form.motif||null});
      }else{
        await api.echanges.create({date_jour:form.date,creneaux_souhaites:form.creneaux,urgent:form.urgent,motif:form.motif||null});
      }
      resetForm();
      charger();
    }catch(e){alert(e.message||"Erreur lors de l'enregistrement.");}
  };

  const ouvrirEdition=(e)=>{
    setEditingId(e.id);
    const d=(e.date_jour||"").split("T")[0];
    setForm({date:d,creneaux:(e.creneaux_souhaites||"").split(",").filter(Boolean),urgent:!!e.urgent,motif:e.motif||""});
    setShowForm(true);
  };

  const interesser=async(id)=>{
    try{await api.echanges.toggleInteret(id);charger();}catch(e){alert(e.message||"Erreur.");}
  };

  const supprimer=async(id)=>{
    if(!window.confirm("Supprimer cette demande d'échange ?"))return;
    try{await api.echanges.delete(id);charger();}catch(e){alert(e.message||"Erreur.");}
  };

  // 24/08 (demande d'Olivier : "que les echanges de journee se note
  // automatiquement dans le planning cps") : si la demande porte assez
  // d'info pour retrouver le code CPS exact (code_equipe/famille -- absents
  // sur une demande deja ouverte avant ce correctif), la cloture ecrit
  // automatiquement l'echange dans CPS Officiel (meme mecanisme qu'un
  // echange signale a la main, meme bouton d'annulation ✕ ouvert a
  // n'importe quel agent connecte -- pas seulement demandeur/accepteur).
  // Sinon (vieille demande), on retombe sur l'ancien pense-bete manuel --
  // jamais bloquant, la cloture elle-meme reste toujours possible.
  const cloturer=async(id)=>{
    if(!cloturantCp){alert("Choisis avec qui tu as échangé.");return;}
    const echange=echanges.find(e=>e.id===id);
    // resolveJsCode (24/08, cas reel signale par Olivier : "message trop
    // ancienne" affiche a tort sur une demande flambant neuve) -- un jour
    // capture depuis un planning importe via "declare previsionnel" a deja
    // son code_poste au format canonique ("PICCLO") plutot que le code court
    // local ("CCL") attendu par convertirCodePosteVersJsCode seule -- garde
    // ce cas en plus du cas normal, jamais l'inverse.
    const jsCode=echange&&echange.code_equipe
      ? resolveJsCode(echange.code_poste,echange.code_equipe)
      : null;
    // familleReelle (24/08, cas reel trouve en testant) : la famille du
    // POSTE lui-meme (via POSTE_REGISTRY, deja construit ailleurs dans ce
    // fichier -- non ambigue pour un poste fixe, ex: PICCLO est forcement
    // PRCI) prime sur celle du DEMANDEUR capturee a la creation, qui peut
    // diverger (postes generiques multi-familles, renfort occasionnel...).
    // Sans ca, l'alea aurait pu se creer avec la mauvaise famille et ne
    // jamais s'afficher sur le bon poste dans CPS Officiel.
    const familleReelle=(jsCode&&POSTE_REGISTRY[jsCode]?.famille)||(echange&&echange.famille)||null;
    // Cote reciproque (24/08, signale par Olivier : "si on echange nos
    // journee il faut le message pour les 2 postes echanges [...] celui qui
    // accepte de faire la matinee laisse sa place a l'autre pour faire sa
    // soiree sinon il y a un poste non couvert") -- un vrai echange est un
    // troc : si cloturantCp (celui avec qui l'echange a eu lieu) avait
    // lui-meme un poste ce jour-la, ce poste doit aussi basculer vers le
    // demandeur, sinon il reste affiche comme "couvert par cloturantCp" alors
    // qu'il n'y est plus. Recherche best-effort (jamais bloquant).
    let jsCode2=null, familleReelle2=null;
    try{
      const jourReciproque=await api.echanges.posteDuJour(cloturantCp,echange.date_jour);
      if(jourReciproque&&jourReciproque.code_equipe){
        jsCode2=resolveJsCode(jourReciproque.code_poste,jourReciproque.code_equipe);
        familleReelle2=(jsCode2&&POSTE_REGISTRY[jsCode2]?.famille)||null;
      }
    }catch(e){/* best-effort, la cloture reste possible sans */}
    const auto=!!(jsCode&&familleReelle);
    const auto2=!!(jsCode2&&familleReelle2&&jsCode2!==jsCode);
    const message=auto&&auto2
      ? "L'échange sera noté automatiquement dans le planning CPS Officiel pour LES DEUX postes échangés (le tien et celui de l'agent avec qui tu as échangé) -- comme un échange signalé à la main, annulable par n'importe qui.\n\nConfirmer la clôture ?"
      : auto
      ? "L'échange sera noté automatiquement dans le planning CPS Officiel (comme un échange signalé à la main, annulable par n'importe qui).\n\nConfirmer la clôture ?"
      : "Cette demande ne peut pas être notée automatiquement dans CPS Officiel (poste non reconnu ou demande trop ancienne) -- n'oublie pas de l'indiquer toi-même.\n\nConfirmer la clôture ?";
    if(!window.confirm(message))return;
    try{await api.echanges.cloturer(id,cloturantCp,jsCode,familleReelle,auto2?jsCode2:null,auto2?familleReelle2:null);setCloturantId(null);setCloturantCp("");charger();}catch(e){alert(e.message||"Erreur.");}
  };

  const STATUT_STYLE={
    ouverte_urgent:{border:"#fca5a5",bg:"#fee2e2",tc:"#991b1b",label:"urgent"},
    ouverte:{border:"#fdba74",bg:"#fef3c7",tc:"#92400e",label:"ouverte"},
    cloturee:{border:"#86efac",bg:"#d1fae5",tc:"#065f46",label:"clôturée"},
    expiree:{border:"#e2e8f0",bg:"#f1f5f9",tc:"#94a3b8",label:"expirée"},
  };
  const styleFor=e=>e.statut==="ouverte"?(e.urgent?STATUT_STYLE.ouverte_urgent:STATUT_STYLE.ouverte):(STATUT_STYLE[e.statut]||STATUT_STYLE.expiree);

  const mesDemandes=echanges.filter(e=>e.cp_demandeur===currentAgent.id);
  const autresDemandes=echanges.filter(e=>e.cp_demandeur!==currentAgent.id);
  const listeAffichee=[...mesDemandes,...autresDemandes];

  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{fontSize:18,fontWeight:700,color:"var(--text-primary)"}}>🔄 Échanges</div>
      <button onClick={()=>{resetForm();setShowForm(true);}} style={{background:"#1e293b",color:"#fff",border:"none",borderRadius:12,padding:"12px 20px",cursor:"pointer",fontSize:15,fontWeight:700}}>+ Nouvelle demande</button>
    </div>

    {showForm&&(<div style={{background:"#f8fafc",borderRadius:12,padding:"18px 20px",border:"1.5px solid #e2e8f0",display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:15,fontWeight:700,color:"#1e293b"}}>{editingId?"Modifier la demande":"Nouvelle demande d'échange"}</div>

      <div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:4}}>Journée à échanger</div>
        <div style={{display:"flex",gap:6}}>
          <input type="date" value={form.date} onChange={ev=>setForm(p=>({...p,date:ev.target.value}))} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:15,outline:"none"}}/>
          {form.date&&<button type="button" onClick={()=>setForm(p=>({...p,date:""}))} title="Effacer"
            style={{border:"1.5px solid #e2e8f0",borderRadius:8,background:"#f8fafc",color:"#64748b",cursor:"pointer",padding:"0 12px",fontSize:14}}>×</button>}
        </div>
      </div>

      <div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:6}}>Créneau recherché</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {CRENEAUX.map(c=>{const v=c[0],l=c[1];const actif=form.creneaux.includes(v);return(<button key={v} onClick={()=>setForm(p=>({...p,creneaux:toggleVal(p.creneaux,v)}))} style={{border:"1.5px solid "+(actif?"#1e293b":"#e2e8f0"),background:actif?"#1e293b":"#fff",color:actif?"#fff":"#475569",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:14,fontWeight:600}}>{l}</button>);})}
        </div>
      </div>

      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:15,color:"#475569",cursor:"pointer"}}>
        <input type="checkbox" checked={form.urgent} onChange={ev=>setForm(p=>({...p,urgent:ev.target.checked}))}/>
        Urgent (garde d'enfant, médical...)
      </label>

      <input value={form.motif} onChange={ev=>setForm(p=>({...p,motif:ev.target.value}))} placeholder="Motif (facultatif, visible par tous)" style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:15,outline:"none"}}/>

      <div style={{display:"flex",gap:8}}>
        <button onClick={soumettre} style={{flex:1,background:"#1e293b",color:"#fff",border:"none",borderRadius:9,padding:"9px 0",cursor:"pointer",fontSize:15,fontWeight:700}}>{editingId?"Enregistrer":"Publier la demande"}</button>
        <button onClick={resetForm} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:9,padding:"11px 14px",cursor:"pointer",fontSize:15}}>Annuler</button>
      </div>
    </div>)}

    {loading&&<div style={{textAlign:"center",padding:"32px 22px",color:"var(--text-secondary)",fontSize:15}}>Chargement…</div>}
    {!loading&&listeAffichee.length===0&&<div style={{textAlign:"center",padding:"32px 22px",color:"var(--text-secondary)",fontSize:15}}>Aucune demande en cours.</div>}

    {listeAffichee.map(e=>{
      const s=styleFor(e);
      const estDemandeur=e.cp_demandeur===currentAgent.id;
      const creneaux=(e.creneaux_souhaites||"").split(",").filter(Boolean);
            const dateAff=(e.date_jour||"").split("T")[0];
      const horaireTxt=e.heure_debut?(" · "+String(e.heure_debut).slice(0,5)+"–"+String(e.heure_fin||"").slice(0,5)):"";
      const rechercheTxt=creneaux.length?creneaux.join(", "):"indifférent";
            return(<div key={e.id} style={{background:"#fff",border:"1.5px solid "+s.border,borderRadius:12,padding:"15px 17px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Av initials={(e.prenom?e.prenom[0]:"")+(e.nom?e.nom[0]:"")} size={30}/>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{e.prenom} {e.nom}{estDemandeur?" (toi)":""}</div>
              <div style={{fontSize:12,color:"#94a3b8"}}>{dateAff}</div>
            </div>
          </div>
          <span style={{fontSize:12,background:s.bg,color:s.tc,borderRadius:10,padding:"5px 11px",fontWeight:700,textTransform:"uppercase"}}>{s.label}</span>
        </div>

        {e.statut==="ouverte"&&<div style={{fontSize:14,color:"#475569",marginBottom:6}}><b>{e.poste_label||e.code_poste||"Poste"}</b>{horaireTxt} → recherche {rechercheTxt}</div>}

        {e.statut==="cloturee"&&<div style={{fontSize:14,color:"#475569",marginBottom:6}}>Échangé avec <b>{e.echange_avec_prenom} {e.echange_avec_nom}</b></div>}

        {e.motif&&<div style={{fontSize:13,color:"#64748b",marginBottom:8,fontStyle:"italic"}}>"{e.motif}"</div>}

        {e.statut==="ouverte"&&<div style={{fontSize:13,color:"#94a3b8",marginBottom:8}}>{e.nb_interets>0?("Intéressé(s) : "+e.interesses_noms):"Aucun intéressé"}</div>}

        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {!estDemandeur&&e.statut==="ouverte"&&<button onClick={()=>interesser(e.id)} style={{border:"1.5px solid "+(e.mon_interet?"#1e293b":"#e2e8f0"),background:e.mon_interet?"#1e293b":"#f8fafc",color:e.mon_interet?"#fff":"#475569",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>{e.mon_interet?"✅ Intéressé":"🤝 Je suis intéressé"}</button>}

          {estDemandeur&&e.statut==="ouverte"&&cloturantId!==e.id&&<button onClick={()=>ouvrirEdition(e)} style={{border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>Modifier</button>}

          {estDemandeur&&e.statut==="ouverte"&&cloturantId===e.id&&<>
            <select value={cloturantCp} onChange={ev=>setCloturantCp(ev.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontSize:13}}>
              <option value="">Échangé avec…</option>
              {agents.filter(a=>a.id!==currentAgent.id).map(a=>(<option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>))}
            </select>
            <button onClick={()=>cloturer(e.id)} style={{border:"none",background:"#065f46",color:"#fff",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>Confirmer</button>
            <button onClick={()=>{setCloturantId(null);setCloturantCp("");}} style={{border:"none",background:"#f1f5f9",color:"#475569",borderRadius:9,padding:"8px 12px",cursor:"pointer",fontSize:13}}>✕</button>
          </>}

          {estDemandeur&&e.statut==="ouverte"&&cloturantId!==e.id&&<button onClick={()=>setCloturantId(e.id)} style={{border:"1.5px solid #86efac",background:"#d1fae5",color:"#065f46",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>Clôturer</button>}

          {estDemandeur&&<button onClick={()=>supprimer(e.id)} style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,marginLeft:"auto"}}>Supprimer</button>}
        </div>
      </div>);
    })}
  </div>);
}
