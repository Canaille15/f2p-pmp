// patch_admin_v2.js — resetPin backend + AdminPanel mobile
const fs = require('fs');
const path = require('path');

function mustReplaceOnce(file, from, to, label) {
  let c = fs.readFileSync(file, 'utf8');
  if (!c.includes(from)) { console.error('ANCRE INTROUVABLE : ' + label); process.exit(1); }
  if ((c.split(from).length - 1) > 1) { console.error('ANCRE AMBIGUE : ' + label); process.exit(1); }
  fs.writeFileSync(file, c.replace(from, to));
  console.log('OK : ' + label);
}

// ── 1. profilController.js : ajouter resetPin ─────────────────────────────
const ctrl = 'C:\\Users\\olive\\Desktop\\f2p-pmp\\api\\api\\src\\controllers\\profilController.js';
const ctrlFrom = "module.exports = { getProfil, updateProfil, setRoulement, getRoulementActif, setHabilitations, addFamille };";
const ctrlTo = `// PUT /api/profil/:cp/pin — réinitialiser le PIN (admin uniquement)
async function resetPin(req, res) {
  const { cp } = req.params;
  if (!req.agent.is_admin)
    return res.status(403).json({ error: 'R\u00e9serv\u00e9 aux administrateurs' });
  const { pin } = req.body;
  if (!pin || !/^\\d{4}$/.test(pin))
    return res.status(400).json({ error: 'PIN invalide (4 chiffres requis)' });
  try {
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(pin, 12);
    const [result] = await pool.query('UPDATE auth SET pin_hash=? WHERE cp_agent=?', [hash, cp]);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Agent introuvable dans auth' });
    // Invalider toutes ses sessions
    await pool.query('DELETE FROM session WHERE cp_agent=?', [cp]);
    res.json({ message: 'PIN r\u00e9initialis\u00e9' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = { getProfil, updateProfil, setRoulement, getRoulementActif, setHabilitations, addFamille, resetPin };`;
mustReplaceOnce(ctrl, ctrlFrom, ctrlTo, 'profilController resetPin');

// ── 2. profil.js routes : ajouter la route PUT /:cp/pin ───────────────────
const routes = 'C:\\Users\\olive\\Desktop\\f2p-pmp\\api\\api\\src\\routes\\profil.js';
const routesFrom = "router.post('/:cp/famille',        authMiddleware, c.addFamille);";
const routesTo = `router.post('/:cp/famille',        authMiddleware, c.addFamille);
router.put('/:cp/pin',             authMiddleware, c.resetPin);`;
mustReplaceOnce(routes, routesFrom, routesTo, 'profil.js route resetPin');

// ── 3. AdminPanel.jsx : vue mobile responsive ─────────────────────────────
const panel = 'C:\\Users\\olive\\Desktop\\f2p-pmp\\src\\components\\AdminPanel.jsx';
const panelFrom = `      {/* Tableau */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>Chargement...</div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.08)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#fff" }}>
                {["CP", "Nom", "Pr\u00e9nom", "Grade", "Famille", "PIN", "Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agentsFiltres.map((a, i) => (
                <tr key={a.cp} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#475569" }}>{a.cp}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 600, fontSize: 13 }}>{a.nom}</td>
                  <td style={{ padding: "8px 12px", fontSize: 13 }}>{a.prenom}</td>
                  <td style={{ padding: "8px 12px", fontSize: 11, color: "#64748b" }}>{a.grade}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 10,
                      fontSize: 11, fontWeight: 700,
                      background: a.famille === "PRCI" ? "#dbeafe" : "#d1fae5",
                      color: a.famille === "PRCI" ? "#1d4ed8" : "#065f46"
                    }}>{a.famille}</span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: a.has_pin ? "#15803d" : "#dc2626"
                    }}>
                      {a.has_pin ? "\u2705 D\u00e9fini" : "\u26a0\ufe0f Non d\u00e9fini"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => setModal({ type: "edit", agent: a })}
                        title="Modifier l'agent"
                        style={{
                          background: "#eff6ff", color: "#1d4ed8", border: "none",
                          borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                          fontSize: 11, fontWeight: 700
                        }}>
                        Modifier
                      </button>
                      <button
                        onClick={() => handleToggleAdmin(a)}
                        title={a.is_admin ? "Retirer les droits admin" : "Donner les droits admin"}
                        style={{
                          background: a.is_admin ? "#f5f3ff" : "#f1f5f9",
                          color: a.is_admin ? "#7c3aed" : "#94a3b8",
                          border: \`1px solid \${a.is_admin ? "#c4b5fd" : "#e2e8f0"}\`,
                          borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                          fontSize: 11, fontWeight: 700
                        }}>
                        {a.is_admin ? "Admin" : "Rendre admin"}
                      </button>
                      <button
                        onClick={() => setModal({ type: "reset", agent: a })}
                        title="R\u00e9initialiser le PIN"
                        style={{
                          background: "#f5f3ff", color: "#7c3aed", border: "none",
                          borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                          fontSize: 11, fontWeight: 700
                        }}>
                        \uD83D\uDD11 PIN
                      </button>
                      {a.cp !== currentUser?.agent?.cp && (
                        <button
                          onClick={() => setModal({ type: "delete", agent: a })}
                          title="Supprimer l'agent"
                          style={{
                            background: "#fef2f2", color: "#dc2626", border: "none",
                            borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                            fontSize: 11, fontWeight: 700
                          }}>
                          \uD83D\uDDD1
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {agentsFiltres.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 30, color: "#94a3b8", fontSize: 13 }}>
                    Aucun agent trouv\u00e9
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}`;

