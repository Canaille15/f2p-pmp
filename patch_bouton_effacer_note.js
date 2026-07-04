// patch_bouton_effacer_note.js
// Ajoute un bouton (icone croix) a cote du champ Note dans le popup, pour
// effacer le texte en un clic (visible seulement si la note n'est pas vide).
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_bouton_effacer_note.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, "src/components/DayEditPopup.jsx");
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - ' + "verifie que patch_note_bandeau_voyant.js est bien applique.");
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "            <input\n              value={notePerso}\n              onChange={e => setNotePerso(e.target.value)}\n              placeholder=\"ex: R\u00e9union service, visite de poste, rappel...\"\n              style={{\n                width:\"100%\", padding:\"9px 11px\",\n                border: `1.5px solid ${notePerso ? noteColor : \"#e2e8f0\"}`,\n                borderRadius:8, background:\"#fff\",\n                fontSize:14, fontWeight:600, color:\"#1e293b\",\n                outline:\"none\", boxSizing:\"border-box\",\n              }}\n            />\n", "            <div style={{display:\"flex\", gap:6, alignItems:\"center\"}}>\n              <input\n                value={notePerso}\n                onChange={e => setNotePerso(e.target.value)}\n                placeholder=\"ex: R\u00e9union service, visite de poste, rappel...\"\n                style={{\n                  flex:1, padding:\"9px 11px\",\n                  border: `1.5px solid ${notePerso ? noteColor : \"#e2e8f0\"}`,\n                  borderRadius:8, background:\"#fff\",\n                  fontSize:14, fontWeight:600, color:\"#1e293b\",\n                  outline:\"none\", boxSizing:\"border-box\",\n                }}\n              />\n              {notePerso && (\n                <button onClick={() => setNotePerso(\"\")} title=\"Effacer la note\"\n                  style={{\n                    flexShrink:0, width:36, height:36,\n                    background:\"#fff\", border:\"1.5px solid #fca5a5\",\n                    borderRadius:8, cursor:\"pointer\",\n                    color:\"#dc2626\", fontSize:15, fontWeight:800,\n                    display:\"flex\", alignItems:\"center\", justifyContent:\"center\",\n                  }}>\u2715</button>\n              )}\n            </div>\n", 'hunk_0_L307');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);