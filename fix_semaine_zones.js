const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// Supprimer le badge prise de nuit de la vue Semaine
const oldBadge = `              {/* Badge prise de nuit */}\r\n              {hasNuit2&&showData&&<div style={{\r\n                background:\"#1e3a8a\",\r\n                color:\"#fff\",\r\n                borderRadius:8,\r\n                padding:\"3px 8px\",\r\n                fontSize:9,\r\n                fontWeight:700,\r\n                textAlign:\"center\",\r\n              }}>\r\n                \u{1F319} Nuit\r\n              </div>}`;

if(c.includes(oldBadge)) {
  c = c.replace(oldBadge, '');
  console.log('OK - badge prise de nuit supprimé');
} else {
  console.log('ERREUR - badge non trouvé');
  // Chercher par morceaux
  const idx = c.indexOf('hasNuit2&&showData&&<div');
  if(idx !== -1) console.log('Trouvé à idx:', idx, JSON.stringify(c.slice(idx, idx+200)));
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
