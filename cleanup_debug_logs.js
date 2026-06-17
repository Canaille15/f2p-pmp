const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

// Supprimer le log TEXTE OCR
c = c.replace('console.log("TEXTE OCR:",text);\n        ', '');

// Supprimer le log LIGNE SUSPECTE
c = c.replace('if(line.includes("HUMEZ")||line.includes("USSON")||line.includes("RACAMIER")) console.log("LIGNE SUSPECTE:",JSON.stringify(line));\n          ', '');

// Supprimer le log UPDATES
c = c.replace('console.log("UPDATES:",updates.length,JSON.stringify(updates));\n        ', '');

fs.writeFileSync('src/App.jsx', c, 'utf8');
console.log('OK - logs de debug supprimes');
