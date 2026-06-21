const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldBlock = `const [schedule,_setScheduleRaw]=usePersist("schedule",{});
  const setSchedule = (updater) => {
    _setScheduleRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const beforeKeys = Object.keys(prev||{}).filter(k=>k.startsWith("6810186B"));
      const afterKeys = Object.keys(next||{}).filter(k=>k.startsWith("6810186B"));
      const lost = beforeKeys.filter(k=>!afterKeys.includes(k));
      if (lost.length > 0) {
        console.warn("PERTE DETECTEE - cles BEFFARAL perdues:", lost, new Error().stack);
      }
      return next;
    });
  };`;

const newBlock = `const [schedule,setSchedule]=usePersist("schedule",{});`;

if (c.includes(oldBlock)) {
  c = c.replace(oldBlock, newBlock);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - wrapper debug retire, nouveau state cpsSchedule a ajouter');
} else {
  console.log('ERREUR - bloc non trouve');
}
