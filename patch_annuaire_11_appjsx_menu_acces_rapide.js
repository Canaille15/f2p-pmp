// Patch 11 — Annuaire : (1) le bouton "+ Ajouter" d'Accès rapide n'est plus
// une grosse tuile dans la grille — il passe DANS le panneau "Gérer les
// numéros d'accès rapide" (renommé), qui reste accessible même quand la
// liste est vide ; (2) icône téléphone du menu latéral "Annuaire" en rouge ;
// (3) fix agentController.getOne — même protection de déchiffrement que
// l'annuaire (probable cause de l'erreur persistante "Chargement impossible"
// dans Mon profil).
// Usage : node patch_annuaire_11_appjsx_menu_acces_rapide.js (racine f2p-pmp)
//         node patch_annuaire_11b_agentcontroller_getone_safe.js (api/api)
// PRÉREQUIS : avoir déjà exécuté patch_annuaire_10_appjsx_resilience_contraste.js

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

// ── 1. Bloc Accès rapide : tuile "+Ajouter" retirée de la grille, déplacée',
// dans le panneau de gestion (toujours accessible, même liste vide) ──
const old1 = [
  '  return(<div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:640,margin:"0 auto"}}>',
  '',
  '    {loadError&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 14px",borderRadius:10,background:"#fee2e2",border:"1.5px solid #fca5a5"}}>',
  '      <span style={{fontSize:13,fontWeight:600,color:"#991b1b"}}>{loadError}</span>',
  '      <button onClick={recharger} style={{border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",background:"#991b1b",color:"#fff",flexShrink:0}}>Réessayer</button>',
  '    </div>}',
  '',
  '    <div>',
  '      <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",color:"#94a3b8",marginBottom:8,paddingLeft:2}}>Accès rapide</div>',
  '      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(78px,1fr))",gap:8}}>',
  '        {accesRapide.map(a=>(',
  '          <a key={a.id} href={`tel:${a.numero}`} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"10px 4px",borderRadius:12,border:"1.5px solid #e2e8f0",background:"#fff",textDecoration:"none"}}>',
  '            <div style={{width:36,height:36,borderRadius:"50%",background:"#D85A30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📞</div>',
  '            <span style={{fontSize:11,fontWeight:600,textAlign:"center",lineHeight:1.2,color:"#1e293b"}}>{a.libelle}</span>',
  '          </a>',
  '        ))}',
  '        <button onClick={()=>{setGererAcces(true);setNouvelAcces(true);}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"10px 4px",borderRadius:12,border:"1.5px dashed #cbd5e1",background:"transparent",cursor:"pointer"}}>',
  '          <div style={{width:36,height:36,borderRadius:"50%",border:"1.5px dashed #cbd5e1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#94a3b8"}}>+</div>',
  '          <span style={{fontSize:11,fontWeight:600,color:"#94a3b8"}}>Ajouter</span>',
  '        </button>',
  '      </div>',
  '      {!gererAcces&&accesRapide.length>0&&',
  '        <button onClick={()=>setGererAcces(true)} style={{border:"none",background:"none",color:"#0C447C",fontWeight:600,fontSize:12,cursor:"pointer",marginTop:8,padding:0}}>Gérer les numéros</button>}',
  '      {gererAcces&&<div style={{marginTop:10,padding:12,borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc"}}>',
  '        {nouvelAcces&&<AccesRapideForm onCancel={()=>setNouvelAcces(false)} onSaved={()=>{setNouvelAcces(false);recharger();}}/>}',
].join(NL);

const new1 = [
  '  return(<div style={{display:"flex",flexDirection:"column",gap:12,maxWidth:640,margin:"0 auto"}}>',
  '',
  '    {loadError&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 14px",borderRadius:10,background:"#fee2e2",border:"1.5px solid #fca5a5"}}>',
  '      <span style={{fontSize:13,fontWeight:600,color:"#991b1b"}}>{loadError}</span>',
  '      <button onClick={recharger} style={{border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",background:"#991b1b",color:"#fff",flexShrink:0}}>Réessayer</button>',
  '    </div>}',
  '',
  '    <div>',
  '      <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",color:"#94a3b8",marginBottom:6,paddingLeft:2}}>Accès rapide</div>',
  '      {accesRapide.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(78px,1fr))",gap:8}}>',
  '        {accesRapide.map(a=>(',
  '          <a key={a.id} href={`tel:${a.numero}`} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"10px 4px",borderRadius:12,border:"1.5px solid #e2e8f0",background:"#fff",textDecoration:"none"}}>',
  '            <div style={{width:36,height:36,borderRadius:"50%",background:"#D85A30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📞</div>',
  '            <span style={{fontSize:11,fontWeight:600,textAlign:"center",lineHeight:1.2,color:"#1e293b"}}>{a.libelle}</span>',
  '          </a>',
  '        ))}',
  '      </div>}',
  '      {!gererAcces&&',
  '        <button onClick={()=>setGererAcces(true)} style={{border:"none",background:"none",color:"#0C447C",fontWeight:600,fontSize:12,cursor:"pointer",marginTop:8,padding:0}}>Gérer les numéros d\'accès rapide</button>}',
  '      {gererAcces&&<div style={{marginTop:10,padding:12,borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc"}}>',
  '        <button onClick={()=>setNouvelAcces(true)} style={{display:"flex",alignItems:"center",gap:5,border:"none",background:"none",color:"#0C447C",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:8,padding:0}}>+ Ajouter un numéro</button>',
  '        {nouvelAcces&&<AccesRapideForm onCancel={()=>setNouvelAcces(false)} onSaved={()=>{setNouvelAcces(false);recharger();}}/>}',
  '        {accesRapide.length===0&&!nouvelAcces&&<div style={{fontSize:13,color:"#64748b",marginBottom:4}}>Aucun numéro pour l\'instant.</div>}',
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'acces-rapide-bouton-deplace');

// ── 2. Icône téléphone du menu latéral en rouge (même icône, juste recolorée) ──
const old2 = '    {k:"annuaire",l:"📞 Annuaire"},';
const new2 = '    {k:"annuaire",l:(<><span style={{color:"#D22B2B"}}>☎</span> Annuaire</>)},';
content = mustReplaceOnce(content, old2, new2, 'menu-icone-telephone-rouge');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (Accès rapide réorganisé, icône menu Annuaire en rouge)');
