const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('journeeSpecialeNoteTarget({agentId')) {
  console.log('Deja modifie, rien a faire.');
  process.exit(0);
}

const gradeDiv = '<div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>{ag.grade}</div>';

// ===== BLOC PREVISIONNEL =====
const prevButtonStart = '<button onClick={()=>setPrevisionnelTarget({agentId:ag.id,nomTitulaire:`${ag.prenom} ${ag.nom}`})}';
const idxPrevBtn = content.indexOf(prevButtonStart);
if (idxPrevBtn === -1) { console.log('ERREUR: bouton previsionnel introuvable'); process.exit(1); }
const idxPrevBtnEnd = content.indexOf('</button>', idxPrevBtn) + '</button>'.length;
const prevButtonOriginal = content.slice(idxPrevBtn, idxPrevBtnEnd);
console.log('Bouton Previsionnel capture (longueur ' + prevButtonOriginal.length + ')');

// Trouver le grade div juste avant ce bouton (scope a ce bloc precis)
const idxPrevGrade = content.lastIndexOf(gradeDiv, idxPrevBtn);
if (idxPrevGrade === -1) { console.log('ERREUR: grade div previsionnel introuvable'); process.exit(1); }
const idxPrevGradeEnd = idxPrevGrade + gradeDiv.length;

const noteDisplay = '\n                          {row.isJourneeSpeciale&&findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey)&&<div style={{fontSize:9,color:"#7c3aed",fontStyle:"italic"}}>{findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey).message}</div>}';

const newPrevButton = 'row.isJourneeSpeciale?\n                        <button onClick={()=>setJourneeSpecialeNoteTarget({agentId:ag.id,agentNom:`${ag.prenom} ${ag.nom}`,currentMessage:findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey)?.message||""})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>\ud83d\udcdd</button>\n                        :\n                        ' + prevButtonOriginal;

// Appliquer (ordre: d'abord le bouton plus loin dans le texte, puis le grade div, pour ne pas decaler les index)
content = content.slice(0, idxPrevBtn) + newPrevButton + content.slice(idxPrevBtnEnd);
content = content.slice(0, idxPrevGradeEnd) + noteDisplay + content.slice(idxPrevGradeEnd);
console.log('OK - bloc Previsionnel modifie (bouton + affichage message)');

// ===== BLOC CPS =====
const cpsButtonStart = '<button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:row.famille,nomOfficiel:`${ag.prenom} ${ag.nom}`})}';
const idxCpsBtn = content.indexOf(cpsButtonStart);
if (idxCpsBtn === -1) { console.log('ERREUR: bouton CPS introuvable'); process.exit(1); }
const idxCpsBtnEnd = content.indexOf('</button>', idxCpsBtn) + '</button>'.length;
const cpsButtonOriginal = content.slice(idxCpsBtn, idxCpsBtnEnd);
console.log('Bouton CPS capture (longueur ' + cpsButtonOriginal.length + ')');

const idxCpsGrade = content.lastIndexOf(gradeDiv, idxCpsBtn);
if (idxCpsGrade === -1) { console.log('ERREUR: grade div CPS introuvable'); process.exit(1); }
const idxCpsGradeEnd = idxCpsGrade + gradeDiv.length;

const newCpsButton = 'row.isJourneeSpeciale?\n                      <button onClick={()=>setJourneeSpecialeNoteTarget({agentId:ag.id,agentNom:`${ag.prenom} ${ag.nom}`,currentMessage:findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey)?.message||""})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>\ud83d\udcdd</button>\n                      :\n                      ' + cpsButtonOriginal;

content = content.slice(0, idxCpsBtn) + newCpsButton + content.slice(idxCpsBtnEnd);
content = content.slice(0, idxCpsGradeEnd) + noteDisplay + content.slice(idxCpsGradeEnd);
console.log('OK - bloc CPS modifie (bouton + affichage message)');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
