const fs = require('fs');
const f = 'src/components/DayEditPopup.jsx';
let c = fs.readFileSync(f, 'utf8');

// Normaliser les sauts de ligne
const eol = c.includes('\r\n') ? '\r\n' : '\n';

const old = `{/* Horaires */}`;

const newCode = `{/* Poste */}
                {hasPeriode1 && ["M","AM","N","J"].includes(periode1.type) && (
                  <div>
                    <div style={{ fontSize:11, color:"#64748b", fontWeight:700, marginBottom:6, textTransform:"uppercase" }}>
                      Poste
                    </div>
                    <input
                      value={periode1.jsCode && !["M","AM","N","J"].includes(periode1.jsCode) ? periode1.jsCode : ""}
                      onChange={e => setPeriode1(p => ({ ...p, jsCode: e.target.value }))}
                      placeholder="ex: CCL, LNE, LC..."
                      style={{
                        width:"100%", padding:"8px 12px",
                        border:"1.5px solid #e2e8f0", borderRadius:8,
                        fontSize:13, outline:"none",
                      }}
                    />
                  </div>
                )}
                {/* Horaires */}`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - champ poste ajoute');
} else {
    console.log('ERREUR - texte non trouve');
}
