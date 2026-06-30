const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const anchor = '<button key={k} onClick={()=>setFilterF(k)} style={{border:"none",borderRadius:8,padding:"6px 13px",cursor:"pointer",background:filterF===k?"#fff":"transparent",color:filterF===k?"#1e293b":"#94a3b8",fontSize:12,fontWeight:filterF===k?700:400}}>{l}</button>';
const idx = content.indexOf(anchor);
if (idx === -1) {
  console.log('ERREUR: anchor introuvable');
  process.exit(1);
}

const newButton = '<button key={k} onClick={()=>setFilterF(k)} style={{border:"none",borderRadius:8,padding:"6px 13px",cursor:"pointer",background:filterF===k?"#0C447C":"transparent",color:filterF===k?"#fff":"#475569",fontSize:12,fontWeight:filterF===k?700:600}}>{l}</button>';

content = content.slice(0, idx) + newButton + content.slice(idx + anchor.length);
fs.writeFileSync(path, content, 'utf8');
console.log('OK - selecteur Tous/PRCI/PAR plus contraste');
