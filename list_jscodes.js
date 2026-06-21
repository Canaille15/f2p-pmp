const fs = require('fs');
const c = fs.readFileSync('src/App.jsx', 'utf8');
const idx = c.indexOf('POSTES_JOURNEE');
const idx2 = c.indexOf('];', idx);
const matches = [...c.slice(idx, idx2).matchAll(/jsCode:"([^"]+)"/g)].map(m => m[1]);
console.log(matches.join(','));
