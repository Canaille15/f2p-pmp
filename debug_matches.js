const fs = require('fs');
const c = fs.readFileSync('src/App.jsx', 'utf8');
const idx = c.indexOf('AGENTS_INIT');
const idx2 = c.indexOf('];', idx);
const block = c.slice(idx, idx2);
const noms = [...block.matchAll(/nom:"([^"]+)"/g)].map(m => m[1]);

const line1 = 'PAAC1-\t06:15 - 14:07\tHUMEZ\tCINDY\tC05';
const line2 = 'PAAC2-\t06:15 - 14:07\tUSSON\tANTOINE\tCP5NIV1\tx';
const line3 = 'PAAC10\t14:05 - 21:57\tRACAMIER\tALEXANDRE CO5';

console.log('Matches HUMEZ line:', noms.filter(n => line1.toUpperCase().includes(n.toUpperCase())));
console.log('Matches USSON line:', noms.filter(n => line2.toUpperCase().includes(n.toUpperCase())));
console.log('Matches RACAMIER line:', noms.filter(n => line3.toUpperCase().includes(n.toUpperCase())));
console.log('Total noms:', noms.length);
