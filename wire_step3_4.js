const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const REFRESH = '\u{1F504}'; // 🔄

// ───────────────────────────────────────────────────────────────────────────
// ETAPE 3 : masquer le bouton 🔄 sur les cases vacantes quand isPrevisionnel
// ───────────────────────────────────────────────────────────────────────────
const vacantBtn = '<button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:row.famille,nomOfficiel:"Poste vacant"})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>' + REFRESH + '</button>';

let searchFrom = 0;
let count = 0;
while (true) {
  const idxV = content.indexOf(vacantBtn, searchFrom);
  if (idxV === -1) break;
  const wrapped = '{!isPrevisionnel&&' + vacantBtn + '}';
  content = content.slice(0, idxV) + wrapped + content.slice(idxV + vacantBtn.length);
  searchFrom = idxV + wrapped.length;
  count++;
}
if (count === 0) {
  console.log('ERREUR: aucun bouton vacant trouve');
  process.exit(1);
}
console.log('Etape 3 OK - ' + count + ' bouton(s) vacant(s) masques sur Previsionnel');

// ───────────────────────────────────────────────────────────────────────────
// ETAPE 4 : ajouter le rendu de PrevisionnelSignalementPopup juste apres AleaPopup
// ───────────────────────────────────────────────────────────────────────────
const anchor4 = 'api.cpsAleas.getAll().then(rows=>setCpsAleas(rows||[]));}}/>}';
const idx4 = content.indexOf(anchor4);
if (idx4 === -1) { console.log('ERREUR: anchor4 introuvable'); process.exit(1); }
const idxAfter4 = idx4 + anchor4.length;

const newPopupRender = '\n    {previsionnelTarget&&<PrevisionnelSignalementPopup agents={agents} agentTitulaireId={previsionnelTarget.agentId} dateKey={dateKey} nomTitulaire={previsionnelTarget.nomTitulaire} currentAgent={currentAgent} onClose={()=>setPrevisionnelTarget(null)} onSaved={()=>{api.previsionnelSignalements.getAll().then(rows=>setPrevisionnelSignalements(rows||[]));}}/>}';

content = content.slice(0, idxAfter4) + newPopupRender + content.slice(idxAfter4);
console.log('Etape 4 OK - rendu PrevisionnelSignalementPopup ajoute');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
