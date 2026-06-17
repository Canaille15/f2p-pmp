const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `        const fullEntry={
          equipe:   newEntry.equipe||null,
          equipe2:  newEntry.equipe2||null,
          jsCode:   newEntry.jsCode||newEntry.equipe||null,
          jsCode2:  newEntry.jsCodeNuit||null,
          horaires: newEntry.horaires||null,
          prive:    newEntry.prive||false,`;

const newCode = `        const prevEntry = schedule[agCp+'-'+dk] || {};
        const fullEntry={
          equipe:   newEntry.equipe !== undefined ? (newEntry.equipe||null) : (prevEntry.equipe||null),
          equipe2:  newEntry.equipe2||null,
          jsCode:   newEntry.jsCode||null,
          jsCode2:  newEntry.jsCodeNuit||null,
          horaires: newEntry.horaires||null,
          prive:    newEntry.prive||false,`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - fullEntry garde equipe existante');
} else {
    console.log('ERREUR - texte non trouve');
}
