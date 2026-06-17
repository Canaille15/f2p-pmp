const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldBlock = `let jsCode=jsCodeMatch?jsCodeMatch[1]:null;
          if(jsCode&&/PA[A-Z]+1[0]$/.test(jsCode)) jsCode=jsCode.slice(0,-1)+"O";`;

const newBlock = `let jsCode=jsCodeMatch?jsCodeMatch[1]:null;
          if(jsCode&&/PA[A-Z]+1[0]$/.test(jsCode)) jsCode=jsCode.slice(0,-1)+"O";
          if(jsCode&&/OR$/.test(jsCode)) jsCode=jsCode.slice(0,-1); // fix OCR : R parasite apres O
          if(jsCode&&/PIADIX$/.test(jsCode)) jsCode="PIADJX"; // fix OCR : I lu au lieu de J`;

if (c.includes(oldBlock)) {
  c = c.replace(oldBlock, newBlock);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - corrections OCR supplementaires ajoutees');
} else {
  console.log('ERREUR - pattern non trouve');
}
