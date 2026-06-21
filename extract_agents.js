const fs = require('fs');
const c = fs.readFileSync('agents_init_full.txt', 'utf8');

// Extraire chaque objet agent : id, nom, prenom, grade, poste, fam
const agentRegex = /\{id:"([^"]+)"(?:,immatriculation:"([^"]+)")?,nom:"([^"]+)",\s*prenom:"([^"]+)",\s*grade:"([^"]+)",\s*poste:"([^"]*)",\s*fam:"([^"]+)"\}/g;

const agents = [];
let m;
while ((m = agentRegex.exec(c)) !== null) {
  agents.push({
    id: m[1],
    immatriculation: m[2] || null,
    nom: m[3],
    prenom: m[4],
    grade: m[5],
    poste: m[6],
    fam: m[7],
  });
}

console.log('Total agents extraits:', agents.length);
console.log('Exemple:', JSON.stringify(agents[0]));
console.log('Exemple HUMEZ:', JSON.stringify(agents.find(a => a.nom === 'HUMEZ')));

fs.writeFileSync('agents_extracted.json', JSON.stringify(agents, null, 2));
console.log('Fichier agents_extracted.json cree');
