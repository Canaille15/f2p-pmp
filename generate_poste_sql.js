const fs = require('fs');
const agents = JSON.parse(fs.readFileSync('agents_extracted.json', 'utf8'));

let sql = `-- Ajouter colonne poste a la table agent
ALTER TABLE agent ADD COLUMN IF NOT EXISTS poste VARCHAR(50) DEFAULT NULL;

`;

agents.forEach(a => {
  const nom = a.nom.replace(/'/g, "''");
  const prenom = a.prenom.replace(/'/g, "''");
  const poste = (a.poste || '').replace(/'/g, "''");
  sql += `UPDATE agent SET poste='${poste}' WHERE nom='${nom}' AND prenom='${prenom}';\n`;
});

fs.writeFileSync('update_poste.sql', sql, 'utf8');
console.log('OK - fichier update_poste.sql genere avec', agents.length, 'agents');
