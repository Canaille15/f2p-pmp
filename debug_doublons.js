const fs = require('fs');
const c = fs.readFileSync('src/App.jsx', 'utf8');
const idx = c.indexOf('AGENTS_INIT');
const idx2 = c.indexOf('];', idx);
const block = c.slice(idx, idx2);

// Extraire nom ET id pour chaque agent
const agentMatches = [...block.matchAll(/id:"([^"]+)"[^}]*?nom:"([^"]+)"/g)];
const agents = agentMatches.map(m => ({id: m[1], nom: m[2]}));

console.log('Total agents:', agents.length);

// Chercher doublons de nom
const nomCount = {};
agents.forEach(a => { nomCount[a.nom] = (nomCount[a.nom]||0)+1; });
const doublons = Object.entries(nomCount).filter(([n,c])=>c>1);
console.log('Doublons de nom:', doublons);

// Verifier specifiquement HUMEZ USSON RACAMIER
['HUMEZ','USSON','RACAMIER'].forEach(nom=>{
  const matches = agents.filter(a=>a.nom===nom);
  console.log(nom+':', JSON.stringify(matches));
});
