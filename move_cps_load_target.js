const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldBlock = "api.cps.getSchedule().then(entries=>{\r\n      console.log(\"CPS ENTRIES RECUES:\", Object.keys(entries||{}).length, \"cles. BEFFARAL:\", Object.keys(entries||{}).filter(k=>k.startsWith(\"6810186B\")));\r\n      if(!entries||Object.keys(entries).length===0) return;\r\n      setSchedule(prev=>({...prev,...entries}));\r\n    }).catch(e=>console.error(\"Erreur chargement CPS:\",e));";

const newBlock = "api.cps.getSchedule().then(entries=>{\r\n      if(!entries||Object.keys(entries).length===0) return;\r\n      setCpsSchedule(prev=>({...prev,...entries}));\r\n    }).catch(e=>console.error(\"Erreur chargement CPS:\",e));";

if (c.includes(oldBlock)) {
  c = c.replace(oldBlock, newBlock);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - chargement CPS vers cpsSchedule + debug retire');
} else {
  console.log('ERREUR - bloc non trouve, tentative sans debug...');
  const oldBlock2 = "api.cps.getSchedule().then(entries=>{\r\n      if(!entries||Object.keys(entries).length===0) return;\r\n      setSchedule(prev=>({...prev,...entries}));\r\n    }).catch(e=>console.error(\"Erreur chargement CPS:\",e));";
  if (c.includes(oldBlock2)) {
    c = c.replace(oldBlock2, newBlock);
    fs.writeFileSync('src/App.jsx', c, 'utf8');
    console.log('OK (variante 2) - chargement CPS vers cpsSchedule');
  } else {
    console.log('ERREUR DEFINITIVE - aucun bloc ne matche');
  }
}
