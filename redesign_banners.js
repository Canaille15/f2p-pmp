const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('Feuille de presence')) {
  console.log('Deja modifie, rien a faire.');
  process.exit(0);
}

const idxAlt = content.indexOf('isPrevisionnel&&<div style={{display:"flex",alignItems:"center",gap:8,background:"#EEEDFE"');
if (idxAlt === -1) { console.log('ERREUR: marqueur introuvable'); process.exit(1); }
const idxStart = content.lastIndexOf('{', idxAlt);
const idxEnd = content.indexOf('</div>}', idxAlt) + '</div>}'.length;

const newBanners =
  '{isPrevisionnel&&<div style={{display:"flex",alignItems:"center",gap:10,background:"#4338CA",borderRadius:12,padding:"12px 16px",flexWrap:"wrap"}}>\n' +
  '      <span style={{fontSize:20}}>\u{1F4C5}</span>\n' +
  '      <div style={{display:"flex",flexDirection:"column",gap:2,flex:1,minWidth:200}}>\n' +
  '        <span style={{fontSize:15,fontWeight:800,color:"#fff"}}>Planning pr\u00e9visionnel partag\u00e9</span>\n' +
  '        <span style={{fontSize:12,color:"#E0E7FF"}}>Bas\u00e9 sur les d\u00e9clarations personnelles des agents</span>\n' +
  '      </div>\n' +
  '    </div>}\n' +
  '    {!isPrevisionnel&&<div style={{display:"flex",alignItems:"center",gap:10,background:"#0C447C",borderRadius:12,padding:"12px 16px",flexWrap:"wrap"}}>\n' +
  '      <span style={{fontSize:20}}>\u{1F4CB}</span>\n' +
  '      <div style={{display:"flex",flexDirection:"column",gap:2,flex:1,minWidth:200}}>\n' +
  '        <span style={{fontSize:15,fontWeight:800,color:"#fff"}}>FEUILLE DE PRESENCE JOURNALIERE</span>\n' +
  '      </div>\n' +
  '    </div>}';

content = content.slice(0, idxStart) + newBanners + content.slice(idxEnd);
fs.writeFileSync(path, content, 'utf8');
console.log('OK - bandeaux Previsionnel + CPS Officiel refaits');
