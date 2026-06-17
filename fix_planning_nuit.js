const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// 1. Supprimer minHeight fixe
const old1 = `minHeight:52,`;
const new1 = `minHeight:48,`;

if(c.includes(old1)) {
  c = c.replace(old1, new1);
  console.log('OK - minHeight ajusté');
} else {
  console.log('ERREUR 1');
}

// 2. Ajouter badge Nuit (equipe2) dans la vue Planning
// Chercher après le badge principal
const old2 = `{/* Barre horaire visuelle */}`;
const new2 = `{/* Badge nuit du soir */}\r\n                      {schedule[\`\${agent.id}-\${l.dk}\`]?.equipe2==="N"&&l.showData&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>\r\n                        <span style={{background:getColor("N"),color:getTc("N"),borderRadius:8,padding:"3px 10px",fontSize:12,fontWeight:800}}>Nuit</span>\r\n                        {schedule[\`\${agent.id}-\${l.dk}\`]?.jsCode2&&<span style={{fontSize:10,color:"#64748b",fontWeight:600,fontFamily:"monospace"}}>{schedule[\`\${agent.id}-\${l.dk}\`]?.jsCode2}</span>}\r\n                      </div>}\r\n                      {/* Barre horaire visuelle */}`;

if(c.includes(old2)) {
  c = c.replace(old2, new2);
  console.log('OK - badge nuit ajouté');
} else {
  console.log('ERREUR 2 - barre horaire non trouvée');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
