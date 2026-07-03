// patch_fetes_report_n1_puis_3bugs.js
// Corrige 3 petits bugs de code pre-existants, sans rapport avec les
// fetes legales, reperes par les warnings esbuild lors du dernier build :
//  1. Popup saisie code PIN : accolade orpheline en trop apres la div des
//     4 cases (reliquat d'une ancienne condition supprimee) - 'not valid
//     inside a JSX element'.
//  2. Vue Planning (liste) : cle 'showData' dupliquee dans un objet -
//     sans consequence (meme valeur), mais nettoye.
//  3. Vue Semaine (bouton date) : cle 'fontWeight' dupliquee (600 puis
//     700) - la valeur 700 etait deja la seule appliquee, on supprime
//     le doublon 600 sans changer le rendu visuel.
// Aucun changement fonctionnel/visuel attendu, uniquement du nettoyage.
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_3bugs_nettoyage.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
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
content = mustReplaceOnce(content, "          </div>))}\r\n        </div>}\r\n        <button onClick={submit} disabled={active.some(d=>!d)} style={{width:\"100%\",background:active.every(d=>d)?fam?.color||\"#1e293b\":\"#e2e8f0\",color:active.every(d=>d)?\"#fff\":\"#94a3b8\",border:\"none\",borderRadius:12,padding:\"13px 0\",cursor:active.every(d=>d)?\"pointer\":\"not-allowed\",fontSize:14,fontWeight:700,transition:\"all .15s\"}}>\r\n", "          </div>))}\r\n        </div>\r\n        <button onClick={submit} disabled={active.some(d=>!d)} style={{width:\"100%\",background:active.every(d=>d)?fam?.color||\"#1e293b\":\"#e2e8f0\",color:active.every(d=>d)?\"#fff\":\"#94a3b8\",border:\"none\",borderRadius:12,padding:\"13px 0\",cursor:active.every(d=>d)?\"pointer\":\"not-allowed\",fontSize:14,fontWeight:700,transition:\"all .15s\"}}>\r\n", 'pin_stray_brace');
count++;
content = mustReplaceOnce(content, "      moisNom: d.toLocaleDateString(\"fr-FR\",{month:\"short\"}),\r\n      showData};\r\n", "      moisNom: d.toLocaleDateString(\"fr-FR\",{month:\"short\"})};\r\n", 'showdata_dup_key');
count++;
content = mustReplaceOnce(content, "          <span style={{fontSize:12,fontWeight:600,color:\"#475569\",fontWeight:700}}>{weekDates[0]?.slice(8)}/{weekDates[0]?.slice(5,7)}\u2013{weekDates[6]?.slice(8)}/{weekDates[6]?.slice(5,7)}</span>\r\n", "          <span style={{fontSize:12,color:\"#475569\",fontWeight:700}}>{weekDates[0]?.slice(8)}/{weekDates[0]?.slice(5,7)}\u2013{weekDates[6]?.slice(8)}/{weekDates[6]?.slice(5,7)}</span>\r\n", 'fontweight_dup_key');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);
console.log('Pense a: npm run build - les 3 warnings esbuild doivent avoir disparu.');