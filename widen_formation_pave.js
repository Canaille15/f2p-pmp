const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldLine = `  const jsCodesFormationPostes=new Set(
    POSTES_JOURNEE.filter(x=>x.subtitle&&/formation/i.test(x.subtitle)).map(x=>x.jsCode)
  );`;

const newLine = `  const jsCodesFormationPostes=new Set(["K-PAR","K-PRCI","F-PRCI","AFO PAR","AFOPRCI","F-PAR"]);`;

if (c.includes(oldLine)) {
  c = c.replace(oldLine, newLine);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - pave Formation elargi (stagiaires + formateurs)');
} else {
  console.log('ERREUR - ligne non trouvee');
}
