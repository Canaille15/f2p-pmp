import { useState, useEffect, useCallback, useMemo } from "react";
import api from "../api/client";

// ─── Module Formation ───────────────────────────────────────────────────────
// Deux espaces bien séparés (refonte 25/08, demandé par Olivier : "j'aimerai
// mieux séparer la parti afo de l'agent formateur, de la partie formation
// personnel de l'agent qui peux aussi etre AFO par ailleurs") :
//  - FormationView (export par défaut, tous les agents) : UNIQUEMENT le côté
//    agent -- archive perso (sessions AFO où l'agent est inscrit comme
//    PARTICIPANT + formations auto-déclarées). Plus aucune trace du rôle
//    formateur ici, même pour un AFO.
//  - AfoView (export nommé, réservé aux agents is_afo) : tout le rôle
//    formateur, en 3 sous-onglets -- "Tes sessions" (celles où l'agent
//    enseigne), "Gestion" (catalogue, création/lancement de sessions),
//    "Stats". Tous les AFO ont les mêmes droits (pas de hiérarchie).
//
// 2e refonte, même jour (25/08) : d'abord un seul module avec 2 onglets
// internes ("Mes formations" / "Espace AFO"), Olivier a ensuite proposé
// mieux -- "ce serait pas mieux que le lateral soit un module AFO -
// formation. et que la tuile formation reste le module des formation perso"
// -- promu en 2 VUES SÉPARÉES du lateral (comme Admin, isAfo && au lieu d'un
// onglet caché), App.jsx s'en charge (VIEWS "formation"/"afo", isAfo &&
// renderFlat("afo")). Les deux vues restent dans le MÊME fichier (pas de
// nouveau fichier séparé) : elles partagent une grosse surface de petits
// helpers (NAVY/AMBRE, StatutBadge, RosterLignes, ChoixLibre, styles...) --
// les dupliquer dans 2 fichiers aurait fait courir un risque de drift bien
// plus grand que le risque (nul ici, même fichier) d'un import circulaire.
//
// Point de conception central (inchangé) : l'inscription à une session AFO
// écrit "FOR" dans le planning perso de l'agent au moment du lancement —
// mais l'agent reste seul maître de son planning (peut le modifier
// normalement). Si son planning diverge ensuite, la vue "Gestion" affiche
// son nom barré plutôt que de faire confiance à une donnée qui n'est plus à
// jour (voir getSessionDetail côté backend, calculé à la lecture, jamais
// stocké).
// ─────────────────────────────────────────────────────────────────────────

const AMBRE = { from: "#b45309", to: "#92400e", bgLight: "#fffbeb", borderLight: "#fde68a", accentDark: "#78350f" };
const NAVY  = { from: "#0f4c81", to: "#1e3a5f", bgLight: "#eff6ff", borderLight: "#bfdbfe", accentDark: "#1e3a5f" };

const CATEGORIES = ["PRCI", "PAR", "Divers"];
const FORMAT_OPTIONS = ["Présentiel", "Distanciel", "Autre"];
const LIEU_OPTIONS = ["PRCI", "PAR", "Autre"];

const STATUT_SESSION = {
  planifiee: { label: "🗓️ Planifiée", bg: "#f1f5f9", color: "#475569" },
  lancee:    { label: "🚀 Lancée",     bg: "#dbeafe", color: "#1e40af" },
  terminee:  { label: "✅ Terminée",   bg: "#dcfce7", color: "#15803d" },
  annulee:   { label: "❌ Annulée",    bg: "#fee2e2", color: "#b91c1c" },
};

function fmtDate(iso) {
  if (!iso) return "";
  const [a, m, j] = String(iso).slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

// 10/08 : une session "Lancée" dont la date est deja passee reste "Lancée"
// indefiniment en base (aucune transition automatique stockee) -- pour ne
// jamais desynchroniser un champ derive, le statut affiche est recalcule a
// la lecture (meme philosophie que le reste du projet : toujours calcule,
// jamais stocke) plutot que d'ecrire "terminee" en base a un moment precis.
function displayStatut(session) {
  if (session?.statut === "lancee" && session.date_session && session.date_session.slice(0, 10) < new Date().toISOString().slice(0, 10)) {
    return "terminee";
  }
  return session?.statut;
}

function StatutBadge({ session, style }) {
  const s = displayStatut(session);
  return (
    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "3px 9px", ...(STATUT_SESSION[s] || {}), ...style }}>
      {STATUT_SESSION[s]?.label || s}
    </span>
  );
}

// Sépare le choix "connu" (bouton) d'un texte libre pour Format/Lieu -- une
// valeur deja en base qui ne correspond a aucun bouton connu est traitee
// comme "Autre", pré-remplie avec son texte d'origine (rien n'est perdu).
function splitChoixLibre(valeur, options) {
  const v = (valeur || "").trim();
  if (!v) return { choix: "", autre: "" };
  const connu = options.find(o => o !== "Autre" && o.toLowerCase() === v.toLowerCase());
  return connu ? { choix: connu, autre: "" } : { choix: "Autre", autre: v };
}

