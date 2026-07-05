// Patch 8 — Annuaire : améliore l'onglet Agents (affiche la fonction et
// l'email, tri alphabétique garanti côté client) et l'onglet UO (accordéon
// replié par défaut pour réduire la charge visuelle : fonction + titulaire
// visibles, contacts détaillés seulement au clic).
// Usage : node patch_annuaire_8_appjsx_agents_uo.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp
// PRÉREQUIS : avoir déjà exécuté patch_annuaire_5_appjsx_view.js (v2, UO)

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

// ── 1. État : ajout de expandedUo (accordéon UO) ──
const old1 = [
  '  const [editUoId,setEditUoId]=useState(null);',
  '  const [nouvelUo,setNouvelUo]=useState(false);',
].join(NL);

const new1 = [
  '  const [editUoId,setEditUoId]=useState(null);',
  '  const [nouvelUo,setNouvelUo]=useState(false);',
  '  const [expandedUo,setExpandedUo]=useState([]);',
  '  const toggleExpandUo=(id)=>{',
  '    setExpandedUo(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);',
  '  };',
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'annuaireview-expandeduo-state');

// ── 2. Tri alphabétique garanti côté client (agents et UO) ──
const old2 = [
  '  const filtreAgents=agentsAnnuaire.filter(a=>!q||`${a.nom} ${a.prenom}`.toLowerCase().includes(q));',
  '  const filtreUo=uo.filter(u=>!q||`${u.fonction} ${u.titulaire_nom||""} ${u.titulaire_prenom||""}`.toLowerCase().includes(q));',
].join(NL);

const new2 = [
  '  const filtreAgents=agentsAnnuaire',
  '    .filter(a=>!q||`${a.nom} ${a.prenom}`.toLowerCase().includes(q))',
  '    .sort((a,b)=>`${a.nom}${a.prenom}`.localeCompare(`${b.nom}${b.prenom}`));',
  '  const filtreUo=uo',
  '    .filter(u=>!q||`${u.fonction} ${u.titulaire_nom||""} ${u.titulaire_prenom||""}`.toLowerCase().includes(q))',
  '    .sort((a,b)=>a.fonction.localeCompare(b.fonction));',
].join(NL);

content = mustReplaceOnce(content, old2, new2, 'annuaireview-tri-defensif');

// ── 3. Ligne Agent : fonction + email en plus du téléphone ──
const old3 = [
  '        {filtreAgents.map(a=>(',
  '          <div key={a.cp} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>',
  '            <div style={{flex:1,minWidth:0}}>',
  '              <div style={{fontWeight:600,fontSize:13,color:"#1e293b"}}>{a.prenom} {a.nom}</div>',
  '              <div style={{fontSize:11,color:"#94a3b8"}}>{a.grade||""}</div>',
  '            </div>',
  '            {a.telephone',
  '              ? <>',
  '                  <a href={`tel:${a.telephone}`} style={{textDecoration:"none",fontSize:18}} title="Appeler">📞</a>',
  '                  <a href={`sms:${a.telephone}`} style={{textDecoration:"none",fontSize:18}} title="SMS">💬</a>',
  '                </>',
  '              : <span style={{fontSize:12,color:"#cbd5e1"}}>Non communiqué</span>}',
  '          </div>',
  '        ))}',
].join(NL);

const new3 = [
  '        {filtreAgents.map(a=>(',
  '          <div key={a.cp} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>',
  '            <div style={{flex:1,minWidth:0}}>',
  '              <div style={{fontWeight:600,fontSize:13,color:"#1e293b"}}>{a.prenom} {a.nom}</div>',
  '              <div style={{fontSize:11,color:"#94a3b8"}}>{a.fonction||a.grade||""}</div>',
  '            </div>',
  '            {a.telephone&&<a href={`tel:${a.telephone}`} style={{textDecoration:"none",fontSize:17}} title="Appeler">📞</a>}',
  '            {a.telephone&&<a href={`sms:${a.telephone}`} style={{textDecoration:"none",fontSize:17}} title="SMS">💬</a>}',
  '            {a.email&&<a href={`mailto:${a.email}`} style={{textDecoration:"none",fontSize:17}} title="Envoyer un email">✉️</a>}',
  '            {!a.telephone&&!a.email&&<span style={{fontSize:12,color:"#cbd5e1"}}>Non communiqué</span>}',
  '          </div>',
  '        ))}',
].join(NL);

