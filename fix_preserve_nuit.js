const fs = require('fs');

// ── 1. onSave dans App.jsx — préserver equipe2/jsCode2 si pas modifiés ──────
let c = fs.readFileSync('src/App.jsx', 'utf8');

const old = `        const fullEntry={
          equipe:   newEntry.equipe !== undefined ? (newEntry.equipe||null) : (prevEntry.equipe||null),
          equipe2:  newEntry.equipe2||null,
          jsCode:   newEntry.jsCode||null,
          jsCode2:  newEntry.jsCodeNuit||null,
          horaires: newEntry.horaires||null,
          prive:    newEntry.prive||false,
          finNuit:  newEntry.finNuit !== undefined ? newEntry.finNuit : (prevEntry.finNuit||false),
          impressionAt: null,
        };`;

const newCode = `        const fullEntry={
          equipe:   newEntry.equipe !== undefined ? (newEntry.equipe||null) : (prevEntry.equipe||null),
          // Preserver la nuit existante si le popup ne la modifie pas
          equipe2:  newEntry.equipe2 !== undefined ? (newEntry.equipe2||null) : (prevEntry.equipe2||null),
          jsCode:   newEntry.jsCode !== undefined ? (newEntry.jsCode||null) : (prevEntry.jsCode||null),
          jsCode2:  newEntry.jsCodeNuit !== undefined ? (newEntry.jsCodeNuit||null) : (prevEntry.jsCode2||null),
          horaires: newEntry.horaires !== undefined ? (newEntry.horaires||null) : (prevEntry.horaires||null),
          prive:    newEntry.prive||false,
          finNuit:  newEntry.finNuit !== undefined ? newEntry.finNuit : (prevEntry.finNuit||false),
          impressionAt: null,
        };`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    console.log('OK - fullEntry preserve nuit');
} else {
    console.log('ERREUR - fullEntry non trouve');
}

fs.writeFileSync('src/App.jsx', c, 'utf8');

// ── 2. DayEditPopup — initialiser debutNuit et posteNuit depuis entry ──────
let d = fs.readFileSync('src/components/DayEditPopup.jsx', 'utf8');

const old2 = `  const [debutNuit, setDebutNuit] = useState(!!entry?.equipe2);
  const [posteNuit, setPosteNuit] = useState("");`;

const newCode2 = `  const [debutNuit, setDebutNuit] = useState(!!entry?.equipe2);
  const [posteNuit, setPosteNuit] = useState(entry?.jsCode2 || "");`;

if (d.includes(old2)) {
    d = d.replace(old2, newCode2);
    console.log('OK - posteNuit initialise depuis entry');
} else {
    console.log('ERREUR - posteNuit state non trouve');
}

// Passer equipe2 et jsCodeNuit explicitement dans sauvegarder
const old3 = `      equipe2:   debutNuit ? "N" : null,
      jsCodeNuit: posteNuit || null,`;
const newCode3 = `      equipe2:   debutNuit ? "N" : (entry?.equipe2||null),
      jsCodeNuit: debutNuit ? (posteNuit || entry?.jsCode2 || null) : null,`;

if (d.includes(old3)) {
    d = d.replace(old3, newCode3);
    console.log('OK - sauvegarder preserve equipe2');
} else {
    console.log('ERREUR - sauvegarder non trouve');
}

fs.writeFileSync('src/components/DayEditPopup.jsx', d, 'utf8');
console.log('Termine');