function ChoixLibre({ options, choix, onChoix, autre, onAutre, famille }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map(o => (
          <button key={o} type="button" onClick={() => onChoix(o)}
            style={{ padding: "7px 14px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, background: choix === o ? famille.from : "#fff", color: choix === o ? "#fff" : "#64748b", boxShadow: choix === o ? "none" : "0 0 0 1.5px #e2e8f0 inset" }}>
            {o}
          </button>
        ))}
      </div>
      {choix === "Autre" && (
        <input value={autre} onChange={e => onAutre(e.target.value)} placeholder="Précise..." style={{ ...inputStyle, marginTop: 8 }} />
      )}
    </div>
  );
}

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" };
const labelStyle = { fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 };
// 10/08 (Olivier, sur mobile, signalé une 2e fois : "les nom des agents [...]
// sont peu lisible [...] augmenter la police noire peut etre") : le gris
// clair habituel (#64748b/#94a3b8) est trop peu contrasté pour lire des noms
// — quasi noir + plus grand + plus gras, réservé à ces lignes-là.
const rosterStyle = { fontSize: 13, color: "#1e293b", fontWeight: 700, marginTop: 4, lineHeight: 1.4 };
function RosterLignes({ session, agentId }) {
  const autres = agentId ? session.participants.filter(p => p.cp !== agentId) : session.participants;
  return (
    <>
      <div style={rosterStyle}>👨‍🏫 {session.formateurs.length ? session.formateurs.map(f => `${f.prenom} ${f.nom}`).join(", ") : "aucun formateur renseigné"}</div>
      <div style={rosterStyle}>
        👥 {autres.length ? autres.map(p => `${p.prenom} ${p.nom}`).join(", ") : "aucun autre participant"}
        {agentId && session.participants.some(p => p.cp === agentId) ? " (+ toi)" : ""}
      </div>
    </>
  );
}
const btnPrimary = (fam) => ({ background: fam.from, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700 });
const btnSecondary = { background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600 };

// ─── COMPOSANT RACINE ───────────────────────────────────────────────────────

