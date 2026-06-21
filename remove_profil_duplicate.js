const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const doubled = '{view==="profil"&&<ProfilPersoView currentAgent={currentAgent}/>}\r\n      {view==="profil"&&<ProfilPersoView currentAgent={currentAgent}/>}';
const single = '{view==="profil"&&<ProfilPersoView currentAgent={currentAgent}/>}';

if (c.includes(doubled)) {
  c = c.replace(doubled, single);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - doublon retire');
} else {
  console.log('ERREUR - doublon non trouve');
}
