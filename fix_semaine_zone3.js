const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// Remplacer la ZONE 3 de la vue Semaine (sans poste) par une avec poste
const old = `ZONE 3 — Nuit (bas) */}\r\n              {(code===\"N\"||en?.equipe2===\"N\")&&showData&&<div style={{\r\n                background:getColor(\"N\"),color:getTc(\"N\"),\r\n                borderRadius:8,padding:\"4px 8px\",\r\n                fontSize:10,fontWeight:700,textAlign:\"center\",\r\n              }}>\r\n                Nuit\r\n              </div>}`;

const newZone = `ZONE 3 — Nuit (bas) */}\r\n              {(code===\"N\"||en?.equipe2===\"N\")&&showData&&<div style={{\r\n                background:getColor(\"N\"),color:getTc(\"N\"),\r\n                borderRadius:8,padding:\"4px 8px\",\r\n                fontSize:10,fontWeight:700,textAlign:\"center\",\r\n                display:\"flex\",flexDirection:\"column\",gap:2,\r\n              }}>\r\n                <span>Nuit</span>\r\n                {(code===\"N\"?en?.jsCode:en?.jsCode2)&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{code===\"N\"?en?.jsCode:en?.jsCode2}</span>}\r\n              </div>}`;

if(c.includes(old)) {
  c = c.replace(old, newZone);
  console.log('OK - zone 3 vue Semaine corrigée');
} else {
  console.log('ERREUR - zone 3 non trouvée');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
