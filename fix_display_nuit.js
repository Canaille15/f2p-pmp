const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

// Corriger : si finNuit ET equipe=N, ne pas afficher la periode principale en double
const old = `              {/* Période principale */}
              {code&&showData&&<div style={{
                background:getColor(code), color:getTc(code),
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>{CODES_FETES[code]?("🩷 "+code):(EQ_COLORS[code]?.label||code)?.slice(0,5)}</span>
                {posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}
              </div>}`;

const newCode = `              {/* Période principale - ne pas afficher si c'est juste une fin de nuit */}
              {code&&showData&&!(hasFinNuit&&code==="N"&&!en?.equipe2)&&<div style={{
                background:getColor(code), color:getTc(code),
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>{CODES_FETES[code]?("🩷 "+code):(EQ_COLORS[code]?.label||code)?.slice(0,5)}</span>
                {posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}
              </div>}`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - double badge nuit corrige');
} else {
    console.log('ERREUR - texte non trouve');
}
