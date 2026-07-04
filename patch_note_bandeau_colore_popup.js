// patch_note_bandeau_colore_popup.js
// DayEditPopup.jsx : transforme le champ Note en bandeau colore, sur le
// meme modele visuel que le toggle Descente de nuit (fond teinte, bordure
// coloree, pastille actif/inactif). La couleur utilisee est celle
// personnalisee via le selecteur de couleurs (groupe 'Note perso'),
// ou orange par defaut si non personnalisee.
// Prerequis : App.jsx doit deja avoir recu patch_note_couleur_rpp_centre.js
// (pour que le groupe de couleur 'NOTE' existe).
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_note_bandeau_colore_popup.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'DayEditPopup.jsx');
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
content = mustReplaceOnce(content, "  const profile = agentProfiles?.[agKey] || {};\r\n", "  const profile = agentProfiles?.[agKey] || {};\n  const noteColor = profile.agentColors?.NOTE || \"#b45309\";\r\n", 'hunk_0_L76');
count++;
content = mustReplaceOnce(content, "          <div>\n            <div style={{\n              fontSize:10, color:\"#94a3b8\", fontWeight:700,\n              marginBottom:5, textTransform:\"uppercase\", letterSpacing:.5,\n              display:\"flex\", alignItems:\"center\", gap:5,\n            }}>\n              \ud83d\udcdd Note (visible uniquement par toi)\n", "          <div style={{\n            padding:\"10px 14px\",\n            background: notePerso ? noteColor+\"15\" : \"#f8fafc\",\n            border: notePerso ? `2px solid ${noteColor}` : \"1.5px dashed #cbd5e1\",\n            borderRadius:10,\n            transition:\"all .15s\",\n          }}>\n            <div style={{\n              fontSize:12, fontWeight:700,\n              color: notePerso ? noteColor : \"#64748b\",\n              display:\"flex\", alignItems:\"center\", gap:8,\n              marginBottom:8,\n            }}>\n              \ud83d\udcdd Note (visible uniquement par toi)\n              <span style={{\n                marginLeft:\"auto\", fontSize:10, fontWeight:700,\n                background: notePerso ? noteColor : \"#e2e8f0\",\n                color: notePerso ? \"#fff\" : \"#94a3b8\",\n                borderRadius:6, padding:\"1px 8px\",\n              }}>\n                {notePerso ? \"actif\" : \"inactif\"}\n              </span>\n", 'hunk_1_L282');
count++;
content = mustReplaceOnce(content, "                width:\"100%\", padding:\"10px 12px\",\n                border: notePerso ? \"1.5px solid #1e293b\" : \"1.5px dashed #cbd5e1\",\n                borderRadius:8,\n", "                width:\"100%\", padding:\"9px 11px\",\n                border: `1.5px solid ${notePerso ? noteColor+\"66\" : \"#e2e8f0\"}`,\n                borderRadius:8, background:\"#fff\",\n", 'hunk_2_L295');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);