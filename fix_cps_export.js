const fs = require('fs');
let c = fs.readFileSync('src/api/client.js', 'utf8');

const exportOld = 'const api = {\r\n  auth,\r\n  agents,\r\n  planning,\r\n  profil,\r\n  conges,\r\n  notifications,\r\n  echanges,\r\n  pauses,\r\n  fetes,\r\n};';
const exportNew = 'const api = {\r\n  auth,\r\n  agents,\r\n  planning,\r\n  profil,\r\n  conges,\r\n  notifications,\r\n  echanges,\r\n  pauses,\r\n  fetes,\r\n  cps,\r\n};';

if (c.includes(exportOld)) {
  c = c.replace(exportOld, exportNew);
  fs.writeFileSync('src/api/client.js', c, 'utf8');
  console.log('OK - cps ajoute a export principal');
} else {
  console.log('ERREUR - export principal non trouve');
}
