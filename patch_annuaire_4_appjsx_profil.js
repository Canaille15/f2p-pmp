// Patch 4/5 — Annuaire : ajoute email/téléphone/visibilité annuaire dans
// ProfilPersoView (src/App.jsx). Ce composant n'avait jusqu'ici aucun champ
// pour ces données bien qu'elles existent déjà côté backend.
// Usage : node patch_annuaire_4_appjsx_profil.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'App.jsx');
const NL = '\r\n';

function mustReplaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error(`[${label}] Ancre introuvable dans ${FILE}`);
  if (count > 1) throw new Error(`[${label}] Ancre trouvée ${count} fois (doit être unique) dans ${FILE}`);
  return content.replace(oldStr, newStr);
}

let content = fs.readFileSync(FILE).toString('utf-8');

// ── 1. Hooks (email, telephone, visibleAnnuaire) avant le early-return ──
const old1 = [
  `  const [partageActif,setPartageActif]=useState(!!currentAgent?.partage_previsionnel);`,
  `  const [partageBusy,setPartageBusy]=useState(false);`,
  `  const [partageMsg,setPartageMsg]=useState(null);`,
  `  if(!currentAgent)return(<div style={{textAlign:"center",padding:"60px 20px",color:"#94a3b8"}}><div style={{fontSize:40,marginBottom:12}}>🔄</div><div style={{fontSize:15,fontWeight:600,color:"#475569"}}>Sélectionne ton profil</div></div>);`,
].join(NL);

const new1 = [
  `  const [partageActif,setPartageActif]=useState(!!currentAgent?.partage_previsionnel);`,
  `  const [partageBusy,setPartageBusy]=useState(false);`,
  `  const [partageMsg,setPartageMsg]=useState(null);`,
  `  const [email,setEmail]=useState("");`,
  `  const [telephone,setTelephone]=useState("");`,
  `  const [visibleAnnuaire,setVisibleAnnuaire]=useState(true);`,
  `  const [coordBusy,setCoordBusy]=useState(false);`,
  `  const [coordMsg,setCoordMsg]=useState(null);`,
  `  useEffect(()=>{`,
  `    if(!currentAgent?.id)return;`,
  `    api.agents.getById(currentAgent.id).then(full=>{`,
  `      setEmail(full?.email||"");`,
  `      setTelephone(full?.telephone||"");`,
  `      setVisibleAnnuaire(full?.annuaire_visible===undefined||full?.annuaire_visible===null?true:!!full.annuaire_visible);`,
  `    }).catch(()=>{});`,
  `  },[currentAgent?.id]);`,
  `  if(!currentAgent)return(<div style={{textAlign:"center",padding:"60px 20px",color:"#94a3b8"}}><div style={{fontSize:40,marginBottom:12}}>🔄</div><div style={{fontSize:15,fontWeight:600,color:"#475569"}}>Sélectionne ton profil</div></div>);`,
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'profil-hooks');

// ── 2. Handlers (soumettreCoordonnees, toggleVisibleAnnuaire) avant togglePartage ──
const old2 = [
  `  const togglePartage=async()=>{`,
  `    setPartageMsg(null);`,
  `    setPartageBusy(true);`,
].join(NL);

const new2 = [
  `  const soumettreCoordonnees=async()=>{`,
  `    setCoordMsg(null);setCoordBusy(true);`,
  `    try{`,
  `      await api.annuaire.updateMesCoordonnees(currentAgent.id,{email,telephone});`,
  `      setCoordMsg({type:"success",text:"Coordonnées mises à jour"});`,
  `    }catch(err){`,
  `      setCoordMsg({type:"error",text:err.message||"Erreur lors de la mise à jour"});`,
  `    }`,
  `    setCoordBusy(false);`,
  `  };`,
  `  const toggleVisibleAnnuaire=async()=>{`,
  `    const nouvel=!visibleAnnuaire;`,
  `    setVisibleAnnuaire(nouvel);`,
  `    try{`,
  `      await api.annuaire.setVisible(currentAgent.id,nouvel);`,
  `    }catch(err){`,
  `      setVisibleAnnuaire(!nouvel);`,
  `      setCoordMsg({type:"error",text:"Erreur lors du changement de visibilité"});`,
  `    }`,
  `  };`,
  `  const togglePartage=async()=>{`,
  `    setPartageMsg(null);`,
  `    setPartageBusy(true);`,
].join(NL);

content = mustReplaceOnce(content, old2, new2, 'profil-handlers');

// ── 3. Nouvelle carte UI "Mes coordonnées" avant la carte "Changer mon PIN" ──
const old3 = [
  `    </div>`,
  `    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:18}}>`,
  `      <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>🔑 Changer mon PIN</div>`,
].join(NL);

const new3 = [
  `    </div>`,
  `    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:18}}>`,
  `      <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>📇 Mes coordonnées (Annuaire)</div>`,
  `      <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Visibles par tes collègues dans l'Annuaire, sauf si tu désactives ta visibilité ci-dessous.</div>`,
  `      <div style={{display:"flex",flexDirection:"column",gap:10}}>`,
  `        <input type="tel" placeholder="Téléphone" value={telephone} onChange={e=>setTelephone(e.target.value)}`,
  `          style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14}}/>`,
  `        <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}`,
  `          style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14}}/>`,
  `        {coordMsg&&<div style={{padding:"8px 10px",borderRadius:8,fontSize:13,fontWeight:600,`,
  `          background:coordMsg.type==="success"?"#d1fae5":"#fee2e2",`,
  `          color:coordMsg.type==="success"?"#065f46":"#991b1b"}}>{coordMsg.text}</div>}`,
  `        <button onClick={soumettreCoordonnees} disabled={coordBusy}`,
  `          style={{padding:"11px 0",border:"none",borderRadius:10,fontWeight:700,fontSize:14,cursor:coordBusy?"wait":"pointer",`,
  `          background:"#0C447C",color:"#fff"}}>`,
  `          {coordBusy?"…":"Enregistrer mes coordonnées"}`,
  `        </button>`,
  `        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:6,paddingTop:12,borderTop:"1px solid #f1f5f9"}}>`,
  `          <div style={{fontSize:13,fontWeight:600,color:"#334155"}}>Visible dans l'Annuaire</div>`,
  `          <button onClick={toggleVisibleAnnuaire}`,
  `            style={{width:48,height:28,borderRadius:14,border:"none",cursor:"pointer",`,
  `            background:visibleAnnuaire?"#0C447C":"#e2e8f0",position:"relative",transition:"background .15s"}}>`,
  `            <div style={{width:22,height:22,borderRadius:"50%",background:"#fff",position:"absolute",top:3,`,
  `              left:visibleAnnuaire?23:3,transition:"left .15s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>`,
  `          </button>`,
  `        </div>`,
  `      </div>`,
  `    </div>`,
  `    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:18}}>`,
  `      <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>🔑 Changer mon PIN</div>`,
].join(NL);

content = mustReplaceOnce(content, old3, new3, 'profil-carte-coordonnees');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (ProfilPersoView : coordonnées + visibilité annuaire)');
