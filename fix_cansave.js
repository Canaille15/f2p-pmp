const fs = require('fs');
const f = 'src/components/DayEditPopup.jsx';
let c = fs.readFileSync(f, 'utf8');

// canSave doit toujours être true si la case avait déjà quelque chose
const old = "  const canSave = !!(type1 || typeN || entry?.finNuit);";
const newCode = "  const canSave = true; // Toujours actif — si tout décoché = effacer la case";

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - canSave toujours actif');
} else {
    console.log('ERREUR');
}
