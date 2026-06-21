const fs = require('fs');
const c = fs.readFileSync('src/App.jsx', 'utf8');
const idx = c.indexOf('PICCL"');
console.log('idx:', idx);
if (idx !== -1) {
  console.log(c.slice(idx - 100, idx + 250));
}
