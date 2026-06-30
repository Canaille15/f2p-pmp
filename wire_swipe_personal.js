const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('const swipeWeek=useSwipeHandlers')) {
  console.log('Deja modifie, rien a faire.');
  process.exit(0);
}

// ETAPE 1 : ajouter swipeWeek et swipeMonth juste apres jumpToMonthDate
const idxJumpToMonthDate = content.indexOf('const jumpToMonthDate=(dateStr)=>{');
if (idxJumpToMonthDate === -1) { console.log('ERREUR: jumpToMonthDate introuvable'); process.exit(1); }
const idxJumpToMonthDateEnd = content.indexOf('};', idxJumpToMonthDate) + 2;
const insertion1 = '\n  const swipeWeek=useSwipeHandlers(()=>setWeekOffset(w=>w+1),()=>setWeekOffset(w=>w-1));\n  const swipeMonth=useSwipeHandlers(()=>setMonthOff(m=>m+1),()=>setMonthOff(m=>m-1));';
content = content.slice(0, idxJumpToMonthDateEnd) + insertion1 + content.slice(idxJumpToMonthDateEnd);
console.log('Etape 1 OK - swipeWeek et swipeMonth ajoutes');

// ETAPE 2 : attacher swipeWeek a la grille semaine
const anchor2 = '<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>';
const idx2 = content.indexOf(anchor2);
if (idx2 === -1) { console.log('ERREUR: grille semaine introuvable'); process.exit(1); }
const new2 = '<div onTouchStart={swipeWeek.onTouchStart} onTouchEnd={swipeWeek.onTouchEnd} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>';
content = content.slice(0, idx2) + new2 + content.slice(idx2 + anchor2.length);
console.log('Etape 2 OK - swipeWeek attache a la grille semaine');

// ETAPE 3 : attacher swipeMonth a la grille mois
const anchor3 = '<div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,overflow:"hidden"}}>';
const idx3 = content.indexOf(anchor3);
if (idx3 === -1) { console.log('ERREUR: grille mois introuvable'); process.exit(1); }
const new3 = '<div onTouchStart={swipeMonth.onTouchStart} onTouchEnd={swipeMonth.onTouchEnd} style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,overflow:"hidden"}}>';
content = content.slice(0, idx3) + new3 + content.slice(idx3 + anchor3.length);
console.log('Etape 3 OK - swipeMonth attache a la grille mois');

// ETAPE 4 : convertir le fragment de la vue planning en div avec swipeMonth
const anchor4 = '{calView==="planning"&&<>';
const idx4 = content.indexOf(anchor4);
if (idx4 === -1) { console.log('ERREUR: ouverture vue planning introuvable'); process.exit(1); }
const new4 = '{calView==="planning"&&<div onTouchStart={swipeMonth.onTouchStart} onTouchEnd={swipeMonth.onTouchEnd}>';
content = content.slice(0, idx4) + new4 + content.slice(idx4 + anchor4.length);

const idx4b = content.indexOf('</>}', idx4);
if (idx4b === -1) { console.log('ERREUR: fermeture vue planning introuvable'); process.exit(1); }
content = content.slice(0, idx4b) + '</div>}' + content.slice(idx4b + '</>}'.length);
console.log('Etape 4 OK - vue planning enveloppee avec swipeMonth (fragment converti en div)');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
