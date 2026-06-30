const fs = require('fs');
const path = 'src/components/DayEditPopup.jsx';
let content = fs.readFileSync(path, 'utf8');

const anchor = `  const getPostes = (type) => {
    if (!["M","AM","N","J"].includes(type)) return [];
    const postes = tous_postes.filter(p => p.types.includes(type));
    if (habCodes.length === 0) return postes;
    return postes.filter(p =>
      habCodes.some(h => h.includes(p.code) || p.code.includes(h.slice(0,4)))
    );
  };`;

const idx = content.indexOf(anchor);
if (idx === -1) {
  console.log('ERREUR: anchor introuvable');
  process.exit(1);
}

const newCode = `  const getPostes = (type) => {
    if (!["M","AM","N","J"].includes(type)) return [];
    const postes = tous_postes.filter(p => p.types.includes(type));
    if (habCodes.length === 0) return postes;
    return postes.filter(p =>
      p.code === "PPRCI" || p.code === "PPAR" ||
      habCodes.some(h => h.includes(p.code) || p.code.includes(h.slice(0,4)))
    );
  };`;

content = content.slice(0, idx) + newCode + content.slice(idx + anchor.length);
fs.writeFileSync(path, content, 'utf8');
console.log('OK - PPRCI/PPAR toujours visibles, peu importe les habilitations');
