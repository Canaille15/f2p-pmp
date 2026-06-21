const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldLine = "<GlobalView agents={agents} schedule={schedule} setSchedule={setSchedule} currentAgent={currentAgent}";
const newLine = "<GlobalView agents={agents} schedule={cpsSchedule} setSchedule={setCpsSchedule} currentAgent={currentAgent}";

if (c.includes(oldLine)) {
  c = c.replace(oldLine, newLine);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - GlobalView utilise maintenant cpsSchedule');
} else {
  console.log('ERREUR - ligne non trouvee');
}
