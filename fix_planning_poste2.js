const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

const old3 = `{CODES_FETES[l.code]?"\u{1F339}":"\"}{l.label}\r\n                        </span>`;

// Chercher et afficher le contexte exact
const idx = c.indexOf('CODES_FETES[l.code]');
if(idx !== -1) {
  const snippet = c.slice(idx, idx+100);
  console.log('Trouvé:', JSON.stringify(snippet));
  
  // Remplacer en utilisant les indices
  const endTag = c.indexOf('</span>', idx);
  if(endTag !== -1) {
    const before = c.slice(0, endTag);
    const after = c.slice(endTag);
    // Insérer avant </span>
    const posteCode = `{l.jsCode&&!["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","DISPO","NU","TC","TY","RN","JF"].includes(l.jsCode)?<span style={{fontSize:10,opacity:.8,marginLeft:4}}>/ {l.jsCode}</span>:null}`;
    c = before + posteCode + after;
    console.log('OK - poste inséré');
  }
} else {
  console.log('ERREUR - CODES_FETES[l.code] non trouvé');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
