const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldStr = 'diversRows.push({poste:{jsCode:"RFT SAM",label:"Renfort samedi",subtitle:""},jsCode:"RFT SAM",agents:renfortsSamedi,famille:null,maxSlots:99});\r\n  }\r\n  }\r\n  // Formation';

const newStr = 'diversRows.push({poste:{jsCode:"RFT SAM",label:"Renfort samedi",subtitle:""},jsCode:"RFT SAM",agents:renfortsSamedi,famille:null,maxSlots:99});\r\n  }\r\n  // Formation';

console.log('Pattern trouve:', c.includes(oldStr));

if (c.includes(oldStr)) {
  c = c.replace(oldStr, newStr);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - accolade surnumeraire retiree');
} else {
  console.log('ERREUR - pattern non trouve');
}
