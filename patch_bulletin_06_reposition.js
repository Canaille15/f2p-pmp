// patch_bulletin_06_reposition.js
// Retire le bouton "Importer un bulletin" de sa position actuelle (juste sous l'en-tête)
// et le replace dans la même ligne que le toggle Mois/Semaine/Planning.
// Exécution : node patch_bulletin_06_reposition.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

function mustReplaceOnce(content, search, replace, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[${label}] Ancre trouvée ${count} fois (attendu 1). Abandon sans modification.`);
  }
  return content.replace(search, replace);
}

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('/* BULLETIN_IMPORT_REPOSITIONNE */')) {
  console.log('⚠️  Le bouton a déjà été repositionné — aucune modification appliquée.');
  process.exit(0);
}

// ── 1. Retirer le bloc de son emplacement actuel (sous AgentHeader) ──────────
const currentBlock = `<AgentHeader agent={agent} profile={profile} counts={counts} compteurYear={compteurYear} setCompteurYear={setCompteurYear} onImportDP={onImportDP} onDemandeConges={()=>setShowDemandeConges(true)} onCouleurs={()=>setShowColorPicker(true)} onHabilitations={()=>setShowHab(true)} onRoulementChange={r=>setProfile({roulement:r})} onReservisteChange={v=>setProfile({isReserve:v})} isOwnProfile={isOwnProfile}/>
    {isOwnProfile && <BulletinImportButton agentCp={agent.immatriculation||agent.cp||agent.id} onImported={()=>{
      const agCp=agent.immatriculation||agent.cp||agent.id;
      api.planning.getSchedule(agCp).then(entries=>{ if (entries) setSchedule(prev=>({...prev, ...entries})); });
    }}/>}`;

if (!content.includes(currentBlock)) {
  throw new Error("Bloc actuel introuvable — as-tu bien lancé patch_bulletin_04_appjsx.js avant celui-ci, sans modification manuelle entre temps ?");
}

const agentHeaderOnly = `<AgentHeader agent={agent} profile={profile} counts={counts} compteurYear={compteurYear} setCompteurYear={setCompteurYear} onImportDP={onImportDP} onDemandeConges={()=>setShowDemandeConges(true)} onCouleurs={()=>setShowColorPicker(true)} onHabilitations={()=>setShowHab(true)} onRoulementChange={r=>setProfile({roulement:r})} onReservisteChange={v=>setProfile({isReserve:v})} isOwnProfile={isOwnProfile}/>`;

content = mustReplaceOnce(content, currentBlock, agentHeaderOnly, 'App.jsx retrait bouton bulletin de son ancienne position');

// ── 2. Le replacer dans la ligne du toggle Mois/Semaine/Planning ────────────
const toggleAnchor = "    <div style={{display:\"flex\",alignItems:\"center\",gap:8}}>\r\n      <div style={{display:\"flex\",background:\"#f1f5f9\",borderRadius:10,padding:3,gap:2}}>";

const toggleReplacement = `    {/* BULLETIN_IMPORT_REPOSITIONNE */}
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <div style={{display:"flex",background:"#f1f5f9",borderRadius:10,padding:3,gap:2}}>`;

content = mustReplaceOnce(content, toggleAnchor, toggleReplacement, 'App.jsx toggle anchor');

// Insertion du bouton juste après le bloc toggle mois/semaine/planning (avant la nav Aujourd'hui)
const afterToggleClose = "      </div>\r\n      {/* Nav selon la vue */}";

const afterToggleReplacement = `      </div>
      {isOwnProfile && <BulletinImportButton agentCp={agent.immatriculation||agent.cp||agent.id} onImported={()=>{
        const agCp=agent.immatriculation||agent.cp||agent.id;
        api.planning.getSchedule(agCp).then(entries=>{ if (entries) setSchedule(prev=>({...prev, ...entries})); });
      }}/>}
      {/* Nav selon la vue */}`;

content = mustReplaceOnce(content, afterToggleClose, afterToggleReplacement, 'App.jsx insertion bouton apres toggle');

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : bouton "Importer un bulletin" repositionné à côté du toggle Mois/Semaine/Planning.');

// ── 3. Mise à jour du libellé du bouton ──────────────────────────────────────
const oldLabel = '{ busy ? "⏳ Analyse…" : "📥 Importer un bulletin" }';
const newLabel = '{ busy ? "⏳ Analyse…" : "📥 Importer un bulletin de commande / roulement" }';
if (content.includes(oldLabel)) {
  content = mustReplaceOnce(content, oldLabel, newLabel, 'App.jsx libellé bouton bulletin');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Libellé du bouton mis à jour : "Importer un bulletin de commande / roulement".');
} else {
  console.log('⚠️  Libellé du bouton non trouvé tel quel — peut-être déjà modifié manuellement.');
}
