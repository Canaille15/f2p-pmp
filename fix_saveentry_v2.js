const fs = require('fs');
const f = 'src/api/client.js';
let c = fs.readFileSync(f, 'utf8');

const old = "code_poste:  entry.jsCode&&!\"M,AM,N,J,RP,RU,RQ,CA,CP,MA,VT,ABS,FOR,DISPO,NU,TC,TY,RN,JF\".split(',').includes(entry.jsCode) ? entry.jsCode : null,";

// Chercher la ligne code_poste dans saveEntry
const idx = c.indexOf('code_poste:  entry.jsCode');
if (idx !== -1) {
    const lineEnd = c.indexOf('\n', idx);
    const oldLine = c.slice(idx, lineEnd);
    console.log('Ligne trouvee:', oldLine);
    
    const newLine = `code_poste:  (entry.jsCode && entry.jsCode.length <= 10 && !/^(M|AM|N|J|RP|RU|RQ|CA|CP|MA|VT|ABS|FOR|DISPO|NU|TC|TY|RN|JF)$/.test(entry.jsCode) && !/^(PI|PA)/.test(entry.jsCode)) ? entry.jsCode : null,`;
    
    c = c.slice(0, idx) + newLine + c.slice(lineEnd);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - code_poste filtre correctement');
} else {
    console.log('ERREUR - ligne code_poste non trouvee');
}
