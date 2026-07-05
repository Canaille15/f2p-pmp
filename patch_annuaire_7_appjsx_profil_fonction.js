// Patch 7 — Annuaire : ajoute le champ "Fonction" auto-éditable dans
// ProfilPersoView (src/App.jsx), à côté d'email/téléphone.
// Usage : node patch_annuaire_7_appjsx_profil_fonction.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp
// PRÉREQUIS : avoir déjà exécuté patch_annuaire_4_appjsx_profil.js

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

// ── 1. Hooks : ajout de fonction + chargement dans le useEffect ──
const old1 = [
  '  const [email,setEmail]=useState("");',
  '  const [telephone,setTelephone]=useState("");',
  '  const [visibleAnnuaire,setVisibleAnnuaire]=useState(true);',
  '  const [coordBusy,setCoordBusy]=useState(false);',
  '  const [coordMsg,setCoordMsg]=useState(null);',
  '  useEffect(()=>{',
  '    if(!currentAgent?.id)return;',
  '    api.agents.getById(currentAgent.id).then(full=>{',
  '      setEmail(full?.email||"");',
  '      setTelephone(full?.telephone||"");',
  '      setVisibleAnnuaire(full?.annuaire_visible===undefined||full?.annuaire_visible===null?true:!!full.annuaire_visible);',
  '    }).catch(()=>{});',
  '  },[currentAgent?.id]);',
].join(NL);

const new1 = [
  '  const [email,setEmail]=useState("");',
  '  const [telephone,setTelephone]=useState("");',
  '  const [fonction,setFonction]=useState("");',
  '  const [visibleAnnuaire,setVisibleAnnuaire]=useState(true);',
  '  const [coordBusy,setCoordBusy]=useState(false);',
  '  const [coordMsg,setCoordMsg]=useState(null);',
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

content = mustReplaceOnce(content, old1, new1, 'profil-fonction-hook');

// ── 2. Payload de sauvegarde : inclure fonction ──
const old2 = "      await api.annuaire.updateMesCoordonnees(currentAgent.id,{email,telephone});";
const new2 = "      await api.annuaire.updateMesCoordonnees(currentAgent.id,{email,telephone,fonction});";
content = mustReplaceOnce(content, old2, new2, 'profil-fonction-payload');

// ── 3. UI : champ input Fonction, avant le champ Téléphone ──
const old3 = [
  '      <div style={{display:"flex",flexDirection:"column",gap:10}}>',
  '        <input type="tel" placeholder="Téléphone" value={telephone} onChange={e=>setTelephone(e.target.value)}',
  '          style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14}}/>',
].join(NL);

const new3 = [
  '      <div style={{display:"flex",flexDirection:"column",gap:10}}>',
  '        <input type="text" placeholder="Fonction (ex: Agent circulation)" value={fonction} onChange={e=>setFonction(e.target.value)}',
  '          style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14}}/>',
  '        <input type="tel" placeholder="Téléphone" value={telephone} onChange={e=>setTelephone(e.target.value)}',
  '          style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14}}/>',
].join(NL);

content = mustReplaceOnce(content, old3, new3, 'profil-fonction-input');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (champ Fonction ajouté dans Mon profil)');
