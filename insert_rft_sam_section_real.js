const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const marker = 'isDispo:true,maxSlots:99});';
const idx = c.indexOf(marker);

if (idx === -1) {
  console.log('ERREUR - marqueur non trouve');
  process.exit(1);
}

const insertPos = idx + marker.length;

const insertion = `
  // Renfort samedi (RFT SAM) - poste occasionnel, affiche uniquement si detecte
  const renfortsSamedi=agents.filter(a=>{const en=schedule[\`\${a.id}-\${dateKey}\`];return en&&en.jsCode==="RFT SAM";});
  if(renfortsSamedi.length>0){
    diversRows.push({poste:{jsCode:"RFT SAM",label:"Renfort samedi",subtitle:""},jsCode:"RFT SAM",agents:renfortsSamedi,famille:null,maxSlots:99});
  }`;

c = c.slice(0, insertPos) + insertion + c.slice(insertPos);
fs.writeFileSync('src/App.jsx', c, 'utf8');
console.log('OK - section Renfort samedi inseree pour de vrai');
