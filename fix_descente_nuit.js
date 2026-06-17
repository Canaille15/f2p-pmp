const fs = require('fs');
const f = 'src/components/DayEditPopup.jsx';
let c = fs.readFileSync(f, 'utf8');

// 1. Ajouter état finNuit
const old1 = `  const [showFetes, setShowFetes] = useState(false);`;
const new1 = `  const [showFetes, setShowFetes] = useState(false);
  const [finNuit, setFinNuit] = useState(!!entry?.finNuit);`;

if (c.includes(old1)) {
    c = c.replace(old1, new1);
    console.log('OK - state finNuit');
}

// 2. Corriger sauvegarder pour utiliser l'état finNuit
const old2 = `      finNuit:   entry?.finNuit || false,`;
const new2 = `      finNuit:   finNuit,`;

if (c.includes(old2)) {
    c = c.replace(old2, new2);
    console.log('OK - sauvegarder finNuit');
}

// 3. Ajouter bouton toggle avant Repos/Absences
const old3 = `          {/* Repos / Absences */}
          <div>
            <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:7,textTransform:"uppercase",letterSpacing:.5}}>
              Repos / Absences
            </div>`;

const new3 = `          {/* Descente de nuit */}
          <button onClick={() => setFinNuit(v => !v)} style={{
            width:"100%", padding:"10px 14px",
            background: finNuit ? "#0f172a" : "#f8fafc",
            border: finNuit ? "none" : "1.5px dashed #cbd5e1",
            borderRadius:10, cursor:"pointer",
            fontSize:12, fontWeight:700,
            color: finNuit ? "#94a3b8" : "#64748b",
            display:"flex", alignItems:"center", gap:8,
          }}>
            🌙 {finNuit ? "Descente de nuit ✓ (cliquer pour retirer)" : "Descente de nuit"}
          </button>

          {/* Repos / Absences */}
          <div>
            <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:7,textTransform:"uppercase",letterSpacing:.5}}>
              Repos / Absences
            </div>`;

if (c.includes(old3)) {
    c = c.replace(old3, new3);
    console.log('OK - bouton descente nuit');
} else {
    console.log('ERREUR - bouton non trouve');
}

fs.writeFileSync(f, c, 'utf8');
console.log('Termine');
