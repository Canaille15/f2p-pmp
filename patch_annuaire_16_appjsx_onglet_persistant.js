// Patch 16 — Annuaire : l'onglet actif (Agents/UO) est maintenant mémorisé
// (localStorage) — un rechargement de page ne fait plus revenir sur "Agents"
// par défaut si on était sur "UO".
// Usage : node patch_annuaire_16_appjsx_onglet_persistant.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp
// PRÉREQUIS : avoir déjà exécuté patch_annuaire_15_appjsx_agents_visibles.js

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'App.jsx');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error(`[${label}] Ancre introuvable dans ${FILE}`);
  if (count > 1) throw new Error(`[${label}] Ancre trouvée ${count} fois (doit être unique) dans ${FILE}`);
  return content.replace(oldStr, newStr);
}

let content = fs.readFileSync(FILE).toString('utf-8');

const old1 = '  const [activeTab,setActiveTab]=useState("agents");';
const new1 = '  const [activeTab,setActiveTab]=useState(()=>localStorage.getItem("f2ppmp_annuaire_tab")||"agents");';
content = mustReplaceOnce(content, old1, new1, 'activetab-lecture-localstorage');

const old2 = '      <button onClick={()=>setActiveTab("agents")} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 0",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",';
const new2 = '      <button onClick={()=>{setActiveTab("agents");localStorage.setItem("f2ppmp_annuaire_tab","agents");}} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 0",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",';
content = mustReplaceOnce(content, old2, new2, 'activetab-ecriture-agents');

const old3 = '      <button onClick={()=>setActiveTab("uo")} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 0",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",';
const new3 = '      <button onClick={()=>{setActiveTab("uo");localStorage.setItem("f2ppmp_annuaire_tab","uo");}} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 0",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",';
content = mustReplaceOnce(content, old3, new3, 'activetab-ecriture-uo');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (onglet Agents/UO mémorisé après rechargement)');
