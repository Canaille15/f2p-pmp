const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// Remplacer en?.finNuit par schedule[`${agent.id}-${l.dk}`]?.finNuit
const old = `{en?.finNuit&&<div style={{fontSize:11,color:"#0369a1",background:"#f0f9ff",borderRadius:6,padding:"2px 8px",marginBottom:4,display:"inline-flex",alignItems:"center",gap:4,fontWeight:700}}>\u{1F319} Descente de nuit</div>}`;

const newCode = `{schedule[\`\${agent.id}-\${l.dk}\`]?.finNuit&&<div style={{fontSize:11,color:"#0369a1",background:"#f0f9ff",borderRadius:6,padding:"2px 8px",marginBottom:4,display:"inline-flex",alignItems:"center",gap:4,fontWeight:700}}>\u{1F319} Descente de nuit</div>}`;

if(c.includes(old)) {
  c = c.replace(old, newCode);
  console.log('OK - en remplacé par schedule');
} else {
  console.log('ERREUR - badge non trouvé');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
