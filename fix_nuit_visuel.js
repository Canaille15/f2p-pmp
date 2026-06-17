const fs = require('fs');
const f = 'src/components/DayEditPopup.jsx';
let c = fs.readFileSync(f, 'utf8');

// Le bouton N doit être coloré selon typeN, pas type1
const old = `              {CODES_TRAVAIL.map(t => (
                <button key={t.code} onClick={() => toggleType1(t.code)} style={{
                  padding:"9px 5px", borderRadius:10, border:"none", cursor:"pointer",
                  fontSize:12, fontWeight:800,
                  background: type1 === t.code ? t.color : "#f1f5f9",
                  color: type1 === t.code ? "#fff" : "#475569",
                  display:"flex", flexDirection:"column", alignItems:"center", gap:2,
                  transition:"all .1s",
                }}>
                  <span>{t.label}</span>
                  <span style={{fontSize:8,opacity:.7}}>{t.heures.split("–")[0]}</span>
                </button>
              ))}`;

const newCode = `              {CODES_TRAVAIL.map(t => {
                const isActive = t.code === "N" ? !!typeN : type1 === t.code;
                return <button key={t.code} onClick={() => toggleType1(t.code)} style={{
                  padding:"9px 5px", borderRadius:10, border:"none", cursor:"pointer",
                  fontSize:12, fontWeight:800,
                  background: isActive ? t.color : "#f1f5f9",
                  color: isActive ? "#fff" : "#475569",
                  display:"flex", flexDirection:"column", alignItems:"center", gap:2,
                  transition:"all .1s",
                  outline: t.code === "N" && typeN ? "2px solid #3b82f6" : "none",
                }}>
                  <span>{t.label}</span>
                  <span style={{fontSize:8,opacity:.7}}>{t.heures.split("–")[0]}</span>
                </button>;
              })}`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - bouton N colore selon typeN');
} else {
    console.log('ERREUR');
}
