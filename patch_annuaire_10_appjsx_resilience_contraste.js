// Patch 10 — Annuaire : (1) un échec de chargement (ex: serveur en cours de
// redémarrage) n'efface plus silencieusement l'affichage — l'ancien contenu
// reste visible avec un message d'erreur + bouton "Réessayer", au lieu de
// vider les listes ; même logique pour le chargement des coordonnées dans
// Mon profil ; (2) contraste des textes "Non communiqué" / "Titulaire non
// communiqué" / "Aucun contact renseigné" augmenté (gris trop clair).
// Usage : node patch_annuaire_10_appjsx_resilience_contraste.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp
// PRÉREQUIS : avoir déjà exécuté patch_annuaire_9_appjsx_contraste.js

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

// ══════════════ 1. AnnuaireView : recharger() ne vide plus en cas d'échec ══════════════

const old1 = [
  '  const recharger=()=>{',
  '    setLoading(true);',
  '    Promise.all([',
  '      api.annuaire.getAccesRapide().catch(()=>[]),',
  '      api.annuaire.getUo().catch(()=>[]),',
  '      api.annuaire.getAgents().catch(()=>[]),',
  '    ]).then(([acces,uoRows,agts])=>{',
  '      setAccesRapide(acces||[]);',
  '      setUo(uoRows||[]);',
  '      setAgentsAnnuaire(agts||[]);',
  '      setLoading(false);',
  '    });',
  '  };',
  '  useEffect(()=>{ recharger(); },[]);',
].join(NL);

const new1 = [
  '  const [loadError,setLoadError]=useState(null);',
  '  const recharger=()=>{',
  '    setLoadError(null);',
  '    Promise.all([',
  '      api.annuaire.getAccesRapide(),',
  '      api.annuaire.getUo(),',
  '      api.annuaire.getAgents(),',
  '    ]).then(([acces,uoRows,agts])=>{',
  '      setAccesRapide(acces||[]);',
  '      setUo(uoRows||[]);',
  '      setAgentsAnnuaire(agts||[]);',
  '      setLoading(false);',
  '    }).catch(()=>{',
  '      // Volontairement : on ne touche PAS aux listes déjà chargées ici,',
  '      // pour ne jamais donner l\'impression que les données ont été effacées',
  '      // suite à un simple raté réseau ou un redémarrage serveur passager.',
  '      setLoadError("Impossible de charger l\'annuaire. Vérifie ta connexion et réessaie.");',
  '      setLoading(false);',
  '    });',
  '  };',
  '  useEffect(()=>{ recharger(); },[]);',
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'annuaireview-recharger-resilient');

// ── Bandeau d'erreur affiché juste avant le bandeau "Accès rapide" ──
const old2 = [
  '  return(<div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:640,margin:"0 auto"}}>',
  '',
  '    <div>',
  '      <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",color:"#94a3b8",marginBottom:8,paddingLeft:2}}>Accès rapide</div>',
].join(NL);

const new2 = [
  '  return(<div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:640,margin:"0 auto"}}>',
  '',
  '    {loadError&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 14px",borderRadius:10,background:"#fee2e2",border:"1.5px solid #fca5a5"}}>',
  '      <span style={{fontSize:13,fontWeight:600,color:"#991b1b"}}>{loadError}</span>',
  '      <button onClick={recharger} style={{border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",background:"#991b1b",color:"#fff",flexShrink:0}}>Réessayer</button>',
  '    </div>}',
  '',
  '    <div>',
  '      <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",color:"#94a3b8",marginBottom:8,paddingLeft:2}}>Accès rapide</div>',
].join(NL);

content = mustReplaceOnce(content, old2, new2, 'annuaireview-bandeau-erreur');

// ══════════════ 2. ProfilPersoView : chargement des coordonnées résilient ══════════════

const old3 = [
  '  useEffect(()=>{',
  '    if(!currentAgent?.id)return;',
  '    api.agents.getById(currentAgent.id).then(full=>{',
  '      setEmail(full?.email||"");',
  '      setTelephone(full?.telephone||"");',
  '      setFonction(full?.fonction||"");',
  '      setVisibleAnnuaire(full?.annuaire_visible===undefined||full?.annuaire_visible===null?true:!!full.annuaire_visible);',
  '    }).catch(()=>{});',
  '  },[currentAgent?.id]);',
].join(NL);

