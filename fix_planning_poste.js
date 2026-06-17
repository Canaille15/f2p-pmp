const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// 1. Ajouter jsCode dans les données de lignes
const old1 = `const lignes = dates.map(dk=>{\r\n    const en   = schedule[\`\${agent.id}-\${dk}\`];\r\n    const code = en?.equipe;\r\n    const eq   = code ? EQ[code] : null;\r\n    const isPrive  = en?.prive||eq?.prive||false;\r\n    const showData = isOwnProfile||!isPrive;`;

const new1 = `const lignes = dates.map(dk=>{\r\n    const en   = schedule[\`\${agent.id}-\${dk}\`];\r\n    const code = en?.equipe;\r\n    const eq   = code ? EQ[code] : null;\r\n    const isPrive  = en?.prive||eq?.prive||false;\r\n    const showData = isOwnProfile||!isPrive;\r\n    const jsCode = en?.jsCode||null;`;

if(c.includes(old1)) {
  c = c.replace(old1, new1);
  console.log('OK - jsCode ajouté dans lignes');
} else {
  console.log('ERREUR 1 - lignes non trouvé');
}

// 2. Ajouter jsCode dans le return
const old2 = `return {dk, code, eq, label, plage, couleur, tc, isWE, isToday, dow,`;
const new2 = `return {dk, code, eq, label, plage, couleur, tc, isWE, isToday, dow, jsCode,`;

if(c.includes(old2)) {
  c = c.replace(old2, new2);
  console.log('OK - jsCode ajouté dans return');
} else {
  console.log('ERREUR 2 - return non trouvé');
}

// 3. Ajouter poste sous le label dans le badge
const old3 = `{CODES_FETES[l.code]?\"\u{1F339}\":\"\"}{l.label}\r\n                        </span>`;
const new3 = `{CODES_FETES[l.code]?\"\u{1F339}\":\"\"}{l.label}{l.jsCode&&!["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","DISPO","NU","TC","TY","RN","JF"].includes(l.jsCode)?<span style={{fontSize:10,opacity:.8,marginLeft:4}}>/ {l.jsCode}</span>:null}\r\n                        </span>`;

if(c.includes(old3)) {
  c = c.replace(old3, new3);
  console.log('OK - poste ajouté dans badge');
} else {
  console.log('ERREUR 3 - badge non trouvé');
}

// 4. Ajouter badge 🌙 descente de nuit
const old4 = `{l.code&&l.showData?(`;
const new4 = `{en?.finNuit&&<div style={{fontSize:11,color:"#0369a1",background:"#f0f9ff",borderRadius:6,padding:"2px 8px",marginBottom:4,display:"inline-flex",alignItems:"center",gap:4,fontWeight:700}}>\u{1F319} Descente de nuit</div>}\r\n                    {l.code&&l.showData?(`;

if(c.includes(old4)) {
  c = c.replace(old4, new4);
  console.log('OK - badge 🌙 ajouté');
} else {
  console.log('ERREUR 4 - div badge non trouvé');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
