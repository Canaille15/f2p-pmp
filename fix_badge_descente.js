const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `              {/* Case entièrement blanche = descente de nuit (rien à afficher) */}
              {isDescente&&null}`;

const newCode = `              {/* Descente de nuit = badge 🌙 centré */}
              {isDescente&&<div style={{
                background:"#f0f9ff", color:"#0369a1",
                borderRadius:5, padding:"2px 6px",
                fontSize:11, fontWeight:700,
                display:"flex", alignItems:"center", gap:4,
                marginTop:"auto",
              }}>
                🌙
              </div>}`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - badge descente nuit');
} else {
    console.log('ERREUR');
}
