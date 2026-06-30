const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('<JourneeSpecialeNotePopup')) {
  console.log('Deja present, rien a faire.');
  process.exit(0);
}

const marker = "setPrevisionnelSignalements(rows||[]));}}/>}";
const idxMarker = content.indexOf(marker);
if (idxMarker === -1) { console.log('ERREUR: marker introuvable'); process.exit(1); }
const insertAt = idxMarker + marker.length;

const popupRender = '\n    {journeeSpecialeNoteTarget&&<JourneeSpecialeNotePopup agentId={journeeSpecialeNoteTarget.agentId} agentNom={journeeSpecialeNoteTarget.agentNom} dateKey={dateKey} currentMessage={journeeSpecialeNoteTarget.currentMessage} onClose={()=>setJourneeSpecialeNoteTarget(null)} onSaved={()=>{api.journeeSpecialeNotes.getAll().then(rows=>setJourneeSpecialeNotes(rows||[]));}}/>}';

content = content.slice(0, insertAt) + popupRender + content.slice(insertAt);
fs.writeFileSync(path, content, 'utf8');
console.log('OK - rendu de JourneeSpecialeNotePopup ajoute');