const new3 = [
  '  const [coordLoadError,setCoordLoadError]=useState(false);',
  '  const chargerCoordonnees=()=>{',
  '    if(!currentAgent?.id)return;',
  '    setCoordLoadError(false);',
  '    api.agents.getById(currentAgent.id).then(full=>{',
  '      setEmail(full?.email||"");',
  '      setTelephone(full?.telephone||"");',
  '      setFonction(full?.fonction||"");',
  '      setVisibleAnnuaire(full?.annuaire_visible===undefined||full?.annuaire_visible===null?true:!!full.annuaire_visible);',
  '    }).catch(()=>{setCoordLoadError(true);});',
  '  };',
  '  useEffect(()=>{ chargerCoordonnees(); },[currentAgent?.id]);',
].join(NL);

content = mustReplaceOnce(content, old3, new3, 'profil-chargement-resilient');

// ── Bandeau d'erreur dans la carte "Mes coordonnées" ──
const old4 = [
  '      <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>📇 Mes coordonnées (Annuaire)</div>',
  '      <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Visibles par tes collègues dans l\'Annuaire, sauf si tu désactives ta visibilité ci-dessous.</div>',
].join(NL);

const new4 = [
  '      <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>📇 Mes coordonnées (Annuaire)</div>',
  '      <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Visibles par tes collègues dans l\'Annuaire, sauf si tu désactives ta visibilité ci-dessous.</div>',
  '      {coordLoadError&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"9px 12px",borderRadius:9,background:"#fee2e2",border:"1.5px solid #fca5a5",marginBottom:10}}>',
  '        <span style={{fontSize:12,fontWeight:600,color:"#991b1b"}}>Chargement impossible, réessaie.</span>',
  '        <button onClick={chargerCoordonnees} style={{border:"none",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",background:"#991b1b",color:"#fff",flexShrink:0}}>Réessayer</button>',
  '      </div>}',
].join(NL);

content = mustReplaceOnce(content, old4, new4, 'profil-bandeau-erreur');

// ══════════════ 3. Contraste des textes "non communiqué" ══════════════

const old5 = '            {!a.telephone&&!a.email&&<span style={{fontSize:12,color:"#cbd5e1"}}>Non communiqué</span>}';
const new5 = '            {!a.telephone&&!a.email&&<span style={{fontSize:12,color:"#64748b",fontWeight:500}}>Non communiqué</span>}';
content = mustReplaceOnce(content, old5, new5, 'contraste-non-communique-agents');

const old6 = '                  <div style={{fontSize:12,color:"#64748b"}}>{(u.titulaire_prenom||u.titulaire_nom)?`${u.titulaire_prenom||""} ${u.titulaire_nom||""}`.trim():<span style={{color:"#cbd5e1"}}>Titulaire non communiqué</span>}</div>';
const new6 = '                  <div style={{fontSize:12,color:"#64748b"}}>{(u.titulaire_prenom||u.titulaire_nom)?`${u.titulaire_prenom||""} ${u.titulaire_nom||""}`.trim():<span style={{color:"#64748b",fontWeight:500}}>Titulaire non communiqué</span>}</div>';
content = mustReplaceOnce(content, old6, new6, 'contraste-titulaire-non-communique');

const old7 = '                {!u.mobile_pro&&!u.mobile_perso&&!u.fixe&&!u.email&&<span style={{fontSize:12,color:"#cbd5e1"}}>Aucun contact renseigné</span>}';
const new7 = '                {!u.mobile_pro&&!u.mobile_perso&&!u.fixe&&!u.email&&<span style={{fontSize:12,color:"#64748b",fontWeight:500}}>Aucun contact renseigné</span>}';
content = mustReplaceOnce(content, old7, new7, 'contraste-aucun-contact');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (chargement résilient + contraste "non communiqué" amélioré)');
