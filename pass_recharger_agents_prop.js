const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const anchor = '{view==="admin"&&<AdminPanel currentUser={currentUser}/>}';
const idx = content.indexOf(anchor);
if (idx === -1) {
  console.log('ERREUR: anchor introuvable');
  process.exit(1);
}

const newLine = '{view==="admin"&&<AdminPanel currentUser={currentUser} onAgentsChanged={rechargerAgents}/>}';
content = content.slice(0, idx) + newLine + content.slice(idx + anchor.length);
fs.writeFileSync(path, content, 'utf8');
console.log('OK - rechargerAgents passe en prop a AdminPanel');
