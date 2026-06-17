const fs = require('fs');
const f = 'src/components/DayEditPopup.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = "choisirSimple = (code) => {\n    setType1(code);\n    setHoraires1(\"\");\n    setPoste1(\"\");\n    setDebutNuit(false);\n    setShowFetes(false);\n  };";

const newCode = `choisirSimple = (code) => {
    if (type1 === code) {
      setType1("");
    } else {
      setType1(code);
    }
    setHoraires1("");
    setPoste1("");
    setShowFetes(false);
  };`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - toggle type simple');
} else {
    console.log('ERREUR');
}
