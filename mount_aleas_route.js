const fs = require('fs');
let c = fs.readFileSync('api/api/server.js', 'utf8');

const oldLine = "app.use('/api/cps',            require('./src/routes/cps'));";
const newLine = "app.use('/api/cps',            require('./src/routes/cps'));\napp.use('/api/cps-aleas',      require('./src/routes/aleas'));";

console.log('Pattern trouve:', c.includes(oldLine));

if (c.includes(oldLine)) {
  c = c.replace(oldLine, newLine);
  fs.writeFileSync('api/api/server.js', c, 'utf8');
  console.log('OK - route cps-aleas montee');
} else {
  console.log('ERREUR - ligne non trouvee');
}
