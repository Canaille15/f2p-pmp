// patch_admin_mobile.js
const fs = require('fs');
const file = 'src/components/AdminPanel.jsx';
let c = fs.readFileSync(file, 'utf8');

const START = '      {/* Liste agents — cartes responsive */}';
const END_MARKER = "      )}";

// Trouver le bon bloc (après le START)
const si = c.indexOf(START);
if (si === -1) {
  // Essai ancien marqueur
  const si2 = c.indexOf('      {/* Tableau */}');
  if (si2 === -1) { console.error('Ancre debut introuvable'); process.exit(1); }
}

// Chercher la fin du bloc loading/cards
const searchFrom = c.indexOf(START) !== -1 ? c.indexOf(START) : c.indexOf('      {/* Tableau */}');
// Trouver "      )}" après le bloc
let depth = 0;
let endPos = -1;
for (let i = searchFrom; i < c.length - 3; i++) {
  if (c[i] === '{') depth++;
  if (c[i] === '}') {
    depth--;
    if (depth === 0) {
      // Chercher le ")}" de fermeture du ternaire principal
      const chunk = c.slice(i, i + 10);
      if (chunk.startsWith('}\n      )}') || chunk.startsWith('}\r\n      )}')) {
        endPos = i + chunk.indexOf(')}') + 2;
        break;
      }
    }
  }
}

if (endPos === -1) {
  // fallback : chercher "        </div>\n      )}" ou variante
  const fallback = c.indexOf("        </div>\n      )}", searchFrom);
  const fallback2 = c.indexOf("        </div>\r\n      )}", searchFrom);
  if (fallback !== -1) endPos = fallback + "        </div>\n      )}".length;
  else if (fallback2 !== -1) endPos = fallback2 + "        </div>\r\n      )}".length;
  else { console.error('Ancre fin introuvable'); process.exit(1); }
}

const newBlock = `      {/* Liste agents \u2014 cartes responsive */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#64748b", padding: 40, fontSize: 15 }}>Chargement...</div>
      ) : agentsFiltres.length === 0 ? (
        <div style={{ textAlign: "center", color: "#64748b", padding: 30, fontSize: 14 }}>Aucun agent trouv\u00e9</div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
          gap: 10,
          width: "100%",
        }}>
          {agentsFiltres.map((a) => (
            <div key={a.cp} style={{
              background: "#fff", borderRadius: 14,
              border: "1.5px solid #cbd5e1",
              padding: "14px 16px",
              boxShadow: "0 2px 6px rgba(0,0,0,.08)",
              boxSizing: "border-box",
              width: "100%",
            }}>
              {/* Identit\u00e9 */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
                  background: a.famille === "PRCI" ? "#1d4ed8" : "#065f46",
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 800,
                }}>
                  {(a.prenom?.[0] || "") + (a.nom?.[0] || "")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{a.prenom} {a.nom}</span>
                    {a.is_admin && (
                      <span style={{ fontSize: 11, background: "#ede9fe", color: "#6d28d9", borderRadius: 6, padding: "2px 8px", fontWeight: 700, flexShrink: 0 }}>
                        \uD83D\uDC51 Admin
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#334155", background: "#f1f5f9", borderRadius: 5, padding: "1px 7px" }}>{a.cp}</span>
                    <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>{a.grade}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "2px 9px",
                      background: a.famille === "PRCI" ? "#dbeafe" : "#d1fae5",
                      color: a.famille === "PRCI" ? "#1e40af" : "#065f46",
                    }}>{a.famille}</span>
                  </div>
                  <div style={{ marginTop: 5 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "2px 9px",
                      color: a.has_pin ? "#15803d" : "#b91c1c",
                      background: a.has_pin ? "#dcfce7" : "#fee2e2",
                    }}>
                      {a.has_pin ? "\u2705 PIN d\u00e9fini" : "\u26a0\uFE0F Sans PIN"}
                    </span>
                  </div>
                </div>
              </div>
              {/* Actions */}
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
                <button onClick={() => setModal({ type: "edit", agent: a })}
                  style={{ background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                  \u270F\uFE0F Modifier
                </button>
                <button onClick={() => handleToggleAdmin(a)}
                  style={{
                    background: a.is_admin ? "#ede9fe" : "#f8fafc",
                    color: a.is_admin ? "#6d28d9" : "#475569",
                    border: \`1px solid \${a.is_admin ? "#c4b5fd" : "#e2e8f0"}\`,
                    borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700,
                  }}>
                  {a.is_admin ? "\uD83D\uDC51 Retirer admin" : "Rendre admin"}
                </button>
                <button onClick={() => setModal({ type: "reset", agent: a })}
                  style={{ background: "#f5f3ff", color: "#6d28d9", border: "1px solid #ddd6fe", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                  \uD83D\uDD11 PIN
                </button>
                {a.cp !== currentUser?.agent?.cp && (
                  <button onClick={() => setModal({ type: "delete", agent: a })}
                    style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700, marginLeft: "auto" }}>
                    \uD83D\uDDD1 Supprimer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}`;

c = c.slice(0, searchFrom) + newBlock + c.slice(endPos);
if (!c.includes('auto-fill')) { console.error('Insertion echouee'); process.exit(1); }
fs.writeFileSync(file, c);
console.log('OK \u2014 AdminPanel cartes responsive calees sur la largeur ecran');