const panelTo = `      {/* Liste agents — cartes responsive */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>Chargement...</div>
      ) : agentsFiltres.length === 0 ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: 30, fontSize: 13 }}>Aucun agent trouv\u00e9</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {agentsFiltres.map((a) => (
            <div key={a.cp} style={{
              background: "#fff", borderRadius: 12, border: "1.5px solid #e2e8f0",
              padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,.06)"
            }}>
              {/* Ligne 1 : identit\u00e9 + famille + PIN */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                  background: a.famille === "PRCI" ? "#1d4ed8" : "#065f46",
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 800
                }}>
                  {(a.prenom?.[0] || "") + (a.nom?.[0] || "")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.prenom} {a.nom}
                    {a.is_admin && <span style={{ marginLeft: 6, fontSize: 10, background: "#f5f3ff", color: "#7c3aed", borderRadius: 6, padding: "1px 6px", fontWeight: 700 }}>\uD83D\uDC51 Admin</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#475569" }}>{a.cp}</span>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>{a.grade}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, borderRadius: 8, padding: "1px 7px",
                      background: a.famille === "PRCI" ? "#dbeafe" : "#d1fae5",
                      color: a.famille === "PRCI" ? "#1d4ed8" : "#065f46"
                    }}>{a.famille}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: a.has_pin ? "#15803d" : "#dc2626" }}>
                      {a.has_pin ? "\u2705 PIN" : "\u26a0\ufe0f Pas de PIN"}
                    </span>
                  </div>
                </div>
              </div>
              {/* Ligne 2 : actions */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => setModal({ type: "edit", agent: a })}
                  style={{ background: "#eff6ff", color: "#1d4ed8", border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                  \u270F\uFE0F Modifier
                </button>
                <button onClick={() => handleToggleAdmin(a)}
                  style={{
                    background: a.is_admin ? "#f5f3ff" : "#f1f5f9",
                    color: a.is_admin ? "#7c3aed" : "#64748b",
                    border: \`1px solid \${a.is_admin ? "#c4b5fd" : "#e2e8f0"}\`,
                    borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700
                  }}>
                  {a.is_admin ? "\uD83D\uDC51 Retirer admin" : "Rendre admin"}
                </button>
                <button onClick={() => setModal({ type: "reset", agent: a })}
                  style={{ background: "#f5f3ff", color: "#7c3aed", border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                  \uD83D\uDD11 PIN
                </button>
                {a.cp !== currentUser?.agent?.cp && (
                  <button onClick={() => setModal({ type: "delete", agent: a })}
                    style={{ background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, marginLeft: "auto" }}>
                    \uD83D\uDDD1 Supprimer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}`;

mustReplaceOnce(panel, panelFrom, panelTo, 'AdminPanel mobile cards');

console.log('\nTout OK — npm run build puis vercel --prod');
