const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

// ───────────────────────────────────────────────────────────────────────────
// ETAPE 1 : ajouter l'etat previsionnelTarget juste apres aleaTarget
// ───────────────────────────────────────────────────────────────────────────
const anchor1 = 'const [aleaTarget,setAleaTarget]=useState(null);';
const idx1 = content.indexOf(anchor1);
if (idx1 === -1) { console.log('ERREUR: anchor1 introuvable'); process.exit(1); }
content = content.slice(0, idx1 + anchor1.length) +
  '\n  const [previsionnelTarget,setPrevisionnelTarget]=useState(null);' +
  content.slice(idx1 + anchor1.length);
console.log('Etape 1 OK - etat previsionnelTarget ajoute');

// ───────────────────────────────────────────────────────────────────────────
// ETAPE 2 : inserer la branche previsionnel AVANT le rendu normal de l'agent assigne
// ───────────────────────────────────────────────────────────────────────────
const oldAgentBlockLines = [
  '                    if(ag)return(<div key={si} style={{display:"flex",alignItems:"center",gap:6,background:isForm?"#f0fdf4":isMe?"#fafdf0":"rgba(255,255,255,.8)",border:`1.5px solid ${isForm?"#22c55e":isMe?(fam?.accent||"#6366f1"):"rgba(0,0,0,.07)"}`,borderRadius:9,padding:"4px 9px"}}>',
  '                      <Av initials={ag.initials} size={22} famille={ag.famille}/>',
  '                      <div>',
  '                        <div style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{ag.prenom} {ag.nom}{isMe&&<span style={{fontSize:8,color:fam?.accent||"#6366f1",marginLeft:3}}>●</span>}</div>',
  '                        <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>{ag.grade}</div>',
  '                      </div>',
  '                      <button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:row.famille,nomOfficiel:`${ag.prenom} ${ag.nom}`})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>🔄</button>',
  '                    </div>);',
].join('\n');

const idx2 = content.indexOf(oldAgentBlockLines);
if (idx2 === -1) { console.log('ERREUR: bloc agent assigne introuvable'); process.exit(1); }

const newAgentBlockLines = [
  '                    if(ag&&isPrevisionnel){',
  '                      const sig=findPrevisionnelSignalement(previsionnelSignalements,ag.id,dateKey);',
  '                      if(sig){',
  '                        const nomsRemplacants=(sig.agents_remplacants||[]).map(r=>`${r.prenom} ${r.nom}`).join(", ");',
  '                        return(<div key={si} style={{display:"flex",flexDirection:"column",gap:3,background:"#f5f3ff",border:"1.5px solid #c4b5fd",borderRadius:9,padding:"5px 9px"}}>',
  '                          <div style={{display:"flex",alignItems:"center",gap:6}}>',
  '                            <Av initials={ag.initials} size={18} famille={ag.famille}/>',
  '                            <div style={{fontSize:11,fontWeight:600,color:"#94a3b8",textDecoration:"line-through"}}>{ag.prenom} {ag.nom}</div>',
  '                          </div>',
  '                          <div style={{fontSize:11,fontWeight:700,color:"#6d28d9",paddingLeft:24}}>{nomsRemplacants||"?"}</div>',
  '                          <div style={{display:"flex",alignItems:"center",gap:6,paddingLeft:24}}><div style={{fontSize:9,color:"#7c3aed"}}>📅 Signalement</div><button onClick={()=>annulerPrevisionnelSignalement(sig.id,setPrevisionnelSignalements)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#7c3aed",opacity:.6,marginLeft:"auto"}}>✕</button></div>',
  '                        </div>);',
  '                      }',
  '                      return(<div key={si} style={{display:"flex",alignItems:"center",gap:6,background:isMe?"#fafdf0":"rgba(255,255,255,.8)",border:`1.5px solid ${isMe?(fam?.accent||"#6366f1"):"rgba(0,0,0,.07)"}`,borderRadius:9,padding:"4px 9px"}}>',
  '                        <Av initials={ag.initials} size={22} famille={ag.famille}/>',
  '                        <div>',
  '                          <div style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{ag.prenom} {ag.nom}{isMe&&<span style={{fontSize:8,color:fam?.accent||"#6366f1",marginLeft:3}}>●</span>}</div>',
  '                          <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>{ag.grade}</div>',
  '                        </div>',
  '                        <button onClick={()=>setPrevisionnelTarget({agentId:ag.id,nomTitulaire:`${ag.prenom} ${ag.nom}`})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>🔄</button>',
  '                      </div>);',
  '                    }',
  oldAgentBlockLines,
].join('\n');

content = content.slice(0, idx2) + newAgentBlockLines + content.slice(idx2 + oldAgentBlockLines.length);
console.log('Etape 2 OK - branche previsionnel inseree avant le rendu normal');

// ───────────────────────────────────────────────────────────────────────────
// ETAPE 3 : masquer le bouton 🔄 sur les 2 cases vacantes quand isPrevisionnel
// ───────────────────────────────────────────────────────────────────────────
const oldVacantBtn1 = '<button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:row.famille,nomOfficiel:"Poste vacant"})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>🔄</button>';
let searchFrom = 0;
let count = 0;
while (true) {
  const idxV = content.indexOf(oldVacantBtn1, searchFrom);
  if (idxV === -1) break;
  const newVacantBtn = '{!isPrevisionnel&&' + oldVacantBtn1 + '}';
  content = content.slice(0, idxV) + newVacantBtn + content.slice(idxV + oldVacantBtn1.length);
  searchFrom = idxV + newVacantBtn.length;
  count++;
}
console.log('Etape 3 OK - ' + count + ' bouton(s) vacant(s) masques sur Previsionnel');

// ───────────────────────────────────────────────────────────────────────────
// ETAPE 4 : ajouter le rendu de PrevisionnelSignalementPopup juste apres AleaPopup
// ───────────────────────────────────────────────────────────────────────────
const anchor4 = '{aleaTarget&&<AleaPopup agents={agents} jsCode={aleaTarget.jsCode} dateKey={dateKey} famille={aleaTarget.famille} nomOfficiel={aleaTarget.nomOfficiel} currentAgent={currentAgent} onClose={()=>setAleaTarget(null)} onSaved={()=>{api.cpsAleas.getAll().then(rows=>setCpsAleas(rows||[]));}}/>}';
const idx4 = content.indexOf(anchor4);
if (idx4 === -1) { console.log('ERREUR: anchor4 introuvable'); process.exit(1); }

const newPopupRender = '\n    {previsionnelTarget&&<PrevisionnelSignalementPopup agents={agents} agentTitulaireId={previsionnelTarget.agentId} dateKey={dateKey} nomTitulaire={previsionnelTarget.nomTitulaire} currentAgent={currentAgent} onClose={()=>setPrevisionnelTarget(null)} onSaved={()=>{api.previsionnelSignalements.getAll().then(rows=>setPrevisionnelSignalements(rows||[]));}}/>}';

content = content.slice(0, idx4 + anchor4.length) + newPopupRender + content.slice(idx4 + anchor4.length);
console.log('Etape 4 OK - rendu PrevisionnelSignalementPopup ajoute');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
