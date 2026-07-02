// ─── AdminPanel.jsx ───────────────────────────────────────────────────────────
// Panneau d'administration F2P.PMP
// Fonctions : liste agents, créer, supprimer, réinitialiser PIN
// À placer dans : src/components/AdminPanel.jsx
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import api from "../api/client";

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const GRADES = ["CO4","CO5","CP4NIV1","CP4NIV2","CP5NIV1","CP5NIV2","CP5NIV3","CP6NIV1","CP6NIV2","CP7NIV1","CO6"];
const FAMILLES = ["PRCI","PAR"];

// ─── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────────

export default function AdminPanel({ currentUser, onAgentsChanged }) {
  const [agents, setAgents]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [familleFilter, setFamilleFilter] = useState("TOUS");
  const [modal, setModal]             = useState(null); // "create" | { type:"delete"|"reset", agent }
  const [msg, setMsg]                 = useState(null); // { type:"ok"|"err", text }

  // ─── Chargement ─────────────────────────────────────────────────────────────
  useEffect(() => { charger(); }, []);

  async function charger() {
    setLoading(true);
    try {
      const data = await api.agents.getAll();
      setAgents(data || []);
    } catch { afficherMsg("err", "Impossible de charger les agents"); }
    finally { setLoading(false); }
  }

  function afficherMsg(type, text) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  }

  // ─── Filtrage ────────────────────────────────────────────────────────────────
  const agentsFiltres = agents.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.nom?.toLowerCase().includes(q) ||
      a.prenom?.toLowerCase().includes(q) ||
      a.cp?.toLowerCase().includes(q);
    const matchFamille = familleFilter === "TOUS" || a.famille === familleFilter;
    return matchSearch && matchFamille;
  });

  // ─── Actions ─────────────────────────────────────────────────────────────────
  async function handleCreate(data) {
    try {
      await api.agents.create(data);
      afficherMsg("ok", `Agent ${data.prenom} ${data.nom} créé`);
      setModal(null);
      charger();
      onAgentsChanged?.();
    } catch (e) {
      afficherMsg("err", e.message || "Erreur création");
    }
  }

  async function handleDelete(agent) {
    try {
      await api.agents.delete(agent.cp);
      afficherMsg("ok", `${agent.prenom} ${agent.nom} supprimé`);
      setModal(null);
      charger();
      onAgentsChanged?.();
    } catch (e) {
      afficherMsg("err", e.message || "Erreur suppression");
    }
  }

  async function handleUpdate(agent, data) {
    try {
      await api.agents.update(agent.cp, data);
      afficherMsg("ok", `${data.prenom} ${data.nom} modifie`);
      setModal(null);
      charger();
      onAgentsChanged?.();
    } catch (e) {
      afficherMsg("err", e.message || "Erreur modification");
    }
  }
  async function handleToggleAdmin(agent) {
    try {
      await api.agents.update(agent.cp, { is_admin: !agent.is_admin });
      afficherMsg("ok", `${agent.prenom} ${agent.nom} ${agent.is_admin ? "n'est plus" : "est maintenant"} admin`);
      charger();
      onAgentsChanged?.();
    } catch (e) {
      afficherMsg("err", e.message || "Erreur modification droits admin");
    }
  }
  async function handleResetPin(agent, newPin) {
    try {
      await api.agents.resetPin(agent.cp, newPin);
      afficherMsg("ok", `PIN de ${agent.prenom} ${agent.nom} réinitialisé`);
      setModal(null);
    } catch (e) {
      afficherMsg("err", e.message || "Erreur réinitialisation");
    }
  }

  // ─── RENDU ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "16px", maxWidth: 900, margin: "0 auto" }}>

      {/* Titre */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#1e293b" }}>👑 Panneau Admin</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
          Gérer les agents, les accès et les PIN
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div style={{
          background: msg.type === "ok" ? "#f0fdf4" : "#fef2f2",
          color: msg.type === "ok" ? "#15803d" : "#dc2626",
          border: `1px solid ${msg.type === "ok" ? "#86efac" : "#fca5a5"}`,
          borderRadius: 10, padding: "10px 16px", marginBottom: 16,
          fontSize: 13, fontWeight: 600
        }}>
          {msg.type === "ok" ? "✅" : "❌"} {msg.text}
        </div>
      )}

      {/* Barre d'outils */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Rechercher un agent..."
          style={{
            flex: 1, minWidth: 200, padding: "8px 12px",
            border: "1.5px solid #e2e8f0", borderRadius: 8,
            fontSize: 13, outline: "none"
          }}
        />
        {FAMILLES.map(f => (
          <button key={f} onClick={() => setFamilleFilter(familleFilter === f ? "TOUS" : f)}
            style={{
              padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 700,
              background: familleFilter === f ? (f === "PRCI" ? "#1d4ed8" : "#065f46") : "#f1f5f9",
              color: familleFilter === f ? "#fff" : "#64748b"
            }}>
            {f} ({agents.filter(a => a.famille === f).length})
          </button>
        ))}
        <div style={{ marginLeft: "auto", color: "#64748b", fontSize: 12 }}>
          {agentsFiltres.length} agent{agentsFiltres.length > 1 ? "s" : ""}
        </div>
        <button onClick={() => setModal("create")}
          style={{
            background: "#1e293b", color: "#fff", border: "none",
            borderRadius: 8, padding: "8px 16px", cursor: "pointer",
            fontSize: 13, fontWeight: 700
          }}>
          ➕ Nouvel agent
        </button>
      </div>

      {/* Tableau */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>Chargement...</div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.08)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#fff" }}>
                {["CP", "Nom", "Prénom", "Grade", "Famille", "PIN", "Actions"].map(h => (
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
                      {a.has_pin ? "✅ Défini" : "⚠️ Non défini"}
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
                          border: `1px solid ${a.is_admin ? "#c4b5fd" : "#e2e8f0"}`,
                          borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                          fontSize: 11, fontWeight: 700
                        }}>
                        {a.is_admin ? "Admin" : "Rendre admin"}
                      </button>
                      <button
                        onClick={() => setModal({ type: "reset", agent: a })}
                        title="Réinitialiser le PIN"
                        style={{
                          background: "#f5f3ff", color: "#7c3aed", border: "none",
                          borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                          fontSize: 11, fontWeight: 700
                        }}>
                        🔑 PIN
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
                          🗑
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {agentsFiltres.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 30, color: "#94a3b8", fontSize: 13 }}>
                    Aucun agent trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {modal === "create" && (
        <ModalCreer onConfirm={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.type === "edit" && (
        <ModalModifier agent={modal.agent} onConfirm={(data) => handleUpdate(modal.agent, data)} onClose={() => setModal(null)} />
      )}
      {modal?.type === "delete" && (
        <ModalSupprimer agent={modal.agent} onConfirm={() => handleDelete(modal.agent)} onClose={() => setModal(null)} />
      )}
      {modal?.type === "reset" && (
        <ModalResetPin agent={modal.agent} onConfirm={(pin) => handleResetPin(modal.agent, pin)} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

// ─── MODAL CRÉER ─────────────────────────────────────────────────────────────

function ModalCreer({ onConfirm, onClose }) {
  const [form, setForm] = useState({ cp: "", nom: "", prenom: "", grade: "CO5", famille: "PRCI" });
  const [err, setErr] = useState("");

  function submit() {
    if (!form.cp.trim()) return setErr("Le CP est obligatoire");
    if (!form.nom.trim()) return setErr("Le nom est obligatoire");
    if (!form.prenom.trim()) return setErr("Le prénom est obligatoire");
    setErr("");
    onConfirm({ ...form, cp: form.cp.trim().toUpperCase(), nom: form.nom.trim().toUpperCase(), prenom: form.prenom.trim() });
  }

  return (
    <Modal title="➕ Nouvel agent" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[
          { label: "CP SNCF *", key: "cp", placeholder: "ex: 7610086H" },
          { label: "Nom *", key: "nom", placeholder: "ex: DUPONT" },
          { label: "Prénom *", key: "prenom", placeholder: "ex: Jean" },
        ].map(({ label, key, placeholder }) => (
          <div key={key}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{label}</div>
            <input
              value={form[key]}
              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
              placeholder={placeholder}
              style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}
            />
          </div>
        ))}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Grade</div>
          <select value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))}
            style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}>
            {GRADES.map(g => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Famille</div>
          <div style={{ display: "flex", gap: 8 }}>
            {FAMILLES.map(f => (
              <button key={f} onClick={() => setForm(p => ({ ...p, famille: f }))}
                style={{
                  flex: 1, padding: "8px", border: "none", borderRadius: 8, cursor: "pointer",
                  fontWeight: 700, fontSize: 13,
                  background: form.famille === f ? (f === "PRCI" ? "#1d4ed8" : "#065f46") : "#f1f5f9",
                  color: form.famille === f ? "#fff" : "#64748b"
                }}>{f}</button>
            ))}
          </div>
        </div>
        {err && <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>⚠️ {err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Annuler</button>
          <button onClick={submit} style={{ flex: 1, padding: "10px", background: "#1e293b", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Créer</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── MODAL SUPPRIMER ─────────────────────────────────────────────────────────

function ModalModifier({ agent, onConfirm, onClose }) {
  const [form, setForm] = useState({ nom: agent.nom || "", prenom: agent.prenom || "", grade: agent.grade || "CO5", famille: agent.famille || "PRCI" });
  const [nouveauCp, setNouveauCp] = useState(agent.cp || "");
  const [err, setErr] = useState("");

  function submit() {
    if (!form.nom.trim()) return setErr("Le nom est obligatoire");
    if (!form.prenom.trim()) return setErr("Le prenom est obligatoire");
    if (!nouveauCp.trim()) return setErr("Le CP est obligatoire");
    const cpChange = nouveauCp.trim().toUpperCase() !== agent.cp;
    if (cpChange && !window.confirm(`Changer le CP de ${agent.cp} vers ${nouveauCp.trim().toUpperCase()} ? Cette action met a jour toutes les donnees liees a cet agent.`)) return;
    setErr("");
    onConfirm({ nom: form.nom.trim().toUpperCase(), prenom: form.prenom.trim(), grade: form.grade, famille: form.famille, ...(cpChange ? { nouveau_cp: nouveauCp.trim().toUpperCase() } : {}) });
  }

  return (
    <Modal title={`Modifier ${agent.prenom} ${agent.nom}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>CP SNCF</div>
          <input value={nouveauCp} onChange={e => setNouveauCp(e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}/>
        </div>
        {[
          { label: "Nom *", key: "nom", placeholder: "ex: DUPONT" },
          { label: "Prenom *", key: "prenom", placeholder: "ex: Jean" },
        ].map(({ label, key, placeholder }) => (
          <div key={key}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{label}</div>
            <input
              value={form[key]}
              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
              placeholder={placeholder}
              style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}
            />
          </div>
        ))}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Grade</div>
          <select value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))}
            style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}>
            {GRADES.map(g => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Famille</div>
          <div style={{ display: "flex", gap: 8 }}>
            {FAMILLES.map(f => (
              <button key={f} onClick={() => setForm(p => ({ ...p, famille: f }))}
                style={{
                  flex: 1, padding: "8px", border: "none", borderRadius: 8, cursor: "pointer",
                  fontWeight: 700, fontSize: 13,
                  background: form.famille === f ? (f === "PRCI" ? "#1d4ed8" : "#065f46") : "#f1f5f9",
                  color: form.famille === f ? "#fff" : "#64748b"
                }}>{f}</button>
            ))}
          </div>
        </div>
        {err && <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>! {err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Annuler</button>
          <button onClick={submit} style={{ flex: 1, padding: "10px", background: "#1e293b", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}

function ModalSupprimer({ agent, onConfirm, onClose }) {
  return (
    <Modal title="🗑 Supprimer un agent" onClose={onClose}>
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", marginBottom: 8 }}>
          Supprimer {agent.prenom} {agent.nom} ?
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 20 }}>
          CP : {agent.cp} · Cette action est irréversible.<br/>
          Tout son planning sera également supprimé.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Annuler</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "10px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── MODAL RESET PIN ─────────────────────────────────────────────────────────

function ModalResetPin({ agent, onConfirm, onClose }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  function submit() {
    if (!/^\d{4}$/.test(pin)) return setErr("Le PIN doit être exactement 4 chiffres");
    setErr("");
    onConfirm(pin);
  }

  return (
    <Modal title="🔑 Réinitialiser le PIN" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          Nouveau PIN pour <strong>{agent.prenom} {agent.nom}</strong> ({agent.cp})
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Nouveau PIN (4 chiffres)</div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            style={{
              width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0",
              borderRadius: 8, fontSize: 20, textAlign: "center",
              letterSpacing: 8, outline: "none", fontWeight: 700
            }}
          />
        </div>
        {err && <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>⚠️ {err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Annuler</button>
          <button onClick={submit} style={{ flex: 1, padding: "10px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Réinitialiser</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── MODAL BASE ───────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.6)",
      zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, backdropFilter: "blur(4px)"
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420,
        boxShadow: "0 24px 60px rgba(0,0,0,.25)", overflow: "hidden"
      }}>
        <div style={{
          background: "#1e293b", padding: "16px 20px",
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <div style={{ padding: "20px" }}>{children}</div>
      </div>
    </div>
  );
}
