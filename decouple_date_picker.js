const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('dateJumpRef')) {
  console.log('Deja modifie, rien a faire.');
  process.exit(0);
}

// ETAPE 1 : ajouter la ref dateJumpRef juste apres jumpToDate
const idxJumpToDate = content.indexOf('const jumpToDate=(dateStr)=>{');
if (idxJumpToDate === -1) { console.log('ERREUR: jumpToDate introuvable'); process.exit(1); }
const idxJumpToDateEnd = content.indexOf('};', idxJumpToDate) + 2;
content = content.slice(0, idxJumpToDateEnd) + '\n  const dateJumpRef=useRef();' + content.slice(idxJumpToDateEnd);
console.log('Etape 1 OK - dateJumpRef ajoutee');

// ETAPE 2 : capturer et remplacer le bloc label+input par bouton + input detache
const idxLabelStart = content.indexOf('<label style={{position:"relative",cursor:"pointer",display:"flex",alignItems:"center",gap:4,border:"none",background:"none",padding:"4px 0"}}>');
if (idxLabelStart === -1) { console.log('ERREUR: label introuvable'); process.exit(1); }
const idxLabelEnd = content.indexOf('</label>', idxLabelStart) + '</label>'.length;
const originalLabelBlock = content.slice(idxLabelStart, idxLabelEnd);
console.log('Bloc label capture (longueur ' + originalLabelBlock.length + ')');

const idxSpanMonth = originalLabelBlock.indexOf('<span style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>');
const idxSpanMonthEnd = originalLabelBlock.indexOf('</span>', idxSpanMonth) + '</span>'.length;
const spanMonth = originalLabelBlock.slice(idxSpanMonth, idxSpanMonthEnd);

const idxSpanChevron = originalLabelBlock.indexOf('<span style={{fontSize:11,color:"#94a3b8"}}>');
const idxSpanChevronEnd = originalLabelBlock.indexOf('</span>', idxSpanChevron) + '</span>'.length;
const spanChevron = originalLabelBlock.slice(idxSpanChevron, idxSpanChevronEnd);

const newTriggerButton = '<button onClick={()=>{try{dateJumpRef.current.showPicker();}catch(e){dateJumpRef.current&&dateJumpRef.current.click();}}} style={{display:"flex",alignItems:"center",gap:4,border:"none",background:"none",padding:"4px 0",cursor:"pointer"}}>\n          ' + spanMonth + '\n          ' + spanChevron + '\n        </button>';

content = content.slice(0, idxLabelStart) + newTriggerButton + content.slice(idxLabelEnd);
console.log('Etape 2 OK - declencheur transforme en bouton simple');

// ETAPE 3 : ajouter l'input date cache et detache, juste avant la rangee de jours
const dayStripMarker = 'flexWrap:"nowrap",overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:2}}>';
const idxDayStrip = content.indexOf(dayStripMarker);
if (idxDayStrip === -1) { console.log('ERREUR: rangee de jours introuvable'); process.exit(1); }
const idxRowEnd = content.lastIndexOf('</div>', idxDayStrip);
if (idxRowEnd === -1) { console.log('ERREUR: fin de rangee introuvable'); process.exit(1); }
const insertAt3 = idxRowEnd + '</div>'.length;
const hiddenInput = '\n      <input ref={dateJumpRef} type="date" onChange={e=>{if(e.target.value)jumpToDate(e.target.value);}} style={{position:"absolute",width:0,height:0,opacity:0,pointerEvents:"none",border:"none"}}/>';
content = content.slice(0, insertAt3) + hiddenInput + content.slice(insertAt3);
console.log('Etape 3 OK - champ date cache detache ajoute');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
