// patch_notes_dayeditpopup.js
// DayEditPopup.jsx : ajoute le bouton RPP (repos, meme comportement que RP)
// et rend la Note disponible sur tout type de jour (plus limitee a
// PPRCI/PPAR), sans impact sur les compteurs.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_notes_dayeditpopup.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, "src/components/DayEditPopup.jsx");
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - le fichier differe de la version attendue.');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "  { code:\"RP\",  label:\"RP\",        color:\"#16a34a\" },\r\n  { code:\"RU\",  label:\"RU\",        color:\"#ca8a04\" },\r\n", "  { code:\"RP\",  label:\"RP\",        color:\"#16a34a\" },\r\n  { code:\"RPP\", label:\"RPP\",       color:\"#0d9488\" },\r\n  { code:\"RU\",  label:\"RU\",        color:\"#ca8a04\" },\r\n", 'hunk_0_L13');
count++;
content = mustReplaceOnce(content, "      notePerso:  (poste1===\"PPRCI\"||poste1===\"PPAR\") ? (notePerso||null) : null,   // ind\u00e9pendant, sauvegard\u00e9 tel quel\r\n", "      notePerso:  notePerso || null,   // ind\u00e9pendant, disponible sur tout type de jour, sauvegard\u00e9 tel quel\r\n", 'hunk_1_L169');
count++;
content = mustReplaceOnce(content, "              )}\r\n              {type1 && (\r\n", "              )}\r\n              {notePerso && (\r\n                <span style={{\r\n                  background:\"#422006\", border:\"1px solid #d97706\",\r\n                  color:\"#fcd34d\", fontSize:10, fontWeight:700,\r\n                  padding:\"2px 8px\", borderRadius:5,\r\n                }}>\ud83d\udcdd</span>\r\n              )}\r\n              {type1 && (\r\n", 'hunk_2_L213');
count++;
content = mustReplaceOnce(content, "              {!finNuit && !type1 && !typeN && (\r\n", "              {!finNuit && !type1 && !typeN && !notePerso && (\r\n", 'hunk_3_L232');
count++;
content = mustReplaceOnce(content, "\r\n          {/* \u2500\u2500 Repos / Absences \u2500\u2500 */}\r\n", "\r\n          {/* \u2500\u2500 \ud83d\udcdd Note perso \u2014 ind\u00e9pendant, visible uniquement par toi \u2500\u2500 */}\n          <div>\n            <div style={{\n              fontSize:10, color:\"#94a3b8\", fontWeight:700,\n              marginBottom:5, textTransform:\"uppercase\", letterSpacing:.5,\n              display:\"flex\", alignItems:\"center\", gap:5,\n            }}>\n              \ud83d\udcdd Note (visible uniquement par toi)\n            </div>\n            <input\n              value={notePerso}\n              onChange={e => setNotePerso(e.target.value)}\n              placeholder=\"ex: R\u00e9union service, visite de poste, rappel...\"\n              style={{\n                width:\"100%\", padding:\"10px 12px\",\n                border: notePerso ? \"1.5px solid #1e293b\" : \"1.5px dashed #cbd5e1\",\n                borderRadius:8,\n                fontSize:14, fontWeight:600, color:\"#1e293b\",\n                outline:\"none\", boxSizing:\"border-box\",\n              }}\n            />\n          </div>\n\n          {/* \u2500\u2500 Repos / Absences \u2500\u2500 */}\r\n", 'hunk_4_L272');
count++;
content = mustReplaceOnce(content, "                    {(poste1===\"PPRCI\"||poste1===\"PPAR\") && (\n            <div>\n              <div style={{\n                fontSize:10, color:\"#94a3b8\", fontWeight:700,\n                marginBottom:5, textTransform:\"uppercase\", letterSpacing:.5,\n              }}>\n                Pense-bete (visible uniquement par toi)\n              </div>\n              <input\n                value={notePerso}\n                onChange={e => setNotePerso(e.target.value)}\n                placeholder=\"ex: Reunion service, visite de poste...\"\n                style={{\n                  width:\"100%\", padding:\"10px 12px\",\n                  border:\"1.5px solid #1e293b\", borderRadius:8,\n                  fontSize:14, fontWeight:600, color:\"#1e293b\",\n                  outline:\"none\", boxSizing:\"border-box\",\n                }}\n              />\n            </div>\n          )}\n", "", 'hunk_5_L371');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);