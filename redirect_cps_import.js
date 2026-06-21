const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldBlock = "setSchedule(prev=>{\r\n          const next={...prev};\r\n          updates.forEach(u=>{next[u.key]={equipe:u.equipe,jsCode:u.jsCode,horaires:u.horaires,prive:false,impressionAt:new Date().toISOString()};});\r\n          return next;\r\n        });";

const newBlock = "setCpsSchedule(prev=>{\r\n          const next={...prev};\r\n          updates.forEach(u=>{next[u.key]={equipe:u.equipe,jsCode:u.jsCode,horaires:u.horaires,prive:false,impressionAt:new Date().toISOString()};});\r\n          return next;\r\n        });";

if (c.includes(oldBlock)) {
  c = c.replace(oldBlock, newBlock);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - import CPS redirige vers cpsSchedule');
} else {
  console.log('ERREUR - bloc non trouve');
}
