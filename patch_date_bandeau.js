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

// ── 1. La date reste éditable même en mode modification ──────────────────────
{
  const r = mustReplaceOnce(content, '{!editingId&&<div>\n        <div style={{fontSize:13,color:"#64748b",marginBottom:4}}>Journée à échanger</div>',
    '<div>\n        <div style={{fontSize:13,color:"#64748b",marginBottom:4}}>Journée à échanger</div>', 'date toujours affichée dans le formulaire');
  content = r.str; ok = ok && r.ok;
}
{
  const r = mustReplaceOnce(content, 'style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:15,outline:"none"}}/>\n      </div>}',
    'style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:15,outline:"none"}}/>\n      </div>', 'fermeture du bloc date sans condition');
  content = r.str; ok = ok && r.ok;
}

// ── 2. La date est envoyée aussi lors d'une modification ──────────────────────
{
  const r = mustReplaceOnce(content,
    'await api.echanges.update(editingId,{creneaux_souhaites:form.creneaux,urgent:form.urgent,motif:form.motif||null});',
    'await api.echanges.update(editingId,{date_jour:form.date,creneaux_souhaites:form.creneaux,urgent:form.urgent,motif:form.motif||null});',
    'date_jour envoyée lors de la modification');
  content = r.str; ok = ok && r.ok;
}

// ── 3. Bandeau Échanges fermable dans Mon Planning ────────────────────────────
const oldBanner = `    {typeof onOpenEchanges==="function"&&<button onClick={onOpenEchanges} style={{display:"flex",alignItems:"center",justifyContent:"space-between",border:"1.5px solid "+(echangesCount>0?"#fdba74":"#e2e8f0"),background:echangesCount>0?"#fef3c7":"#f8fafc",borderRadius:12,padding:"10px 16px",cursor:"pointer",fontSize:14,fontWeight:700,color:"#1e293b",width:"100%"}}>
      <span>🔄 Échanges</span>
      {echangesCount>0&&<span style={{background:"#dc2626",color:"#fff",borderRadius:10,padding:"2px 9px",fontSize:12,fontWeight:700}}>{echangesCount}</span>}
    </button>}
`;
const newBanner = `    {typeof onOpenEchanges==="function"&&(echangesCount||0)>echangesDismissedCount&&<div style={{display:"flex",alignItems:"stretch",gap:6,border:"1.5px solid "+(echangesCount>0?"#fdba74":"#e2e8f0"),background:echangesCount>0?"#fef3c7":"#f8fafc",borderRadius:12,padding:"4px 4px 4px 16px"}}>
      <button onClick={onOpenEchanges} style={{display:"flex",alignItems:"center",justifyContent:"space-between",border:"none",background:"none",cursor:"pointer",fontSize:14,fontWeight:700,color:"#1e293b",flex:1,padding:"8px 0",textAlign:"left"}}>
        <span>🔄 Échanges</span>
        {echangesCount>0&&<span style={{background:"#dc2626",color:"#fff",borderRadius:10,padding:"2px 9px",fontSize:12,fontWeight:700,marginRight:8}}>{echangesCount}</span>}
      </button>
      <button onClick={()=>setEchangesDismissedCount(echangesCount||0)} title="Masquer ce bandeau" style={{border:"none",background:"none",cursor:"pointer",fontSize:17,color:"#94a3b8",padding:"0 10px"}}>✕</button>
    </div>}
`;
{
  const r = mustReplaceOnce(content, oldBanner, newBanner, 'bandeau Échanges devenu fermable');
  content = r.str; ok = ok && r.ok;
}

// ── 4. État persistant pour le compteur masqué (juste après la signature de PersonalView) ──
{
  const r = mustReplaceOnce(content,
    'function PersonalView({agent,schedule,setSchedule,weekOffset,setWeekOffset,onImportDP,agentProfiles,setAgentProfiles,onFetePaye,isAdmin,currentUser,agentCouleurs,setAgentCouleurs,echangesCount,onOpenEchanges}){',
    'function PersonalView({agent,schedule,setSchedule,weekOffset,setWeekOffset,onImportDP,agentProfiles,setAgentProfiles,onFetePaye,isAdmin,currentUser,agentCouleurs,setAgentCouleurs,echangesCount,onOpenEchanges}){\r\n  const [echangesDismissedCount,setEchangesDismissedCount]=usePersist("echangesDismissedCount",0);',
    'état echangesDismissedCount ajouté dans PersonalView');
  content = r.str; ok = ok && r.ok;
}

if (!ok) {
  console.error('\nAU MOINS UN REMPLACEMENT A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApp.jsx mis à jour avec succès (date modifiable + bandeau fermable).');
