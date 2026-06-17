const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// 1. Remplacer le onClick de la case semaine
const oldClick = `if(codeActif===\"EFFACER\") setDay(dk,null);\r\n              else if(codeActif) setDay(dk, code===codeActif?null:codeActif);\r\n            }}`;
const newClick = `setDayPopup({dk, entry:en||null});\r\n            }}`;

if(c.includes(oldClick)) {
  c = c.replace(oldClick, newClick);
  console.log('OK - onClick remplacé');
} else {
  console.log('ERREUR - onClick non trouvé');
}

// 2. Remplacer cursor dynamique par cursor fixe
const oldCursor = `cursor:codeActif?\"pointer\":\"default\",`;
const newCursor = `cursor:\"pointer\",`;
if(c.includes(oldCursor)) {
  c = c.replace(oldCursor, newCursor);
  console.log('OK - cursor remplacé');
} else {
  console.log('ERREUR - cursor non trouvé');
}

// 3. Supprimer le sélecteur équipe - chercher par morceau unique
const oldSelectStart = `{/* Sélecteur équipe */}`;
const oldSelectEnd = `].map(o=><option key={o.c} value={o.c}>{o.l}</option>)}\r\n              </select>\r\n            </div>`;

const idxStart = c.indexOf(oldSelectStart);
const idxEnd = c.indexOf(oldSelectEnd);
if(idxStart !== -1 && idxEnd !== -1) {
  c = c.slice(0, idxStart) + c.slice(idxEnd + oldSelectEnd.length);
  console.log('OK - sélecteur équipe supprimé');
} else {
  console.log('ERREUR - sélecteur équipe non trouvé', idxStart, idxEnd);
}

// 4. Supprimer le bouton prise de nuit
const oldNuitStart = `{/* Bouton prise de nuit */}`;
const oldNuitEnd = `</select>\r\n            </div>}`;

const idxNuitStart = c.indexOf(oldNuitStart);
const idxNuitEnd = c.indexOf(oldNuitEnd);
if(idxNuitStart !== -1 && idxNuitEnd !== -1) {
  c = c.slice(0, idxNuitStart) + c.slice(idxNuitEnd + oldNuitEnd.length);
  console.log('OK - bouton prise de nuit supprimé');
} else {
  console.log('ERREUR - bouton prise de nuit non trouvé', idxNuitStart, idxNuitEnd);
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
