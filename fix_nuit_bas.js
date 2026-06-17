const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

// Ajouter justifyContent selon si nuit seule
const old = `            return <div key={dk}
              onClick={()=>{ setDayPopup({dk, entry:en||null}); }}
              style={{
                background:"#fff",
                border:isToday?"2px solid #6366f1":"1px solid #e8edf2",
                borderRadius:10, minHeight:64, cursor:"pointer",
                position:"relative",
                boxShadow:isToday?"0 0 0 3px #eef2ff":"0 1px 3px rgba(0,0,0,.04)",
                padding:"4px 5px 5px",
                display:"flex", flexDirection:"column", gap:2,
              }}>`;

const newCode = `            const isNuitSeuleCell = code === "N" && !en?.equipe2 && !en?.finNuit;
            return <div key={dk}
              onClick={()=>{ setDayPopup({dk, entry:en||null}); }}
              style={{
                background:"#fff",
                border:isToday?"2px solid #6366f1":"1px solid #e8edf2",
                borderRadius:10, minHeight:64, cursor:"pointer",
                position:"relative",
                boxShadow:isToday?"0 0 0 3px #eef2ff":"0 1px 3px rgba(0,0,0,.04)",
                padding:"4px 5px 5px",
                display:"flex", flexDirection:"column", gap:2,
                justifyContent: isNuitSeuleCell ? "flex-end" : "flex-start",
              }}>`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK');
} else {
    console.log('ERREUR');
}
