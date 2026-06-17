const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `          equipe2:  newEntry.equipe2||null,
          jsCode:   newEntry.jsCode||newEntry.equipe||null,`;

const newCode = `          equipe2:  newEntry.equipe2||null,
          jsCode:   newEntry.jsCode||newEntry.equipe||null,
          jsCode2:  newEntry.jsCodeNuit||null,`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - jsCode2 dans fullEntry');
} else {
    console.log('ERREUR - texte non trouve');
}
