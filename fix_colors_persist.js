const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// Il y a 2 endroits où agentColors est chargé depuis Railway
// On veut fusionner : couleurs locales + couleurs Railway, locales prioritaires

const old1 = `agentColors:         profile.agent_colors||{},`;
const new1 = `agentColors:         {...(profile.agent_colors||{}), ...(prev[agentId]?.agentColors||{})},`;

// Remplacer toutes les occurrences
let count = 0;
while(c.includes(old1)) {
  c = c.replace(old1, new1);
  count++;
}
console.log(`OK - agentColors fusionné (${count} occurrence(s))`);

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
