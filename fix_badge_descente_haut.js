const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `              {/* Descente de nuit = badge 🌙 centré */}
              {isDescente&&<div style={{
                background:"#f0f9ff", color:"#0369a1",
                borderRadius:5, padding:"2px 6px",
                fontSize:11, fontWeight:700,
                display:"flex", alignItems:"center", gap:4,
                marginTop:"auto",
              }}>
                🌙
              </div>}`;

const newCode = `              {/* Descente de nuit = badge 🌙 en haut de case */}
              {isDescente&&<div style={{
                background:"#f0f9ff", color:"#0369a1",
                borderRadius:5, padding:"2px 6px",
                fontSize:10, fontWeight:700,
                display:"inline-flex", alignItems:"center", gap:4,
                alignSelf:"flex-start",
              }}>
                🌙 fin nuit
              </div>}`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - badge haut');
} else {
    console.log('ERREUR');
}
