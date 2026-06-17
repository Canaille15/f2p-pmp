const fs = require('fs');
const f = 'src/api/client.js';
let c = fs.readFileSync(f, 'utf8');

const old = "jsCode:       row.js_code      || null,\r\n        horaires:     row.horaires     || null,";
const newCode = "jsCode:       row.code_poste   || row.js_code || null,\r\n        horaires:     row.heure_debut  ? (row.heure_debut.slice(0,5).replace(':','h')+'\u2013'+(row.heure_fin||'').slice(0,5).replace(':','h')) : (row.horaires||null),";

let count = 0;
while (c.includes(old)) {
    c = c.replace(old, newCode);
    count++;
}

if (count > 0) {
    fs.writeFileSync(f, c, 'utf8');
    console.log(`OK - ${count} occurrences remplacees`);
} else {
    console.log('ERREUR - texte non trouve');
}
