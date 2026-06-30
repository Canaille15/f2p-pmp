const fs = require('fs');
const path = './src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

function mustReplaceOnce(str, target, replacement, label) {
  const count = str.split(target).length - 1;
  if (count !== 1) {
    console.error('ATTENTION : "' + label + '" trouvé ' + count + ' fois (attendu 1). Ignoré par sécurité.');
    return { str, ok: false };
  }
  console.log('OK : ' + label);
  return { str: str.split(target).join(replacement), ok: true };
}

let ok = true;

// ── 1. État + polling au niveau App (compteur de demandes ouvertes) ──────────
const anchor1 = 'const interval = setInterval(()=>{ rechargerAgents(); }, 45000);\n    return ()=>clearInterval(interval);\n  },[currentUser?.agent?.id]); // eslint-disable-line\r\n';
{
  const r = mustReplaceOnce(content, anchor1, anchor1 + `
  const [echangesOuvertesCount,setEchangesOuvertesCount]=useState(0);
  const rechargerEchangesCount=()=>{
    if(!currentUser?.agent?.id) return;
    api.echanges.getAll().then(rows=>{
      setEchangesOuvertesCount((rows||[]).filter(r=>r.statut==="ouverte").length);
    }).catch(()=>{});
  };
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    rechargerEchangesCount();
    const echInterval=setInterval(rechargerEchangesCount,45000);
    return ()=>clearInterval(echInterval);
  },[currentUser?.agent?.id]); // eslint-disable-line
`, 'ajout état + polling compteur échanges');
  content = r.str; ok = ok && r.ok;
}

// ── 2. Cloche sur le lien "Échanges" du menu latéral ──────────────────────────
const anchor2 = `          return(<button key={k} onClick={()=>{setView(k);setMenuOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,border:"none",background:actif?"#eff6ff":"transparent",padding:"12px 16px",cursor:"pointer",fontSize:14,fontWeight:actif?700:500,color:actif?"#0f4c81":"#1e293b",textAlign:"left",width:"100%"}}>
            {l}
          </button>);`;
const replacement2 = `          const aDesEchanges=k==="echanges"&&echangesOuvertesCount>0;
          return(<button key={k} onClick={()=>{setView(k);setMenuOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,border:"none",background:actif?"#eff6ff":(aDesEchanges?"#fef3c7":"transparent"),padding:"12px 16px",cursor:"pointer",fontSize:14,fontWeight:actif?700:500,color:actif?"#0f4c81":"#1e293b",textAlign:"left",width:"100%"}}>
            {l}
            {aDesEchanges&&<span style={{marginLeft:"auto",background:"#dc2626",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:11,fontWeight:700}}>{echangesOuvertesCount}</span>}
          </button>);`;
{
  const r = mustReplaceOnce(content, anchor2, replacement2, 'cloche dans le menu latéral');
  content = r.str; ok = ok && r.ok;
}

// ── 3. Props transmises à PersonalView ────────────────────────────────────────
const anchor3 = '        agentCouleurs={agentCouleurs}\r\n        setAgentCouleurs={setAgentCouleurs}/>}\r\n';
{
  const r = mustReplaceOnce(content, anchor3, '        agentCouleurs={agentCouleurs}\r\n        setAgentCouleurs={setAgentCouleurs}\r\n        echangesCount={echangesOuvertesCount}\r\n        onOpenEchanges={()=>setView("echanges")}/>}\r\n', 'props échanges passées à PersonalView');
  content = r.str; ok = ok && r.ok;
}

// ── 4. Signature de PersonalView ──────────────────────────────────────────────
const anchor4 = 'function PersonalView({agent,schedule,setSchedule,weekOffset,setWeekOffset,onImportDP,agentProfiles,setAgentProfiles,onFetePaye,isAdmin,currentUser,agentCouleurs,setAgentCouleurs}){';
{
  const r = mustReplaceOnce(content, anchor4, 'function PersonalView({agent,schedule,setSchedule,weekOffset,setWeekOffset,onImportDP,agentProfiles,setAgentProfiles,onFetePaye,isAdmin,currentUser,agentCouleurs,setAgentCouleurs,echangesCount,onOpenEchanges}){', 'signature PersonalView mise à jour');
  content = r.str; ok = ok && r.ok;
}

// ── 5. Bouton cloche dans Mon Planning, juste après l'en-tête agent ──────────
const anchor5 = '<AgentHeader agent={agent} profile={profile} counts={counts} compteurYear={compteurYear} setCompteurYear={setCompteurYear} onImportDP={onImportDP} onDemandeConges={()=>setShowDemandeConges(true)} onCouleurs={()=>setShowColorPicker(true)} onHabilitations={()=>setShowHab(true)} onRoulementChange={r=>setProfile({roulement:r})} onReservisteChange={v=>setProfile({isReserve:v})} isOwnProfile={isOwnProfile}/>\r\n';
const insertion5 = `    {typeof onOpenEchanges==="function"&&<button onClick={onOpenEchanges} style={{display:"flex",alignItems:"center",justifyContent:"space-between",border:"1.5px solid "+(echangesCount>0?"#fdba74":"#e2e8f0"),background:echangesCount>0?"#fef3c7":"#f8fafc",borderRadius:12,padding:"10px 16px",cursor:"pointer",fontSize:14,fontWeight:700,color:"#1e293b",width:"100%"}}>
      <span>🔄 Échanges</span>
      {echangesCount>0&&<span style={{background:"#dc2626",color:"#fff",borderRadius:10,padding:"2px 9px",fontSize:12,fontWeight:700}}>{echangesCount}</span>}
    </button>}
`;
{
  const r = mustReplaceOnce(content, anchor5, anchor5 + insertion5, 'bouton cloche dans Mon Planning');
  content = r.str; ok = ok && r.ok;
}

if (!ok) {
  console.error('\nAU MOINS UN REMPLACEMENT A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApp.jsx mis à jour avec succès (cloche menu + planning perso).');
