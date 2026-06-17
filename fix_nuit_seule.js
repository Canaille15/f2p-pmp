const fs = require('fs');

// ── 1. DayEditPopup — initialiser typeN si equipe="N" ──────────────────────
let d = fs.readFileSync('src/components/DayEditPopup.jsx', 'utf8');

const old1 = `  const [type1,  setType1]  = useState(
    (entry?.equipe && entry.equipe !== "N") ? entry.equipe :
    (entry?.finNuit && !entry?.equipe) ? null : (entry?.equipe || null)
  );
  const [poste1, setPoste1] = useState(entry?.jsCode || "");
  const [horaires1, setHoraires1] = useState(entry?.horaires || "");
  const [typeN,  setTypeN]  = useState(entry?.equipe2 === "N" ? "N" : null);
  const [posteN, setPosteN] = useState(entry?.jsCode2 || "");`;

const new1 = `  // Si equipe="N" = nuit seule (bas de case), sinon c'est la periode journee
  const isNuitSeule = entry?.equipe === "N" && !entry?.equipe2;
  const [type1,  setType1]  = useState(isNuitSeule ? null : (entry?.equipe || null));
  const [poste1, setPoste1] = useState(isNuitSeule ? "" : (entry?.jsCode || ""));
  const [horaires1, setHoraires1] = useState(isNuitSeule ? "" : (entry?.horaires || ""));
  const [typeN,  setTypeN]  = useState(
    entry?.equipe2 === "N" ? "N" :
    isNuitSeule ? "N" : null
  );
  const [posteN, setPosteN] = useState(
    isNuitSeule ? (entry?.jsCode || "") : (entry?.jsCode2 || "")
  );`;

if (d.includes(old1)) {
    d = d.replace(old1, new1);
    console.log('OK - popup init nuit seule');
} else {
    console.log('ERREUR - popup init non trouve');
}

fs.writeFileSync('src/components/DayEditPopup.jsx', d, 'utf8');

// ── 2. App.jsx — affichage case nuit seule en bas ──────────────────────────
let c = fs.readFileSync('src/App.jsx', 'utf8');

// Nuit seule = equipe="N" sans equipe2 → afficher en bas comme debut nuit
const old2 = `              {/* Période principale journée (si pas nuit suivante) */}
              {!isNuitSuivante&&!isDescente&&code&&showData&&<div style={{
                background:getColor(code), color:getTc(code),
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>{CODES_FETES[code]?("🩷 "+code):(EQ_COLORS[code]?.label||code)?.slice(0,5)}</span>
                {posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}
              </div>}

              {/* Début de nuit ce soir (bas de case) */}
              {hasDebutNuit&&!isNuitSuivante&&<div style={{
                background:couleurNuit, color:tcNuit,
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>Nuit</span>
                {posteNuitLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteNuitLabel}</span>}
              </div>}`;

const new2 = `              {/* Nuit seule = equipe=N sans equipe2 → toujours en bas */}
              {(() => {
                const isNuitSeule = code === "N" && !en?.equipe2 && !en?.finNuit;
                if (isNuitSeule) {
                  return <>
                    <div style={{flex:1}}/>
                    <div style={{
                      background:couleurNuit, color:tcNuit,
                      borderRadius:5, padding:"2px 5px",
                      fontSize:9, fontWeight:700, lineHeight:1.4,
                      display:"flex", flexDirection:"column",
                    }}>
                      <span>Nuit</span>
                      {posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}
                    </div>
                  </>;
                }
                return null;
              })()}

              {/* Période principale journée (si pas nuit seule, pas nuit suivante) */}
              {!isNuitSuivante&&!isDescente&&code&&showData&&code!=="N"&&<div style={{
                background:getColor(code), color:getTc(code),
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>{CODES_FETES[code]?("🩷 "+code):(EQ_COLORS[code]?.label||code)?.slice(0,5)}</span>
                {posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}
              </div>}

              {/* Début de nuit ce soir (bas de case) */}
              {hasDebutNuit&&!isNuitSuivante&&<div style={{
                background:couleurNuit, color:tcNuit,
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>Nuit</span>
                {posteNuitLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteNuitLabel}</span>}
              </div>}`;

if (c.includes(old2)) {
    c = c.replace(old2, new2);
    console.log('OK - nuit seule en bas de case');
} else {
    console.log('ERREUR - affichage case non trouve');
}

fs.writeFileSync('src/App.jsx', c, 'utf8');
console.log('Termine');
