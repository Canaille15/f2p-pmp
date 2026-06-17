const fs = require('fs');
const f = 'src/components/DayEditPopup.jsx';
let c = fs.readFileSync(f, 'utf8');

// 1. Supprimer le bouton "+ Nuit ce soir" séparé (remplacé par N dans travail)
const old1 = `          {/* Nuit ce soir (bas de case) — seulement si pas déjà une nuit principale */}
          {!isNuitPrincipale && (
            <div>
              <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:7,textTransform:"uppercase",letterSpacing:.5}}>
                Nuit ce soir
              </div>
              <button onClick={toggleNuit} style={{
                width:"100%", padding:"10px",
                background: typeN ? "#1e293b" : "#f8fafc",
                border: typeN ? "none" : "1.5px dashed #cbd5e1",
                borderRadius:10, cursor:"pointer",
                fontSize:12, fontWeight:700,
                color: typeN ? "#fff" : "#64748b",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              }}>
                🌙 {typeN ? "Nuit ce soir ajoutée ✓ (cliquer pour retirer)" : "+ Début de nuit ce soir"}
              </button>

              {/* Poste nuit ce soir */}
              {typeN && postesN.length > 0 && (
                <div style={{marginTop:8}}>
                  <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:.5}}>
                    Poste de nuit
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {postesN.map(p => (
                      <button key={p.code} onClick={() => setPosteN(posteN===p.code?"":p.code)} style={{
                        padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                        fontSize:12, fontWeight:700,
                        background: posteN === p.code ? "#1e293b" : "#f1f5f9",
                        color: posteN === p.code ? "#fff" : "#475569",
                      }}>{p.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}`;

const new1 = `          {/* Nuit ce soir - affichée quand N sélectionné comme nuit soir */}
          {typeN && postesN.length > 0 && (
            <div>
              <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:.5}}>
                Poste de nuit
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {postesN.map(p => (
                  <button key={p.code} onClick={() => setPosteN(posteN===p.code?"":p.code)} style={{
                    padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                    fontSize:12, fontWeight:700,
                    background: posteN === p.code ? "#1e293b" : "#f1f5f9",
                    color: posteN === p.code ? "#fff" : "#475569",
                  }}>{p.label}</button>
                ))}
              </div>
            </div>
          )}`;

if (c.includes(old1)) {
    c = c.replace(old1, new1);
    console.log('OK - bouton nuit supprime');
} else {
    console.log('ERREUR - bouton nuit non trouve');
}

// 2. Modifier toggleType1 pour N — N toggle la nuit du soir sans effacer le haut
const old2 = `  const toggleType1 = (code) => {
    if (type1 === code) {
      setType1(null);
      setPoste1("");
      setHoraires1("");
    } else {
      setType1(code);
      if (["M","AM","N","J"].includes(code)) {
        setHoraires1(HORAIRES_DEFAUT[code] || "");
        setPoste1("");
      } else {
        setHoraires1("");
        setPoste1("");
      }
      setShowFetes(false);
    }
    // Si on sélectionne N comme type journée, pas de nuit séparée
    if (code === "N") setTypeN(null);
  };`;

const new2 = `  const toggleType1 = (code) => {
    // N spécial : toggle la nuit du soir (bas de case)
    if (code === "N") {
      toggleNuit();
      return;
    }
    if (type1 === code) {
      setType1(null);
      setPoste1("");
      setHoraires1("");
    } else {
      setType1(code);
      if (["M","AM","J"].includes(code)) {
        setHoraires1(HORAIRES_DEFAUT[code] || "");
        setPoste1("");
      } else {
        setHoraires1("");
        setPoste1("");
      }
      setShowFetes(false);
    }
  };`;

if (c.includes(old2)) {
    c = c.replace(old2, new2);
    console.log('OK - N toggle nuit soir');
} else {
    console.log('ERREUR - toggleType1 non trouve');
}

// 3. isNuitPrincipale n'existe plus — N est toujours nuit du soir
const old3 = "  const isTravailJ = type1 && [\"M\",\"AM\",\"J\"].includes(type1);\n  const isNuitPrincipale = type1 === \"N\";";
const new3 = "  const isTravailJ = type1 && [\"M\",\"AM\",\"J\"].includes(type1);\n  const isNuitPrincipale = false; // N est maintenant toujours nuit du soir";

if (c.includes(old3)) {
    c = c.replace(old3, new3);
    console.log('OK - isNuitPrincipale false');
} else {
    console.log('AVERT - isNuitPrincipale non trouve');
}

// 4. Corriger sauvegarder - equipe2 = typeN
const old4 = `      equipe2:   effectiveTypeN || null,
      jsCodeNuit: effectiveTypeN ? (posteN || null) : null,`;
const new4 = `      equipe2:   typeN || null,
      jsCodeNuit: typeN ? (posteN || null) : null,`;

if (c.includes(old4)) {
    c = c.replace(old4, new4);
    console.log('OK - equipe2 corrige');
} else {
    console.log('AVERT - equipe2 non trouve');
}

fs.writeFileSync(f, c, 'utf8');
console.log('Termine');
