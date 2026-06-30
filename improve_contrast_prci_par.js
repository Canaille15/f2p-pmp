const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

// ETAPE 1 : badge jsCode - fond plein colore, texte blanc
const anchor1 = '<span style={{fontFamily:"monospace",fontSize:10,fontWeight:800,color:fam?.color||"#7c3aed",background:(fam?.color||"#7c3aed")+"18",borderRadius:5,padding:"1px 6px"}}>{row.jsCode}</span>';
const idx1 = content.indexOf(anchor1);
if (idx1 === -1) { console.log('ERREUR: anchor1 introuvable'); process.exit(1); }
const new1 = '<span style={{fontFamily:"monospace",fontSize:10,fontWeight:800,color:"#fff",background:fam?.color||"#7c3aed",borderRadius:5,padding:"2px 7px"}}>{row.jsCode}</span>';
content = content.slice(0, idx1) + new1 + content.slice(idx1 + anchor1.length);
console.log('Etape 1 OK - badge jsCode en fond plein');

// ETAPE 2 : pastille famille PRCI/PAR - fond plein colore, texte blanc
const anchor2 = '{fam&&<span style={{fontSize:9,background:fam.light,color:fam.color,borderRadius:10,padding:"1px 6px",fontWeight:700}}>{row.famille}</span>}';
const idx2 = content.indexOf(anchor2);
if (idx2 === -1) { console.log('ERREUR: anchor2 introuvable'); process.exit(1); }
const new2 = '{fam&&<span style={{fontSize:9,background:fam.accent,color:"#fff",borderRadius:10,padding:"1px 7px",fontWeight:800}}>{row.famille}</span>}';
content = content.slice(0, idx2) + new2 + content.slice(idx2 + anchor2.length);
console.log('Etape 2 OK - pastille famille en fond plein');

// ETAPE 3 : bordure gauche coloree par famille sur chaque ligne
const anchor3 = 'borderBottom:ri<section.rows.length-1?`1px solid ${pc.border}`:"none",background:ri%2===0?pc.bg:"#fff"}}>';
const idx3 = content.indexOf(anchor3);
if (idx3 === -1) { console.log('ERREUR: anchor3 introuvable'); process.exit(1); }
const new3 = 'borderBottom:ri<section.rows.length-1?`1px solid ${pc.border}`:"none",background:ri%2===0?pc.bg:"#fff",borderLeft:`4px solid ${fam?.accent||"transparent"}`}}>';
content = content.slice(0, idx3) + new3 + content.slice(idx3 + anchor3.length);
console.log('Etape 3 OK - bordure gauche par famille ajoutee');

// ETAPE 4 : teinte de fond des cases agent (branche CPS Officiel / commune)
const anchor4 = 'background:isForm?"#f0fdf4":isMe?"#fafdf0":"rgba(255,255,255,.8)"';
const idx4 = content.indexOf(anchor4);
if (idx4 === -1) { console.log('ERREUR: anchor4 introuvable'); process.exit(1); }
const new4 = 'background:isForm?"#f0fdf4":isMe?"#fafdf0":(fam?.light||"rgba(255,255,255,.8)")';
content = content.slice(0, idx4) + new4 + content.slice(idx4 + anchor4.length);
console.log('Etape 4 OK - teinte case agent (branche CPS/commune)');

// ETAPE 5 : teinte de fond des cases agent (branche Previsionnel)
const anchor5 = 'background:isMe?"#fafdf0":"rgba(255,255,255,.8)"';
const idx5 = content.indexOf(anchor5);
if (idx5 === -1) { console.log('ERREUR: anchor5 introuvable'); process.exit(1); }
const new5 = 'background:isMe?"#fafdf0":(fam?.light||"rgba(255,255,255,.8)")';
content = content.slice(0, idx5) + new5 + content.slice(idx5 + anchor5.length);
console.log('Etape 5 OK - teinte case agent (branche Previsionnel)');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