content = mustReplaceOnce(content, old3, new3, 'annuaireview-ligne-agent');

// ── 4. Ligne UO : accordéon replié par défaut (fonction + titulaire seuls),',
// contacts affichés uniquement au clic (chevron) ──
const old4 = [
  '        {filtreUo.map(u=>editUoId===u.id',
  '          ? <UoForm key={u.id} initial={u} onCancel={()=>setEditUoId(null)} onSaved={()=>{setEditUoId(null);recharger();}} onDelete={()=>{api.annuaire.deleteUo(u.id).then(recharger);}}/>',
  '          : <div key={u.id} style={{padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>',
  '              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>',
  '                <div>',
  '                  <div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{u.fonction}</div>',
  '                  <div style={{fontSize:12,color:"#64748b"}}>{(u.titulaire_prenom||u.titulaire_nom)?`${u.titulaire_prenom||""} ${u.titulaire_nom||""}`.trim():<span style={{color:"#cbd5e1"}}>Titulaire non communiqué</span>}</div>',
  '                </div>',
  '                <button onClick={()=>setEditUoId(u.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14,color:"#94a3b8"}}>✎</button>',
  '              </div>',
  '              <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:6}}>',
  '                <ContactLigne label="Mobile pro" valeur={u.mobile_pro}/>',
  '                <ContactLigne label="Mobile perso" valeur={u.mobile_perso}/>',
  '                <ContactLigne label="Fixe" valeur={u.fixe}/>',
  '                {u.email&&<a href={`mailto:${u.email}`} style={{fontSize:12,color:"#0C447C",textDecoration:"none"}}>✉️ {u.email}</a>}',
  '              </div>',
  '            </div>',
  '        )}',
].join(NL);

const new4 = [
  '        {filtreUo.map(u=>editUoId===u.id',
  '          ? <UoForm key={u.id} initial={u} onCancel={()=>setEditUoId(null)} onSaved={()=>{setEditUoId(null);recharger();}} onDelete={()=>{api.annuaire.deleteUo(u.id).then(recharger);}}/>',
  '          : <div key={u.id} style={{padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>',
  '              <div onClick={()=>toggleExpandUo(u.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",cursor:"pointer"}}>',
  '                <div>',
  '                  <div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{u.fonction}</div>',
  '                  <div style={{fontSize:12,color:"#64748b"}}>{(u.titulaire_prenom||u.titulaire_nom)?`${u.titulaire_prenom||""} ${u.titulaire_nom||""}`.trim():<span style={{color:"#cbd5e1"}}>Titulaire non communiqué</span>}</div>',
  '                </div>',
  '                <div style={{display:"flex",alignItems:"center",gap:10}}>',
  '                  <span style={{fontSize:12,color:"#94a3b8",transform:expandedUo.includes(u.id)?"rotate(180deg)":"none",transition:"transform .15s"}}>▾</span>',
  '                  <button onClick={(e)=>{e.stopPropagation();setEditUoId(u.id);}} style={{border:"none",background:"none",cursor:"pointer",fontSize:14,color:"#94a3b8"}}>✎</button>',
  '                </div>',
  '              </div>',
  '              {expandedUo.includes(u.id)&&<div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:8}}>',
  '                <ContactLigne label="Mobile pro" valeur={u.mobile_pro}/>',
  '                <ContactLigne label="Mobile perso" valeur={u.mobile_perso}/>',
  '                <ContactLigne label="Fixe" valeur={u.fixe}/>',
  '                {u.email&&<a href={`mailto:${u.email}`} style={{fontSize:12,color:"#0C447C",textDecoration:"none"}}>✉️ {u.email}</a>}',
  '                {!u.mobile_pro&&!u.mobile_perso&&!u.fixe&&!u.email&&<span style={{fontSize:12,color:"#cbd5e1"}}>Aucun contact renseigné</span>}',
  '              </div>}',
  '            </div>',
  '        )}',
].join(NL);

content = mustReplaceOnce(content, old4, new4, 'annuaireview-ligne-uo-accordeon');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (Agents: fonction+email+tri / UO: accordéon replié)');
