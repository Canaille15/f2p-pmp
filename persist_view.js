const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldLine = `const [view,setView]=useState("personal");`;
const newLine = `const [view,setView]=usePersist("view","personal");`;

if (c.includes(oldLine)) {
  c = c.replace(oldLine, newLine);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - vue active persiste maintenant');
} else {
  console.log('ERREUR - ligne non trouvee');
}
