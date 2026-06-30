const fs = require('fs');
const path = './src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

// ── 1. Remplacement du composant EchangesView ────────────────
const startMarker = 'function EchangesView';
const startIdx = content.indexOf(startMarker);
if (startIdx === -1) {
  console.error('Marqueur de début (EchangesView) introuvable. Aucune modification effectuée.');
  process.exit(1);
}

const endMarker = 'function ProfilPersoView';
const endIdx = content.indexOf(endMarker, startIdx);
if (endIdx === -1) {
  console.error('Marqueur de fin (ProfilPersoView) introuvable. Aucune modification effectuée.');
  process.exit(1);
}

console.log('Ancien bloc EchangesView : ' + (endIdx - startIdx) + ' caractères détectés.');

const newComponent = `function EchangesView({agents,currentAgent}){
  const [echanges,setEchanges]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [form,setForm]=useState({date:"",creneaux:[],secteurs:[],urgent:false,motif:""});
  const [cloturantId,setCloturantId]=useState(null);
  const [cloturantCp,setCloturantCp]=useState("");

  const CRENEAUX=[["matin","Matin"],["journee","Journée"],["soiree","Soirée"],["nuit","Nuit"],["indifferent","Indifférent"]];
  const SECTEURS=[["PRCI","PRCI"],["PAR","PAR"],["indifferent","Indifférent"]];

  const charger=useCallback(()=>{
    api.echanges.getAll().then(rows=>{setEchanges(rows||[]);setLoading(false);}).catch(()=>setLoading(false));
  },[]);

  useEffect(()=>{
    charger();
    const idInterval=setInterval(charger,45000);
    return ()=>clearInterval(idInterval);
  },[charger]);

  if(!currentAgent)return(<div style={{textAlign:"center",padding:"60px 20px",color:"#94a3b8"}}><div style={{fontSize:40,marginBottom:12}}>🔄</div><div style={{fontSize:15,fontWeight:600,color:"#475569"}}>Sélectionne ton profil</div></div>);

  const toggleVal=(arr,v)=>arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];

  const resetForm=()=>{setForm({date:"",creneaux:[],secteurs:[],urgent:false,motif:""});setEditingId(null);setShowForm(false);};

  const soumettre=async()=>{
    if(!form.date){alert("Choisis une date.");return;}
    try{
      if(editingId){
        await api.echanges.update(editingId,{creneaux_souhaites:form.creneaux,secteurs_souhaites:form.secteurs,urgent:form.urgent,motif:form.motif||null});
      }else{
        await api.echanges.create({date_jour:form.date,creneaux_souhaites:form.creneaux,secteurs_souhaites:form.secteurs,urgent:form.urgent,motif:form.motif||null});
      }
      resetForm();
      charger();
    }catch(e){alert(e.message||"Erreur lors de l'enregistrement.");}
  };

  const ouvrirEdition=(e)=>{
    setEditingId(e.id);
    const d=(e.date_jour||"").split("T")[0];
    setForm({date:d,creneaux:(e.creneaux_souhaites||"").split(",").filter(Boolean),secteurs:(e.secteurs_souhaites||"").split(",").filter(Boolean),urgent:!!e.urgent,motif:e.motif||""});
    setShowForm(true);
  };

  const interesser=async(id)=>{
    try{await api.echanges.toggleInteret(id);charger();}catch(e){alert(e.message||"Erreur.");}
  };

  const supprimer=async(id)=>{
    if(!window.confirm("Supprimer cette demande d'échange ?"))return;
    try{await api.echanges.delete(id);charger();}catch(e){alert(e.message||"Erreur.");}
  };

  const cloturer=async(id)=>{
    if(!cloturantCp){alert("Choisis avec qui tu as échangé.");return;}
    if(!window.confirm("Rappel : n'oublie pas d'indiquer cet échange dans le planning CPS officiel.\\n\\nConfirmer la clôture ?"))return;
    try{await api.echanges.cloturer(id,cloturantCp);setCloturantId(null);setCloturantCp("");charger();}catch(e){alert(e.message||"Erreur.");}
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
      <div style={{fontSize:16,fontWeight:700,color:"#1e293b"}}>🔄 Échanges</div>
      <button onClick={()=>{resetForm();setShowForm(true);}} style={{background:"#1e293b",color:"#fff",border:"none",borderRadius:12,padding:"10px 18px",cursor:"pointer",fontSize:13,fontWeight:700}}>+ Nouvelle demande</button>
    </div>

    {showForm&&(<div style={{background:"#f8fafc",borderRadius:12,padding:"16px 18px",border:"1.5px solid #e2e8f0",display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{editingId?"Modifier la demande":"Nouvelle demande d'échange"}</div>

      {!editingId&&<div>
        <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Journée à échanger</div>
        <input type="date" value={form.date} onChange={ev=>setForm(p=>({...p,date:ev.target.value}))} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13,outline:"none"}}/>
      </div>}

      <div>
        <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>Créneau recherché</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {CRENEAUX.map(c=>{const v=c[0],l=c[1];const actif=form.creneaux.includes(v);return(<button key={v} onClick={()=>setForm(p=>({...p,creneaux:toggleVal(p.creneaux,v)}))} style={{border:"1.5px solid "+(actif?"#1e293b":"#e2e8f0"),background:actif?"#1e293b":"#fff",color:actif?"#fff":"#475569",borderRadius:9,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>{l}</button>);})}
        </div>
      </div>

      <div>
        <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>Secteur recherché</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {SECTEURS.map(c=>{const v=c[0],l=c[1];const actif=form.secteurs.includes(v);return(<button key={v} onClick={()=>setForm(p=>({...p,secteurs:toggleVal(p.secteurs,v)}))} style={{border:"1.5px solid "+(actif?"#1e293b":"#e2e8f0"),background:actif?"#1e293b":"#fff",color:actif?"#fff":"#475569",borderRadius:9,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>{l}</button>);})}
        </div>
      </div>

      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#475569",cursor:"pointer"}}>
        <input type="checkbox" checked={form.urgent} onChange={ev=>setForm(p=>({...p,urgent:ev.target.checked}))}/>
        Urgent (garde d'enfant, médical...)
      </label>

      <input value={form.motif} onChange={ev=>setForm(p=>({...p,motif:ev.target.value}))} placeholder="Motif (facultatif, visible par tous)" style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13,outline:"none"}}/>

      <div style={{display:"flex",gap:8}}>
        <button onClick={soumettre} style={{flex:1,background:"#1e293b",color:"#fff",border:"none",borderRadius:9,padding:"9px 0",cursor:"pointer",fontSize:13,fontWeight:700}}>{editingId?"Enregistrer":"Publier la demande"}</button>
        <button onClick={resetForm} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:9,padding:"9px 12px",cursor:"pointer",fontSize:13}}>Annuler</button>
      </div>
    </div>)}

    {loading&&<div style={{textAlign:"center",padding:"30px 20px",color:"#94a3b8",fontSize:13}}>Chargement…</div>}
    {!loading&&listeAffichee.length===0&&<div style={{textAlign:"center",padding:"30px 20px",color:"#94a3b8",fontSize:13}}>Aucune demande en cours.</div>}

    {listeAffichee.map(e=>{
      const s=styleFor(e);
      const estDemandeur=e.cp_demandeur===currentAgent.id;
      const creneaux=(e.creneaux_souhaites||"").split(",").filter(Boolean);
      const secteurs=(e.secteurs_souhaites||"").split(",").filter(Boolean);
      const dateAff=(e.date_jour||"").split("T")[0];
      const horaireTxt=e.heure_debut?(" · "+String(e.heure_debut).slice(0,5)+"–"+String(e.heure_fin||"").slice(0,5)):"";
      const rechercheTxt=creneaux.length?creneaux.join(", "):"indifférent";
      const secteurTxt=secteurs.length?(" ("+secteurs.join(", ")+")"):"";
      return(<div key={e.id} style={{background:"#fff",border:"1.5px solid "+s.border,borderRadius:12,padding:"13px 15px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Av initials={(e.prenom?e.prenom[0]:"")+(e.nom?e.nom[0]:"")} size={26}/>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>{e.prenom} {e.nom}{estDemandeur?" (toi)":""}</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>{dateAff}</div>
            </div>
          </div>
          <span style={{fontSize:10,background:s.bg,color:s.tc,borderRadius:10,padding:"3px 9px",fontWeight:700,textTransform:"uppercase"}}>{s.label}</span>
        </div>

        {e.statut==="ouverte"&&<div style={{fontSize:12,color:"#475569",marginBottom:6}}><b>{e.code_poste||"Poste"}</b>{horaireTxt} → recherche {rechercheTxt}{secteurTxt}</div>}

        {e.statut==="cloturee"&&<div style={{fontSize:12,color:"#475569",marginBottom:6}}>Échangé avec <b>{e.echange_avec_prenom} {e.echange_avec_nom}</b></div>}

        {e.motif&&<div style={{fontSize:11,color:"#64748b",marginBottom:8,fontStyle:"italic"}}>"{e.motif}"</div>}

        {e.statut==="ouverte"&&<div style={{fontSize:11,color:"#94a3b8",marginBottom:8}}>{e.nb_interets>0?(e.nb_interets+" intéressé(s)"):"Aucun intéressé"}</div>}

        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {!estDemandeur&&e.statut==="ouverte"&&<button onClick={()=>interesser(e.id)} style={{border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#475569",borderRadius:9,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>🤝 Je suis intéressé</button>}

          {estDemandeur&&e.statut==="ouverte"&&cloturantId!==e.id&&<button onClick={()=>ouvrirEdition(e)} style={{border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",borderRadius:9,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>Modifier</button>}

          {estDemandeur&&e.statut==="ouverte"&&cloturantId===e.id&&<>
            <select value={cloturantCp} onChange={ev=>setCloturantCp(ev.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"5px 8px",fontSize:11}}>
              <option value="">Échangé avec…</option>
              {agents.filter(a=>a.id!==currentAgent.id).map(a=>(<option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>))}
            </select>
            <button onClick={()=>cloturer(e.id)} style={{border:"none",background:"#065f46",color:"#fff",borderRadius:9,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>Confirmer</button>
            <button onClick={()=>{setCloturantId(null);setCloturantCp("");}} style={{border:"none",background:"#f1f5f9",color:"#475569",borderRadius:9,padding:"6px 10px",cursor:"pointer",fontSize:11}}>✕</button>
          </>}

          {estDemandeur&&e.statut==="ouverte"&&cloturantId!==e.id&&<button onClick={()=>setCloturantId(e.id)} style={{border:"1.5px solid #86efac",background:"#d1fae5",color:"#065f46",borderRadius:9,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>Clôturer</button>}

          {estDemandeur&&<button onClick={()=>supprimer(e.id)} style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:11,marginLeft:"auto"}}>Supprimer</button>}
        </div>
      </div>);
    })}
  </div>);
}

`;

content = content.slice(0, startIdx) + newComponent + content.slice(endIdx);

// ── 2. Mise à jour de l'appel du composant ────────────────────
const oldCall = '<EchangesView agents={agents} schedule={schedule} currentAgent={currentAgent} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles}/>';
const newCall = '<EchangesView agents={agents} currentAgent={currentAgent}/>';

if (content.indexOf(oldCall) === -1) {
  console.error('Attention : ancien appel EchangesView introuvable, le composant a été remplacé mais pas son appel. Vérifie manuellement la ligne du menu.');
} else {
  content = content.replace(oldCall, newCall);
  console.log('Appel du composant mis à jour.');
}

fs.writeFileSync(path, content, 'utf8');
console.log('App.jsx mis à jour avec succès.');
