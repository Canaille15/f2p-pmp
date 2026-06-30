// patch_bulletin_10_fix_position.js
// Retire le bouton de sa position actuelle (coincé entre le toggle et "Aujourd'hui")
// et le replace tout à la fin de la ligne, après le bloc Aujourd'hui/sélecteur de date.
// Exécution : node patch_bulletin_10_fix_position.js (depuis la racine du projet)

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

// ── 1. Retirer le bouton de sa position actuelle (après le toggle, avant "Nav selon la vue") ──
const currentBlock = "      </div>\n      {isOwnProfile && <BulletinImportButton agentCp={agent.immatriculation||agent.cp||agent.id} onImported={()=>{\n        const agCp=agent.immatriculation||agent.cp||agent.id;\n        api.planning.getSchedule(agCp).then(entries=>{ if (entries) setSchedule(prev=>({...prev, ...entries})); });\n      }}/>}\n      {/* Nav selon la vue */}";

const withoutButton = "      </div>\n      {/* Nav selon la vue */}";
content = mustReplaceOnce(content, currentBlock, withoutButton, 'App.jsx retrait bouton position actuelle');

// ── 2. Le replacer tout à la fin de la ligne, après la fermeture du conteneur flex ──
const endAnchor = "      </>}\r\n    </div>\r\n\r\n    <input ref={personalDateJumpRef}";

const endReplacement = "      </>}\r\n      {isOwnProfile && <BulletinImportButton agentCp={agent.immatriculation||agent.cp||agent.id} onImported={()=>{\n        const agCp=agent.immatriculation||agent.cp||agent.id;\n        api.planning.getSchedule(agCp).then(entries=>{ if (entries) setSchedule(prev=>({...prev, ...entries})); });\n      }}/>}\n    </div>\r\n\r\n    <input ref={personalDateJumpRef}";

content = mustReplaceOnce(content, endAnchor, endReplacement, 'App.jsx insertion bouton fin de ligne');

fs.writeFileSync(filePath, content, 'utf8');
console.log("✅ App.jsx mis à jour : le bouton est maintenant en toute fin de ligne, vraiment à droite (après Aujourd'hui).");
