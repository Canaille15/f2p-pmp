const fs = require('fs');

// 1. Corriger App.jsx - affichage cases
let c = fs.readFileSync('src/App.jsx', 'utf8');

// Supprimer le doublon jsCode2
const old1 = `                {en?.jsCode2&&<span style={{fontSize:8,opacity:.85,marginLeft:2}}>{en.jsCode2}</span>}
                {en?.jsCode2&&<span style={{fontSize:8,opacity:.85}}>{en.jsCode2}</span>}
                <span>↓</span>`;
const new1 = `                {en?.jsCode2&&<span style={{fontSize:8,opacity:.85,marginLeft:2}}>{en.jsCode2}</span>}`;

if (c.includes(old1)) {
    c = c.replace(old1, new1);
    console.log('OK - doublon jsCode2 supprime');
} else {
    console.log('AVERT - doublon non trouve');
}

// Simplifier fin de nuit - meme style que nuit normale
const old2 = `              {/* Fin de nuit (haut de case) */}
              {hasFinNuit&&<div style={{
                background:couleurNuit, color:tcNuit,
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", alignItems:"center", gap:3,
              }}>
                <span>↓</span><span>{(EQ_COLORS["N"]?.label||"Nuit").slice(0,4)}</span>
              </div>}`;

const new2 = `              {/* Fin de nuit (haut de case) - meme style que nuit */}
              {hasFinNuit&&<div style={{
                background:couleurNuit, color:tcNuit,
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>{(EQ_COLORS["N"]?.label||"Nuit").slice(0,4)}</span>
                {en?.jsCode&&en.jsCode!==code&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{en.jsCode}</span>}
              </div>}`;

if (c.includes(old2)) {
    c = c.replace(old2, new2);
    console.log('OK - fin nuit style simplifie');
} else {
    console.log('AVERT - fin nuit non trouvee');
}

// Simplifier debut de nuit - meme style
const old3 = `              {/* Début de nuit (bas de case) */}
              {hasDebutNuit&&<div style={{
                background:couleurNuit, color:tcNuit,
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", alignItems:"center", gap:3,
              }}>
                <span>{(EQ_COLORS["N"]?.label||"Nuit").slice(0,4)}</span>
                {en?.jsCode2&&<span style={{fontSize:8,opacity:.85,marginLeft:2}}>{en.jsCode2}</span>}`;

const new3 = `              {/* Début de nuit (bas de case) - meme style que nuit */}
              {hasDebutNuit&&<div style={{
                background:couleurNuit, color:tcNuit,
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>{(EQ_COLORS["N"]?.label||"Nuit").slice(0,4)}</span>
                {en?.jsCode2&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{en.jsCode2}</span>}`;

if (c.includes(old3)) {
    c = c.replace(old3, new3);
    console.log('OK - debut nuit style simplifie');
} else {
    console.log('AVERT - debut nuit non trouve');
}

fs.writeFileSync('src/App.jsx', c, 'utf8');

// 2. Corriger DayEditPopup - si finNuit detecte, pas de section "prise de nuit"
let d = fs.readFileSync('src/components/DayEditPopup.jsx', 'utf8');

const oldFinNuit = `  const [finNuit, setFinNuit]   = useState(!!entry?.finNuit);`;
const newFinNuit = `  const [finNuit, setFinNuit]   = useState(!!entry?.finNuit);
  const isFinNuitOnly = !!entry?.finNuit && !entry?.equipe; // case fin de nuit sans periode journee`;

if (d.includes(oldFinNuit)) {
    d = d.replace(oldFinNuit, newFinNuit);
    console.log('OK - isFinNuitOnly detecte');
} else {
    console.log('AVERT - finNuit state non trouve');
}

fs.writeFileSync('src/components/DayEditPopup.jsx', d, 'utf8');
console.log('Termine');
