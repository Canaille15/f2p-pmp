const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldBlock = `PERIOD_COLORS = {
  M:     { header:"#7f1d1d", border:"#fecaca", bg:"#fff5f5", badge:"#ef4444" },
  J:     { header:"#1e3a5f", border:"#bfdbfe", bg:"#eff6ff", badge:"#3b82f6" },
  AM:    { header:"#713f12", border:"#fde68a", bg:"#fffbeb", badge:"#f59e0b" },
  N:     { header:"#1e1b4b", border:"#c7d2fe", bg:"#eef2ff", badge:"#6366f1" },
  DIVERS:{ header:"#374151", border:"#e5e7eb", bg:"#f9fafb", badge:"#6b7280" },
};`;

const newBlock = `PERIOD_COLORS = {
  M:     { header:"#854F0B", border:"#FAC775", bg:"#FAEEDA", badge:"#EF9F27" },
  J:     { header:"#0C447C", border:"#85B7EB", bg:"#E6F1FB", badge:"#378ADD" },
  AM:    { header:"#993C1D", border:"#F0997B", bg:"#FAECE7", badge:"#D85A30" },
  N:     { header:"#1e1b4b", border:"#c7d2fe", bg:"#eef2ff", badge:"#6366f1" },
  DIVERS:{ header:"#374151", border:"#e5e7eb", bg:"#f9fafb", badge:"#6b7280" },
};`;

if (c.includes(oldBlock)) {
  c = c.replace(oldBlock, newBlock);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - couleurs PERIOD_COLORS ameliorees');
} else {
  console.log('ERREUR - bloc non trouve');
}
