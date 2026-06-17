const fs = require('fs');
const f = 'src/components/DayEditPopup.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `      equipe2:   debutNuit ? "N" : null,
      prive:     !["M","AM","N","J","JF","FOR","DISPO",...FETES.map(f=>f.code)].includes(type1),
      finNuit:   finNuit,`;

const newCode = `      equipe2:   debutNuit ? "N" : null,
      jsCodeNuit: posteNuit || null,
      prive:     !["M","AM","N","J","JF","FOR","DISPO",...FETES.map(f=>f.code)].includes(type1),
      finNuit:   finNuit,`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - posteNuit dans newEntry');
} else {
    console.log('ERREUR - texte non trouve');
}