export default function FormationView({ currentAgent, agentProfiles, setAgentProfiles, refreshSchedule }) {
  const agentId = currentAgent?.immatriculation || currentAgent?.cp || currentAgent?.id;

  return (
    <div style={{ padding: "12px", maxWidth: 1000, margin: "0 auto", fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#1e293b" }}>🎓 Formation</div>
        <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>Tes formations suivies</div>
      </div>
      <MesFormationsTab agentId={agentId} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} refreshSchedule={refreshSchedule} />
    </div>
  );
}

// ─── ESPACE AFO — vue séparée du lateral (25/08, voir en-tête du fichier) ───
export function AfoView({ currentAgent, agents, refreshProfil, refreshSchedule }) {
  const agentId = currentAgent?.immatriculation || currentAgent?.cp || currentAgent?.id;
  const [afoSubTab, setAfoSubTab] = useState("sessions");
  // Permet a "Tes sessions" d'ouvrir directement le detail d'une session (via
  // SessionDetailModal, cote Gestion) sans faire chercher la session dans la
  // liste globale — demande explicite d'Olivier (10/08) : trop de
  // sous-menus, trop dur de retrouver ses propres journees de formateur.
  const [pendingSessionId, setPendingSessionId] = useState(null);
  const goToSession = (id) => { setPendingSessionId(id); setAfoSubTab("gestion"); };

  const afoSubTabs = [
    { k: "sessions", label: "👨‍🏫 Tes sessions" },
    { k: "gestion", label: "📋 Gestion" },
    { k: "stats", label: "📊 Stats" },
  ];

  return (
    <div style={{ padding: "12px", maxWidth: 1000, margin: "0 auto", fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#1e293b" }}>🎓 Espace AFO</div>
        <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>Ton rôle de formateur</div>
      </div>

      <div style={{ background: NAVY.bgLight, border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 14, padding: 14 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {afoSubTabs.map(t => (
            <button key={t.k} onClick={() => setAfoSubTab(t.k)}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12.5, fontWeight: 700,
                background: afoSubTab === t.k ? NAVY.from : "#fff",
                color: afoSubTab === t.k ? "#fff" : NAVY.accentDark,
              }}>
              {t.label}
            </button>
          ))}
        </div>
        {afoSubTab === "sessions" && <MesSessionsFormateurTab agentId={agentId} onGoToSession={goToSession} />}
        {afoSubTab === "gestion" && <GestionTab agents={agents} refreshProfil={refreshProfil} refreshSchedule={refreshSchedule} pendingSessionId={pendingSessionId} onConsumePending={() => setPendingSessionId(null)} />}
        {afoSubTab === "stats" && <StatsTab />}
      </div>
    </div>
  );
}

// ─── MES FORMATIONS (tous les agents, uniquement le côté participant) ──────

function MesFormationsTab({ agentId, agentProfiles, setAgentProfiles, refreshSchedule }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showDeclare, setShowDeclare] = useState(false);

  const charger = useCallback(() => {
    setLoading(true);
    api.formation.getMesSessions().then(rows => setSessions(rows || [])).catch(() => setErr("Impossible de charger tes formations"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const perso = agentProfiles[agentId]?.formationsPersoDeclarees || [];
  const notifications = agentProfiles[agentId]?.formationNotifications || [];

  // 10/08 (Olivier, simplifié après un second retour — "c'est peu utile
  // d'attendre la date, vu que l'agent peut se remettre sur une des
  // formations prevue ce jour la") : une session LANCÉE que l'agent a
  // déclinée (retiré la formation de son planning) disparaît de son archive
  // perso immédiatement, sans attendre que la date soit passée — puisqu'il
  // peut de toute façon la reprendre à tout moment via le picker
  // "Formation(s) proposée(s) ce jour" dans DayEditPopup. Recalculé à la
  // lecture (toujours_present vient du planning réel), jamais stocké — dès
  // qu'il se réinscrit, elle réapparaît. Une session encore "planifiée"
  // (jamais lancée, jamais rien écrit) n'est jamais concernée.
  const items = useMemo(() => {
    const a = sessions
      .filter(s => s.est_participant)
      .filter(s => !(s.statut === "lancee" && !s.toujours_present))
      .map(s => ({ source: "afo", key: `afo-${s.id}`, date: s.date_session, ...s }));
    const b = perso.map(p => ({ source: "perso", key: `perso-${p.id}`, date: p.date, ...p }));
    return [...a, ...b].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  }, [sessions, perso]);

  function acquitter(sessionId) {
    const next = notifications.map(n => n.sessionId === sessionId ? { ...n, acquitte: true } : n);
    setAgentProfiles(p => ({ ...p, [agentId]: { ...(p[agentId] || {}), formationNotifications: next } }));
  }

  function retirerPerso(id) {
    const next = perso.filter(p => p.id !== id);
    setAgentProfiles(p => ({ ...p, [agentId]: { ...(p[agentId] || {}), formationsPersoDeclarees: next } }));
  }

  return (
    <div>
      {err && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>⚠️ {err}</div>}

      <button onClick={() => setShowDeclare(v => !v)} style={{ ...btnPrimary(AMBRE), marginBottom: 14 }}>
        {showDeclare ? "✕ Annuler" : "+ Déclarer une formation suivie"}
      </button>

      {showDeclare && (
        <DeclarerFormationForm
          onCancel={() => setShowDeclare(false)}
          onSaved={(entree) => {
            setAgentProfiles(p => ({ ...p, [agentId]: { ...(p[agentId] || {}), formationsPersoDeclarees: [...perso, entree] } }));
            refreshSchedule?.();
            setShowDeclare(false);
          }}
        />
      )}

      {loading ? (
        <div style={{ textAlign: "center", color: "#64748b", padding: 30 }}>Chargement...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: 30, fontSize: 13 }}>Aucune formation pour l'instant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map(it => it.source === "afo" ? (
            <div key={it.key} style={{ background: "#fff", border: `1.5px solid ${AMBRE.borderLight}`, borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 800, color: "#1e293b", fontSize: 14 }}>{it.intitule}</div>
                  <div style={{ fontSize: 12, color: "#334155", fontWeight: 600, marginTop: 2 }}>
                    📅 {fmtDate(it.date_session)} {it.lieu ? `· 📍 ${it.lieu}` : ""} · {it.categorie}
                  </div>
                </div>
                <StatutBadge session={it} />
              </div>
              <RosterLignes session={it} agentId={agentId} />
              {it.message_lancement && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#78350f", background: AMBRE.bgLight, border: `1px solid ${AMBRE.borderLight}`, borderRadius: 8, padding: "8px 10px" }}>
                  💬 {it.message_lancement}
                </div>
              )}
              {(() => {
                const notif = notifications.find(n => n.sessionId === it.id);
                if (!notif || notif.acquitte) return null;
                return (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#b45309", fontWeight: 700 }}>🔔 Ajoutée à ton planning perso — pense à vérifier</span>
                    <button onClick={() => acquitter(it.id)} style={{ ...btnPrimary(AMBRE), padding: "5px 12px", fontSize: 12 }}>✓ Vu</button>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div key={it.key} style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 800, color: "#1e293b", fontSize: 14 }}>{it.intitule}</div>
                  <div style={{ fontSize: 12, color: "#334155", fontWeight: 600, marginTop: 2 }}>
                    📅 {fmtDate(it.date)} {it.organisme ? `· ${it.organisme}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "3px 9px", background: "#f1f5f9", color: "#475569" }}>
                  {it.format === "e-learning" ? "💻 E-learning" : "📋 Externe"}
                </span>
              </div>
              <button onClick={() => retirerPerso(it.id)} style={{ marginTop: 8, background: "none", border: "none", color: "#64748b", fontSize: 11, cursor: "pointer", padding: 0 }}>
                🗑 Retirer de l'archive
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ESPACE AFO — Tes sessions (côté formateur) ─────────────────────────────
// Extrait de "Mes formations" le 25/08 (refonte de séparation AFO/perso) --
// vivait auparavant en haut du même onglet que l'archive perso, mélangeant
// les deux rôles sur un même écran. Composant autonome avec son propre fetch
// (même endpoint que MesFormationsTab, getMesSessions) plutôt que de faire
// remonter les données via des props partagées entre les deux onglets --
// aucun risque de régression sur "Mes formations" en la retravaillant.
function MesSessionsFormateurTab({ agentId, onGoToSession }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    api.formation.getMesSessions().then(rows => setSessions(rows || [])).catch(() => setErr("Impossible de charger tes sessions"))
      .finally(() => setLoading(false));
  }, []);

  const sessionsFormateur = useMemo(
    () => sessions.filter(s => s.est_formateur).sort((x, y) => (y.date_session || "").localeCompare(x.date_session || "")),
    [sessions]
  );

  if (loading) return <div style={{ textAlign: "center", color: "#64748b", padding: 30 }}>Chargement...</div>;

  return (
    <div>
      {err && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>⚠️ {err}</div>}
      {sessionsFormateur.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#475569", fontStyle: "italic", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" }}>
          Aucune session en tant que formateur pour l'instant.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessionsFormateur.map(s => (
            <div key={s.id} onClick={() => onGoToSession(s.id)}
              style={{ cursor: "pointer", background: "#fff", border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 13 }}>{s.intitule}</div>
                <div style={{ fontSize: 12, color: "#334155", fontWeight: 600, marginTop: 2 }}>📅 {fmtDate(s.date_session)} {s.lieu ? `· 📍 ${s.lieu}` : ""} · 👥 {s.participants.length} inscrit(s)</div>
                <RosterLignes session={s} agentId={agentId} />
              </div>
              <StatutBadge session={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeclarerFormationForm({ onCancel, onSaved }) {
  const [form, setForm] = useState({ date: "", intitule: "", organisme: "", format: "externe" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.date) return setErr("La date est obligatoire");
    if (!form.intitule.trim()) return setErr("L'intitulé est obligatoire");
    setErr(""); setSaving(true);
    try {
      const res = await api.formation.declarerPerso(form);
      onSaved(res.entree);
    } catch (e) { setErr(e.message || "Erreur"); }
    setSaving(false);
  }

  return (
    <div style={{ background: AMBRE.bgLight, border: `1.5px solid ${AMBRE.borderLight}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={labelStyle}>Date</div>
          <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Intitulé</div>
          <input value={form.intitule} onChange={e => setForm(p => ({ ...p, intitule: e.target.value }))} placeholder="ex: Sécurité incendie" style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Organisme (optionnel)</div>
          <input value={form.organisme} onChange={e => setForm(p => ({ ...p, organisme: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Type</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["externe", "📋 Externe"], ["e-learning", "💻 E-learning"]].map(([k, l]) => (
              <button key={k} onClick={() => setForm(p => ({ ...p, format: k }))}
                style={{ flex: 1, padding: 8, border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, background: form.format === k ? AMBRE.from : "#fff", color: form.format === k ? "#fff" : "#64748b" }}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {err && <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>⚠️ {err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={btnSecondary}>Annuler</button>
          <button onClick={submit} disabled={saving} style={btnPrimary(AMBRE)}>{saving ? "..." : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── GESTION (AFO) ──────────────────────────────────────────────────────────

function GestionTab({ agents, refreshProfil, refreshSchedule, pendingSessionId, onConsumePending }) {
  const [sub, setSub] = useState("catalogue");
  const [catalogue, setCatalogue] = useState([]);
  const [loadingCat, setLoadingCat] = useState(true);

  const chargerCatalogue = useCallback(() => {
    setLoadingCat(true);
    api.formation.getCatalogue().then(rows => setCatalogue(rows || [])).catch(() => {}).finally(() => setLoadingCat(false));
  }, []);
  useEffect(() => { chargerCatalogue(); }, [chargerCatalogue]);
  // Arrivee depuis "Mes formations" (👨‍🏫 Tes sessions formateur) : bascule
  // automatiquement sur le sous-onglet Sessions, qui se charge d'ouvrir la
  // session precise (voir SessionsSection).
  useEffect(() => { if (pendingSessionId) setSub("sessions"); }, [pendingSessionId]);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["catalogue", "📖 Catalogue"], ["sessions", "📅 Sessions"]].map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: sub === k ? NAVY.from : "#f1f5f9", color: sub === k ? "#fff" : "#64748b" }}>
            {l}
          </button>
        ))}
      </div>
      {sub === "catalogue" && <CatalogueSection catalogue={catalogue} loading={loadingCat} onChange={chargerCatalogue} />}
      {sub === "sessions" && <SessionsSection catalogue={catalogue} agents={agents} refreshProfil={refreshProfil} refreshSchedule={refreshSchedule} pendingSessionId={pendingSessionId} onConsumePending={onConsumePending} />}
    </div>
  );
}

function CatalogueSection({ catalogue, loading, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState(null);

  return (
    <div>
      <button onClick={() => { setEdit(null); setShowForm(v => !v); }} style={{ ...btnPrimary(NAVY), marginBottom: 14 }}>
        {showForm ? "✕ Annuler" : "+ Nouvelle formation"}
      </button>
      {showForm && <CatalogueForm initial={edit} onCancel={() => setShowForm(false)} onSaved={() => { setShowForm(false); onChange(); }} />}

      {loading ? (
        <div style={{ textAlign: "center", color: "#64748b", padding: 30 }}>Chargement...</div>
      ) : CATEGORIES.map(cat => {
        const items = catalogue.filter(c => c.categorie === cat);
        if (!items.length) return null;
        return (
          <div key={cat} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#1e3a5f", marginBottom: 8 }}>{cat}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map(f => (
                <div key={f.id} style={{ background: "#fff", border: `1.5px solid ${f.statut === "archive" ? "#e2e8f0" : NAVY.borderLight}`, borderRadius: 10, padding: "10px 14px", opacity: f.statut === "archive" ? 0.6 : 1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 13 }}>{f.intitule}{f.obligatoire ? " ⭐" : ""}</div>
                    <div style={{ fontSize: 12, color: "#334155", fontWeight: 600, marginTop: 2 }}>{[f.duree, f.format, f.statut === "archive" ? "archivée" : null].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { setEdit(f); setShowForm(true); }} style={{ ...btnSecondary, padding: "6px 12px" }}>✏️</button>
                    <button onClick={() => api.formation.updateCatalogue(f.id, { statut: f.statut === "archive" ? "actif" : "archive" }).then(onChange)}
                      style={{ ...btnSecondary, padding: "6px 12px" }}>
                      {f.statut === "archive" ? "↺ Réactiver" : "📦 Archiver"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!loading && catalogue.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: 30, fontSize: 13 }}>Aucune formation au catalogue.</div>}
    </div>
  );
}

function CatalogueForm({ initial, onCancel, onSaved }) {
  const [form, setForm] = useState(initial || { categorie: "PRCI", intitule: "", description: "", duree: "", format: "", public_cible: "", prerequis: "", obligatoire: false });
  const initialFormat = useMemo(() => splitChoixLibre(initial?.format, FORMAT_OPTIONS), [initial]);
  const [formatChoix, setFormatChoix] = useState(initialFormat.choix);
  const [formatAutre, setFormatAutre] = useState(initialFormat.autre);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.intitule.trim()) return setErr("L'intitulé est obligatoire");
    setErr(""); setSaving(true);
    const payload = { ...form, format: formatChoix === "Autre" ? formatAutre.trim() : formatChoix };
    try {
      if (initial?.id) await api.formation.updateCatalogue(initial.id, payload);
      else await api.formation.createCatalogue(payload);
      onSaved();
    } catch (e) { setErr(e.message || "Erreur"); }
    setSaving(false);
  }

  return (
    <div style={{ background: NAVY.bgLight, border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={labelStyle}>Catégorie</div>
          <div style={{ display: "flex", gap: 8 }}>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setForm(p => ({ ...p, categorie: c }))}
                style={{ flex: 1, padding: 8, border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, background: form.categorie === c ? NAVY.from : "#fff", color: form.categorie === c ? "#fff" : "#64748b" }}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div><div style={labelStyle}>Intitulé</div><input value={form.intitule} onChange={e => setForm(p => ({ ...p, intitule: e.target.value }))} style={inputStyle} /></div>
        <div><div style={labelStyle}>Description</div><textarea value={form.description || ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "vertical" }} /></div>
        <div><div style={labelStyle}>Durée</div><input value={form.duree || ""} onChange={e => setForm(p => ({ ...p, duree: e.target.value }))} placeholder="ex: 1 jour" style={inputStyle} /></div>
        <div>
          <div style={labelStyle}>Format</div>
          <ChoixLibre options={FORMAT_OPTIONS} choix={formatChoix} onChoix={setFormatChoix} autre={formatAutre} onAutre={setFormatAutre} famille={NAVY} />
        </div>
        <div><div style={labelStyle}>Public cible</div><input value={form.public_cible || ""} onChange={e => setForm(p => ({ ...p, public_cible: e.target.value }))} style={inputStyle} /></div>
        <div><div style={labelStyle}>Prérequis</div><input value={form.prerequis || ""} onChange={e => setForm(p => ({ ...p, prerequis: e.target.value }))} style={inputStyle} /></div>
        <button onClick={() => setForm(p => ({ ...p, obligatoire: !p.obligatoire }))}
          style={{ padding: 8, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, background: form.obligatoire ? NAVY.from : "#fff", color: form.obligatoire ? "#fff" : "#64748b", border: `1px solid ${NAVY.borderLight}` }}>
          ⭐ {form.obligatoire ? "Formation obligatoire" : "Formation facultative"}
        </button>
        {err && <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>⚠️ {err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={btnSecondary}>Annuler</button>
          <button onClick={submit} disabled={saving} style={btnPrimary(NAVY)}>{saving ? "..." : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

function SessionsSection({ catalogue, agents, refreshProfil, refreshSchedule, pendingSessionId, onConsumePending }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState(null);

  const charger = useCallback(() => {
    setLoading(true);
    api.formation.getSessions().then(rows => setSessions(rows || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    if (pendingSessionId) { setOpenId(pendingSessionId); onConsumePending?.(); }
  }, [pendingSessionId]); // eslint-disable-line

  return (
    <div>
      <button onClick={() => setShowForm(v => !v)} style={{ ...btnPrimary(NAVY), marginBottom: 14 }}>
        {showForm ? "✕ Annuler" : "+ Nouvelle session"}
      </button>
      {showForm && <SessionForm catalogue={catalogue} agents={agents} onCancel={() => setShowForm(false)} onSaved={() => { setShowForm(false); charger(); }} />}

      {loading ? (
        <div style={{ textAlign: "center", color: "#64748b", padding: 30 }}>Chargement...</div>
      ) : sessions.length === 0 ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: 30, fontSize: 13 }}>Aucune session.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.map(s => (
            <div key={s.id} onClick={() => setOpenId(s.id)}
              style={{ cursor: "pointer", background: "#fff", border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 13 }}>{s.intitule}</div>
                <div style={{ fontSize: 12, color: "#334155", fontWeight: 600, marginTop: 2 }}>📅 {fmtDate(s.date_session)} {s.lieu ? `· 📍 ${s.lieu}` : ""} · 👥 {s.nb_participants} inscrit(s)</div>
                <RosterLignes session={s} />
              </div>
              <StatutBadge session={s} />
            </div>
          ))}
        </div>
      )}

      {openId && <SessionDetailModal sessionId={openId} agents={agents} onClose={() => setOpenId(null)} onChanged={charger} refreshProfil={refreshProfil} refreshSchedule={refreshSchedule} />}
    </div>
  );
}

function SessionForm({ catalogue, agents, onCancel, onSaved }) {
  const [form, setForm] = useState({ catalogue_id: catalogue[0]?.id || "", date_session: "" });
  const [lieuChoix, setLieuChoix] = useState("PRCI");
  const [lieuAutre, setLieuAutre] = useState("");
  const [formateurs, setFormateurs] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const afos = agents.filter(a => a.is_afo);
  const filtered = agents.filter(a => {
    const q = search.toLowerCase();
    return !q || a.nom?.toLowerCase().includes(q) || a.prenom?.toLowerCase().includes(q) || a.id?.toLowerCase().includes(q);
  });

  function toggleFormateur(cp) {
    setFormateurs(f => f.includes(cp) ? f.filter(c => c !== cp) : (f.length >= 3 ? f : [...f, cp]));
  }
  function toggleParticipant(cp) {
    setParticipants(p => p.includes(cp) ? p.filter(c => c !== cp) : [...p, cp]);
  }

  async function submit() {
    if (!form.catalogue_id) return setErr("Choisis une formation du catalogue");
    if (!form.date_session) return setErr("La date est obligatoire");
    setErr(""); setSaving(true);
    const lieu = lieuChoix === "Autre" ? lieuAutre.trim() : lieuChoix;
    try {
      await api.formation.createSession({ ...form, lieu, formateurs, participants });
      onSaved();
    } catch (e) { setErr(e.message || "Erreur"); }
    setSaving(false);
  }

  return (
    <div style={{ background: NAVY.bgLight, border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={labelStyle}>Formation du catalogue</div>
          <select value={form.catalogue_id} onChange={e => setForm(p => ({ ...p, catalogue_id: Number(e.target.value) }))} style={inputStyle}>
            {catalogue.filter(c => c.statut !== "archive").map(c => <option key={c.id} value={c.id}>{c.categorie} — {c.intitule}</option>)}
          </select>
        </div>
        <div><div style={labelStyle}>Date</div><input type="date" value={form.date_session} onChange={e => setForm(p => ({ ...p, date_session: e.target.value }))} style={inputStyle} /></div>
        <div>
          <div style={labelStyle}>Lieu</div>
          <ChoixLibre options={LIEU_OPTIONS} choix={lieuChoix} onChoix={setLieuChoix} autre={lieuAutre} onAutre={setLieuAutre} famille={NAVY} />
        </div>
        <div>
          <div style={labelStyle}>Formateurs (jusqu'à 3)</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {afos.map(a => (
              <button key={a.id} onClick={() => toggleFormateur(a.id)}
                style={{ padding: "6px 12px", borderRadius: 20, border: "1px solid " + (formateurs.includes(a.id) ? NAVY.from : "#e2e8f0"), cursor: "pointer", fontSize: 12, fontWeight: 600, background: formateurs.includes(a.id) ? NAVY.from : "#fff", color: formateurs.includes(a.id) ? "#fff" : "#475569" }}>
                {a.prenom} {a.nom}
              </button>
            ))}
            {afos.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>Aucun agent AFO pour l'instant.</div>}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Participants</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher un agent..." style={{ ...inputStyle, marginBottom: 8 }} />
          <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, border: "1px solid #e2e8f0", borderRadius: 8, padding: 6, background: "#fff" }}>
            {filtered.map(a => (
              <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 6px", cursor: "pointer" }}>
                <input type="checkbox" checked={participants.includes(a.id)} onChange={() => toggleParticipant(a.id)} />
                {a.prenom} {a.nom} <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>{a.id}</span>
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{participants.length} sélectionné(s)</div>
        </div>
        {err && <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>⚠️ {err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={btnSecondary}>Annuler</button>
          <button onClick={submit} disabled={saving} style={btnPrimary(NAVY)}>{saving ? "..." : "Créer la session"}</button>
        </div>
      </div>
    </div>
  );
}

function SessionDetailModal({ sessionId, agents, onClose, onChanged, refreshProfil, refreshSchedule }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [addParticipantCp, setAddParticipantCp] = useState("");
  const [addFormateurCp, setAddFormateurCp] = useState("");

  const charger = useCallback(() => {
    setLoading(true);
    api.formation.getSessionDetail(sessionId).then(d => { setData(d); setMsg(d.session.message_lancement || ""); }).catch(() => setErr("Impossible de charger la session")).finally(() => setLoading(false));
  }, [sessionId]);
  useEffect(() => { charger(); }, [charger]);

  async function lancer() {
    setErr("");
    try {
      await api.formation.lancerSession(sessionId, msg);
      charger(); onChanged(); refreshProfil?.(); refreshSchedule?.();
    } catch (e) { setErr(e.message || "Erreur"); }
  }
  async function retirerParticipant(cp) {
    try { await api.formation.removeParticipant(sessionId, cp); charger(); onChanged(); refreshProfil?.(); refreshSchedule?.(); } catch (e) { setErr(e.message || "Erreur"); }
  }
  async function ajouterParticipant() {
    if (!addParticipantCp) return;
    try { await api.formation.addParticipant(sessionId, addParticipantCp); setAddParticipantCp(""); charger(); onChanged(); refreshProfil?.(); refreshSchedule?.(); } catch (e) { setErr(e.message || "Erreur"); }
  }
  async function retirerFormateur(cp) {
    try { await api.formation.removeFormateur(sessionId, cp); charger(); } catch (e) { setErr(e.message || "Erreur"); }
  }
  async function ajouterFormateur() {
    if (!addFormateurCp) return;
    try { await api.formation.addFormateur(sessionId, addFormateurCp); setAddFormateurCp(""); charger(); } catch (e) { setErr(e.message || "Erreur"); }
  }
  async function supprimer() {
    if (!window.confirm("Supprimer définitivement cette session ? Cette action est irréversible.")) return;
    try { await api.formation.deleteSession(sessionId); onChanged(); refreshProfil?.(); refreshSchedule?.(); onClose(); } catch (e) { setErr(e.message || "Erreur"); }
  }

  const afos = agents.filter(a => a.is_afo && !data?.formateurs.some(f => f.cp === a.id));
  const nonInscrits = agents.filter(a => !data?.participants.some(p => p.cp_agent === a.id));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
        <div style={{ background: `linear-gradient(135deg,${NAVY.from},${NAVY.to})`, padding: "16px 20px", position: "sticky", top: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#fff" }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{data?.session?.intitule || "..."}</div>
            <div style={{ fontSize: 12, opacity: .85 }}>{data ? `${fmtDate(data.session.date_session)}${data.session.lieu ? " · " + data.session.lieu : ""}` : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 10, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          {loading ? <div style={{ textAlign: "center", color: "#64748b" }}>Chargement...</div> : !data ? null : (
            <>
              {err && <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>{err}</div>}

              <div style={{ marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <StatutBadge session={data.session} />
                <button onClick={supprimer} style={{ background: "none", border: "none", color: "#64748b", fontSize: 11, cursor: "pointer" }}>🗑 Supprimer la session</button>
              </div>

              <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: "#1e3a5f" }}>👨‍🏫 Formateurs</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, marginBottom: 10 }}>
                {data.formateurs.map(f => (
                  <span key={f.cp} style={{ fontSize: 12, background: NAVY.bgLight, color: NAVY.accentDark, borderRadius: 20, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                    {f.prenom} {f.nom}
                    <button onClick={() => retirerFormateur(f.cp)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 12 }}>✕</button>
                  </span>
                ))}
                {data.formateurs.length < 3 && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <select value={addFormateurCp} onChange={e => setAddFormateurCp(e.target.value)} style={{ ...inputStyle, padding: "4px 8px", fontSize: 12, width: "auto" }}>
                      <option value="">+ ajouter...</option>
                      {afos.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
                    </select>
                    <button onClick={ajouterFormateur} style={{ ...btnSecondary, padding: "4px 10px", fontSize: 12 }}>OK</button>
                  </div>
                )}
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, color: "#1e3a5f" }}>👥 Participants ({data.participants.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, marginBottom: 10 }}>
                {data.participants.map(p => (
                  <div key={p.cp_agent} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 8px", borderRadius: 6, background: data.session.statut === "lancee" && !p.toujours_present ? "#fef2f2" : "#f8fafc" }}>
                    <span style={{ textDecoration: data.session.statut === "lancee" && !p.toujours_present ? "line-through" : "none", color: data.session.statut === "lancee" && !p.toujours_present ? "#b91c1c" : "#1e293b" }}>
                      {p.prenom} {p.nom}
                      {data.session.statut === "lancee" && !p.toujours_present && <span style={{ marginLeft: 6, fontWeight: 700 }}>⚠️ a retiré la formation de son planning</span>}
                    </span>
                    <button onClick={() => retirerParticipant(p.cp_agent)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}>✕</button>
                  </div>
                ))}
                {data.participants.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>Aucun participant.</div>}
              </div>
              <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
                <select value={addParticipantCp} onChange={e => setAddParticipantCp(e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
                  <option value="">+ ajouter un participant...</option>
                  {nonInscrits.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
                </select>
                <button onClick={ajouterParticipant} style={{ ...btnSecondary, fontSize: 12 }}>OK</button>
              </div>

              {data.session.statut === "planifiee" && (
                <>
                  <div style={labelStyle}>Message de lancement (optionnel)</div>
                  <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", marginBottom: 10 }} placeholder="Visible par les participants lors du lancement" />
                  <button onClick={lancer} style={{ ...btnPrimary(NAVY), width: "100%" }}>🚀 Lancer la session</button>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>Ajoute "🎓 Formation" en plus du contenu déjà présent dans le planning de chaque participant (rien n'est jamais écrasé) et les prévient. Chaque agent valide sa venue en libérant sa journée depuis son planning perso.</div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── STATS (AFO) ────────────────────────────────────────────────────────────

function StatsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.formation.getStats().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: "center", color: "#64748b", padding: 30 }}>Chargement...</div>;
  if (!data) return <div style={{ textAlign: "center", color: "#94a3b8", padding: 30, fontSize: 13 }}>Impossible de charger les statistiques.</div>;

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#1e3a5f", marginBottom: 8 }}>📖 Par formation</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {data.parFormation.map(f => (
          <div key={f.catalogue_id} style={{ background: "#fff", border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{f.intitule} <span style={{ fontWeight: 500, color: "#64748b" }}>({f.categorie})</span></div>
            <div style={{ fontSize: 12, color: "#334155", fontWeight: 600, marginTop: 2 }}>{f.nb_sessions} session(s) · {f.agents.length} agent(s) suivi(s)</div>
            {f.agents.length > 0 && <div style={{ fontSize: 12.5, color: "#1e293b", fontWeight: 600, marginTop: 4 }}>{f.agents.map(a => `${a.prenom} ${a.nom}`).join(", ")}</div>}
          </div>
        ))}
        {data.parFormation.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>Aucune donnée.</div>}
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, color: "#1e3a5f", marginBottom: 8 }}>📅 Répartition annuelle (catégorie × source)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
        {data.parAnneeCategorieSource.map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, background: "#f8fafc", borderRadius: 8, padding: "6px 12px" }}>
            <span>{r.annee} · {r.categorie}</span>
            <span style={{ fontWeight: 700 }}>{r.nbAgents} agent(s)</span>
          </div>
        ))}
        {data.parAnneeCategorieSource.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>Aucune donnée.</div>}
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, color: "#1e3a5f", marginBottom: 8 }}>🎓 Par AFO (visible par tous les AFO)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.parAfo.map(a => (
          <div key={a.cp} style={{ background: "#fff", border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{a.prenom} {a.nom}</div>
            <div style={{ fontSize: 12, color: "#334155", fontWeight: 600, marginTop: 4 }}>
              {Object.keys(a.joursParAn).length === 0 ? "Aucune session animée" :
                Object.entries(a.joursParAn).sort((x, y) => y[0] - x[0]).map(([an, n]) => `${an} : ${n} jour(s)`).join(" · ")}
            </div>
            <div style={{ fontSize: 12, color: "#334155", fontWeight: 600, marginTop: 2 }}>{a.agentsFormesGlobal} agent(s) formé(s) au total</div>
          </div>
        ))}
        {data.parAfo.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>Aucun AFO pour l'instant.</div>}
      </div>
    </div>
  );
}
