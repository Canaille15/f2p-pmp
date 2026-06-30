const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('MOIS_L[new Date(dateKey).getMonth()]')) {
  console.log('Deja modifie, rien a faire.');
  process.exit(0);
}

const idxStart = content.indexOf('<div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"center"}}>');
if (idxStart === -1) { console.log('ERREUR: bloc de depart introuvable'); process.exit(1); }
const idxEnd = content.indexOf('</label>', idxStart) + '</label>'.length;
const idxDivEnd = content.indexOf('</div>', idxEnd) + '</div>'.length;

const calIcon = '\uD83D\uDCC5';
const chevron = '\u25BE';
const apostrophe = String.fromCharCode(39);

const newBlock = '<div style={{display:"flex",alignItems:"center",gap:10}}>\n        <label style={{position:"relative",cursor:"pointer",display:"flex",alignItems:"center",gap:4,border:"none",background:"none",padding:"4px 0"}}>\n          <span style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{MOIS_L[new Date(dateKey).getMonth()]} {new Date(dateKey).getFullYear()}</span>\n          <span style={{fontSize:11,color:"#94a3b8"}}>' + chevron + '</span>\n          <input type="date" onChange={e=>{if(e.target.value)jumpToDate(e.target.value);}} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/>\n        </label>\n        <button onClick={goToToday} style={{display:"flex",alignItems:"center",gap:6,border:"none",background:weekOffset===0?"#f1f5f9":"#E6F1FB",color:weekOffset===0?"#94a3b8":"#0C447C",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>' + calIcon + ' Aujourd' + apostrophe + 'hui</button>\n      </div>';

content = content.slice(0, idxStart) + newBlock + content.slice(idxDivEnd);
fs.writeFileSync(path, content, 'utf8');
console.log('OK - Aujourd' + apostrophe + 'hui + mois/annee regroupes a gauche (CPS/Previsionnel)');
