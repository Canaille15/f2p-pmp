// Patch — Intègre le nouveau générateur de demande de congés PDF :
// import du composant, entrée de menu, montage dans le switch de vue.
// Usage : node patch_conges_integration.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp
// PRÉREQUIS :
//   1. npm install pdf-lib
//   2. Copier DemandeCongesView.jsx dans src/components/
//   3. Copier GA_demande_autorisation_absence.pdf dans public/
//      (le PDF original du formulaire SNCF, pas une version remplie)

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

// ── 1. Import du composant ──
const old1 = 'import DayEditPopup from "./components/DayEditPopup";';
const new1 = 'import DayEditPopup from "./components/DayEditPopup";' + NL + 'import DemandeCongesView from "./components/DemandeCongesView";';
content = mustReplaceOnce(content, old1, new1, 'import-demandecongesview');

// ── 2. Entrée de menu ──
const old2 = '    {k:"annuaire",l:(<><svg width="15" height="15" viewBox="0 0 24 24" fill="#D22B2B" style={{verticalAlign:"-2px",marginRight:2}}><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.57 1 1 0 0 1-.24 1.01l-2.21 2.21z"/></svg> Annuaire</>)},';
const new2 = old2 + NL + '    {k:"conges",l:"🗓️ Demande de congés"},';
content = mustReplaceOnce(content, old2, new2, 'menu-entree-conges');

// ── 3. Montage dans le switch de vue (juste après l'Annuaire) ──
const old3 = '  {view==="annuaire"&&<AnnuaireView currentAgent={currentAgent||currentUser?.agent} isAdmin={isAdmin} agents={agents} cpsSchedule={cpsSchedule} cpsAleas={cpsAleas}/>}';
const new3 = old3 + NL + '  {view==="conges"&&<DemandeCongesView currentAgent={currentAgent||currentUser?.agent}/>}';
content = mustReplaceOnce(content, old3, new3, 'switch-vue-conges');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (module Demande de congés intégré au menu)');
