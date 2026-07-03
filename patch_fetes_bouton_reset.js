// patch_fetes_bouton_reset.js
// Ajoute un bouton discret de reinitialisation (icone reset) dans chaque carte
// du panneau 'Suivi des fetes legales' (FetesSection, App.jsx).
// Ce bouton n'apparait que si une correction manuelle (date posee ou
// paiement force via les boutons date/paye) a ete appliquee sur cette fete,
// et permet de l'annuler en un clic pour revenir au calcul automatique
// base sur le planning perso (regles GRH00143 inchangees).
// Prerequis : App.jsx doit deja avoir recu patch_fetes_lisibilite.js (commit 4fd64dc).
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_fetes_bouton_reset.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - verifie que patch_fetes_lisibilite.js (commit 4fd64dc) a bien ete applique avant celui-ci.');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "  const setManualPayee = (code, val) => {\r\n    setFetesData(prev=>({...prev,[code]:{...(prev[code]||{}),estPayee:val}}));\r\n  };\r\n", "  const setManualPayee = (code, val) => {\r\n    setFetesData(prev=>({...prev,[code]:{...(prev[code]||{}),estPayee:val}}));\r\n  };\r\n  const resetManuel = (code) => {\r\n    setFetesData(prev=>{\r\n      const next = {...prev};\r\n      delete next[code];\r\n      return next;\r\n    });\r\n    setEditingCode(null);\r\n  };\r\n", 'resetManuel_function');
count++;
content = mustReplaceOnce(content, "                    <button onClick={()=>setManualPayee(l.code,!l.estPayee)}\r\n                      title={l.estPayee?\"Non pay\u00e9\":\"Marquer pay\u00e9\"}\r\n                      style={{background:l.estPayee?\"#dbeafe\":\"#f1f5f9\",\r\n                        border:`1.5px solid ${l.estPayee?\"#93c5fd\":\"#cbd5e1\"}`,\r\n                        borderRadius:8,padding:\"7px 11px\",cursor:\"pointer\",fontSize:15,minWidth:38,minHeight:38}}>\ud83d\udcb6</button>\r\n                    {/* Bouton motif r\u00e9glementaire */}", "                    <button onClick={()=>setManualPayee(l.code,!l.estPayee)}\r\n                      title={l.estPayee?\"Non pay\u00e9\":\"Marquer pay\u00e9\"}\r\n                      style={{background:l.estPayee?\"#dbeafe\":\"#f1f5f9\",\r\n                        border:`1.5px solid ${l.estPayee?\"#93c5fd\":\"#cbd5e1\"}`,\r\n                        borderRadius:8,padding:\"7px 11px\",cursor:\"pointer\",fontSize:15,minWidth:38,minHeight:38}}>\ud83d\udcb6</button>\r\n                    {/* Bouton r\u00e9initialiser \u2014 visible seulement si une correction manuelle a \u00e9t\u00e9 pos\u00e9e sur cette f\u00eate */}\r\n                    {(l.override?.priseLe!==undefined||l.override?.estPayee!==undefined)&&<button\r\n                      onClick={()=>resetManuel(l.code)}\r\n                      title=\"Annuler la correction manuelle et revenir au calcul automatique\"\r\n                      style={{background:\"#fff7ed\",border:\"1.5px solid #fdba74\",borderRadius:8,\r\n                        padding:\"7px 11px\",cursor:\"pointer\",fontSize:15,minWidth:38,minHeight:38,\r\n                        color:\"#c2410c\"}}>\u21ba</button>}\r\n                    {/* Bouton motif r\u00e9glementaire */}", 'reset_button_jsx');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);
console.log('Pense a: npm run build puis verifier le bouton avant de deployer.');