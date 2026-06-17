const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldLine = 'const jsCode=jsCodeMatch?jsCodeMatch[1]:null;';
const newLine = 'let jsCode=jsCodeMatch?jsCodeMatch[1]:null;\n          if(jsCode&&/PA[A-Z]+1[0]$/.test(jsCode)) jsCode=jsCode.slice(0,-1)+"O";';

if (c.includes(oldLine)) {
  c = c.replace(oldLine, newLine);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - correction OCR 0/O ajoutee');
} else {
  console.log('ERREUR - pattern non trouve');
}
