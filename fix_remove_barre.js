const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

// 1. Supprimer les 3 instances de BarreSaisie dans les vues
const barreBlocks = [
  `      {/* ── BARRE DE SAISIE ── */}\r\n      <BarreSaisie\r\n        profile={profile}\r\n        habilitations={profile.habilitations||{}}\r\n        codeActif={codeActif} setCodeActif={setCodeActif}\r\n        getColor={getColor} getTc={getTc}\r\n        setDay={setDay} schedule={schedule} agentId={agent?.id}\r\n      />\r\n`,
];

let count = 0;
for (const block of barreBlocks) {
  while (c.includes(block)) {
    c = c.replace(block, '');
    count++;
  }
}
console.log(`Barres supprimees: ${count}`);

// 2. Supprimer codeActif dans les onClick des cases mois
const oldClick = `              onClick={()=>{\r\n                if(codeActif===\"EFFACER\"){ setDay(dk,null); return; }\r\n                if(codeActif){ setDay(dk,code===codeActif?null:codeActif); return; }\r\n                setDayPopup({dk, entry:en||null});\r\n              }}`;
const newClick = `              onClick={()=>{ setDayPopup({dk, entry:en||null}); }}`;

if (c.includes(oldClick)) {
  c = c.replace(oldClick, newClick);
  console.log('OK - onClick mois simplifie');
} else {
  console.log('AVERT - onClick mois non trouve');
}

fs.writeFileSync(f, c, 'utf8');
console.log('OK - barre saisie supprimee');
