const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `                <span>{(EQ_COLORS["N"]?.label||"Nuit").slice(0,4)}</span>\n`;
const newCode = `                <span>{(EQ_COLORS["N"]?.label||"Nuit").slice(0,4)}</span>\n                {en?.jsCode2&&<span style={{fontSize:8,opacity:.85,marginLeft:2}}>{en.jsCode2}</span>}\n`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK');
} else {
    console.log('ERREUR');
}
