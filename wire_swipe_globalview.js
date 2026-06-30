const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('const swipeDay=useSwipeHandlers')) {
  console.log('Deja modifie, rien a faire.');
  process.exit(0);
}

// ETAPE 1 : ajouter le hook swipeDay juste apres jumpToDate
const idxJumpToDate = content.indexOf('const jumpToDate=(dateStr)=>{');
if (idxJumpToDate === -1) { console.log('ERREUR: jumpToDate introuvable'); process.exit(1); }
const idxJumpToDateEnd = content.indexOf('};', idxJumpToDate) + 2;
content = content.slice(0, idxJumpToDateEnd) + '\n  const swipeDay=useSwipeHandlers(()=>goToDay(1),()=>goToDay(-1));' + content.slice(idxJumpToDateEnd);
console.log('Etape 1 OK - swipeDay ajoute');

// ETAPE 2 : ouvrir le wrapper juste apres le commentaire Sections
const idxSectionsComment = content.indexOf('{/* Sections */}');
if (idxSectionsComment === -1) { console.log('ERREUR: commentaire Sections introuvable'); process.exit(1); }
const insertAt2 = idxSectionsComment + '{/* Sections */}'.length;
content = content.slice(0, insertAt2) + '\n    <div onTouchStart={swipeDay.onTouchStart} onTouchEnd={swipeDay.onTouchEnd}>' + content.slice(insertAt2);
console.log('Etape 2 OK - ouverture du wrapper ajoutee');

// ETAPE 3 : fermer le wrapper juste avant le commentaire Non renseignes
const idxNonRenseignes = content.indexOf('Non renseign', insertAt2);
if (idxNonRenseignes === -1) { console.log('ERREUR: commentaire Non renseignes introuvable'); process.exit(1); }
const idxCommentStart = content.lastIndexOf('{/*', idxNonRenseignes);
if (idxCommentStart === -1) { console.log('ERREUR: debut du commentaire introuvable'); process.exit(1); }
content = content.slice(0, idxCommentStart) + '</div>\n\n    ' + content.slice(idxCommentStart);
console.log('Etape 3 OK - fermeture du wrapper ajoutee');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
