const fs = require('fs');
const f = 'src/components/DayEditPopup.jsx';
let c = fs.readFileSync(f, 'utf8');

// 1. Rendre l'onglet + Nuit toujours visible
const old1 = `...(hasPeriode1 && ["M","AM","N","J"].includes(periode1.type) ? [{ id:"p2", label:"+ Nuit" }] : []),`;
const new1 = `{ id:"p2", label:"+ Nuit" },`;

if (c.includes(old1)) {
    c = c.replace(old1, new1);
    console.log('OK - onglet + Nuit toujours visible');
} else {
    console.log('AVERT - onglet non trouve');
}

// 2. Dans la fonction sauvegarder, inclure finNuit dans l'entry
const old2 = `    const newEntry = {
      equipe:   periode1.type   || null,
      jsCode:   periode1.jsCode || periode1.type || null,
      horaires: periode1.horaires || null,
      equipe2:  periode2.type   || null,
      prive:    !["M","AM","N","J","JF","FOR","DISPO"].includes(periode1.type),
      finNuit:  finNuit,
    };`;
const new2 = `    const newEntry = {
      equipe:   periode1.type   || null,
      jsCode:   periode1.jsCode || (["M","AM","N","J"].includes(periode1.type) ? null : periode1.type) || null,
      horaires: periode1.horaires || null,
      equipe2:  periode2.type   || null,
      prive:    !["M","AM","N","J","JF","FOR","DISPO"].includes(periode1.type),
      finNuit:  finNuit,
      debutNuit: !!periode2.type,
    };`;

if (c.includes(old2)) {
    c = c.replace(old2, new2);
    console.log('OK - newEntry avec debutNuit');
} else {
    console.log('AVERT - newEntry non trouve');
}

fs.writeFileSync(f, c, 'utf8');
console.log('Termine');
