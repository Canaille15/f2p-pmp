const fs = require('fs');
const agents = JSON.parse(fs.readFileSync('agents_extracted.json', 'utf8'));

let sql = '';

agents.forEach(a => {
  const nom = a.nom.replace(/'/g, "''");
  const prenom = a.prenom.replace(/'/g, "''");
  const poste = (a.poste || '').replace(/'/g, "''");
  sql += `UPDATE agent SET poste='${poste}' WHERE nom='${nom}' AND prenom='${prenom}';\n`;
});

fs.writeFileSync('update_poste_only.sql', sql, 'utf8');
console.log('OK - fichier update_poste_only.sql genere avec', agents.length, 'agents');
