import { useState, useEffect, useCallback, useMemo } from "react";
import api, { resolveJsCode } from "../api/client";
import { computeEtudePosteDetail, getPosteLabelFromCode } from "../App";

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

// bgLight/borderLight/accentDark référencent des tokens theme.css depuis le
// 15/09 (mode sombre AFO "ça claque les yeux") -- valeurs identiques en clair
// (aucun changement visuel), éclaircies/teintées en sombre plutôt que de
// rester pâles sur un fond quasi-noir. Voir le commentaire de theme.css
// (--panel-navy-*/--panel-amber-*) pour le détail du raisonnement.
const AMBRE = { from: "#b45309", to: "#92400e", bgLight: "var(--panel-amber-bg)", borderLight: "var(--panel-amber-border)", accentDark: "var(--panel-amber-text)" };
const NAVY  = { from: "#0f4c81", to: "#1e3a5f", bgLight: "var(--panel-navy-bg)", borderLight: "var(--panel-navy-border)", accentDark: "var(--panel-navy-text)" };

const CATEGORIES = ["PRCI", "PAR", "Divers"];
const FORMAT_OPTIONS = ["Présentiel", "Distanciel", "Autre"];
const LIEU_OPTIONS = ["PRCI", "PAR", "Autre"];

// Refonte visuelle (15/09, Olivier : "pas assez pro et manque de couleur
// [...] je me sens perdu") -- couleurs de catégorie reprises TELLES QUELLES
// de FAMILLES.PRCI.accent/FAMILLES.PAR.accent (App.jsx, déjà la convention
// PRCI=bleu/PAR=vert dans tout le reste de l'appli, CPS Officiel/Planning
// Prévisionnel) plutôt qu'une nouvelle palette inventée -- évite un doublon
// de sens entre modules (un bleu qui voudrait dire PRCI ici mais autre chose
// ailleurs). Divers en violet, déjà l'accent générique utilisé partout dans
// ce fichier.
const CATEGORIE_COLORS = {
  PRCI:   { fg: "#1e40af", bg: "#dbeafe", border: "#93c5fd" },
  PAR:    { fg: "#065f46", bg: "#d1fae5", border: "#6ee7b7" },
  Divers: { fg: "#5b21b6", bg: "#ede9fe", border: "#c4b5fd" },
};
function CategorieChip({ cat }) {
  const c = CATEGORIE_COLORS[cat] || CATEGORIE_COLORS.Divers;
  return <span style={{ fontSize: 10.5, fontWeight: 700, color: c.fg, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 20, padding: "1px 8px", whiteSpace: "nowrap" }}>{cat}</span>;
}
// Les tuiles résumé réutilisent StatTuile (déjà définie plus bas dans ce
// fichier, hoisting de fonction -- callable ici sans problème) plutôt qu'un
// nouveau composant : Olivier a explicitement demandé "éviter les doublons"
// dans la refonte visuelle, StatTuile fait déjà exactement ce qu'il faut ici.
// Badge de couverture coloré (15/09, "vue globale" -- Olivier : "pas tres
// clair de voir la situation globale") -- rouge/orange/vert selon le %,
// lisible d'un coup d'œil sur chaque ligne du catalogue, sans avoir à
// cliquer pour connaître l'ordre de grandeur.
function CouvertureBadge({ pct }) {
  if (pct == null) return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>;
  const c = pct < 33 ? { fg: "#b91c1c", bg: "#fee2e2" } : pct < 66 ? { fg: "#b45309", bg: "#fef3c7" } : { fg: "#15803d", bg: "#dcfce7" };
  return <span style={{ fontSize: 11, fontWeight: 700, color: c.fg, background: c.bg, borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap" }}>{Math.round(pct)}%</span>;
}

const STATUT_SESSION = {
  planifiee: { label: "🗓️ Planifiée", bg: "#f1f5f9", color: "#475569" },
  lancee:    { label: "🚀 Lancée",     bg: "#dbeafe", color: "#1e40af" },
  terminee:  { label: "✅ Terminée",   bg: "#dcfce7", color: "#15803d" },
  annulee:   { label: "❌ Annulée",    bg: "#fee2e2", color: "#b91c1c" },
};

// 26/08 (Olivier, après avoir vu des "1"/"5" bruts sans unité mélangés à des
// "1 jour" dans le catalogue existant -- "on ne sait pas a quoi il sert" --
// puis "oui verouille le" une fois la donnée corrigée) : le champ Durée
// n'accepte plus de texte libre -- toujours un nombre de jours (0.5 possible,
// demi-journée), la chaîne affichée ("1 jour"/"5 jours") est entièrement
// dérivée ici, ne peut plus dériver vers autre chose qu'un vrai compte de
// jours à l'avenir.
function formatDureeJours(raw) {
  const n = parseFloat(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return "";
  const affiche = Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  return `${affiche} jour${n > 1 ? "s" : ""}`;
}
// Extrait le nombre de jours déjà stocké (ex: "1 jour"/"5 jours") pour
// pré-remplir le champ numérique à l'édition -- une ancienne valeur non
// numérique (résidu jamais nettoyé) donne simplement un champ vide plutôt
// que de planter.
function parseDureeJours(duree) {
  const n = parseFloat(String(duree ?? "").replace(",", "."));
  return Number.isFinite(n) ? String(n) : "";
}

function fmtDate(iso) {
  if (!iso) return "";
  const [a, m, j] = String(iso).slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}
// 26/08 (nouveau champ heure_debut) : mysql2 renvoie un TIME sous forme
// "HH:MM:SS" -- tronqué à "HH:MM" pour l'affichage.
function fmtHeure(hms) {
  return hms ? String(hms).slice(0, 5) : "";
}

// Étude de poste (27/08) : ordre + pluriel des 4 vacations, pour le résumé
// "AC LNE — 11 jours (4 matinées, 4 nuits, 3 soirées)" (Olivier). Les 4
// libellés se pluralisent tous par un simple "s" final.
const SHIFT_ORDER_ETUDE = ["M", "AM", "N", "J"];
const SHIFT_LABEL_ETUDE = { M: "matinée", AM: "soirée", N: "nuit", J: "journée" };
function resumeParVacation(parShift) {
  return SHIFT_ORDER_ETUDE.filter(s => parShift[s]).map(s => `${parShift[s]} ${SHIFT_LABEL_ETUDE[s]}${parShift[s] > 1 ? "s" : ""}`).join(", ");
}
// Clé de vacation (M/AM/N/J) pour une entrée d'étude de poste -- avec repli
// sur le suffixe du jsCode (M="-"/AM="O"/N="X", pas de suffixe -> "J") quand
// code_equipe n'est pas un vrai M/AM/N/J (15/09, cas réel CPS Officiel :
// equipe="FOR", un artefact de classification d'import indépendant de la
// vraie vacation du poste réel porté par jsCode -- voir CLAUDE.md 04/09, cas
// MENDY -- sans ce repli, la Fiche agent affichait "FOR" au lieu de "soirée").
function shiftKeyEtude(codeEquipe, jsCode) {
  if (SHIFT_LABEL_ETUDE[codeEquipe]) return codeEquipe;
  if (jsCode) {
    const last = jsCode.slice(-1);
    if (last === "-") return "M";
    if (last === "O") return "AM";
    if (last === "X") return "N";
    return "J";
  }
  return null;
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
            style={{ padding: "7px 14px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, background: choix === o ? famille.from : "var(--bg-card)", color: choix === o ? "#fff" : "var(--text-secondary)", boxShadow: choix === o ? "none" : "0 0 0 1.5px var(--border) inset" }}>
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

// 25/08 (Olivier : "tes formation suivies en mode sombre illisible") --
// inputStyle/labelStyle sont partages entre des formulaires DEJA
// auto-suffisants (a l'interieur d'un encart NAVY.bgLight/AMBRE.bgLight,
// pastel clair jamais impacte par le theme -- meme principe que le bandeau
// "Echanges ouverts" documente dans CLAUDE.md) ET des endroits qui touchent
// directement le fond de page/carte (ex: SessionDetailModal) -- rendus
// theme-aware une fois pour toutes ici, sans effet visuel en mode clair
// (valeurs identiques) ni risque dans les formulaires deja auto-suffisants.
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "8px 12px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", background: "var(--bg-card)", color: "var(--text-primary)" };
const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 };
// 10/08 (Olivier, sur mobile, signalé une 2e fois : "les nom des agents [...]
// sont peu lisible [...] augmenter la police noire peut etre") : le gris
// clair habituel (#64748b/#94a3b8) est trop peu contrasté pour lire des noms
// — quasi noir + plus grand + plus gras, réservé à ces lignes-là.
const rosterStyle = { fontSize: 13, color: "var(--text-primary)", fontWeight: 700, marginTop: 4, lineHeight: 1.4 };
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
// #f1f5f9 -> var(--bg-page) : même substitution déjà validée ailleurs dans le
// projet (AdminPanel.jsx, 27/08) -- écart de teinte imperceptible en clair
// (#f1f5f9 vs #f8fafc), theme-aware en sombre (15/09).
const btnSecondary = { background: "var(--bg-page)", color: "var(--text-secondary)", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600 };

// ─── COMPOSANT RACINE ───────────────────────────────────────────────────────

export default function FormationView({ currentAgent, agentProfiles, setAgentProfiles, refreshSchedule, schedule, cpsSchedule }) {
  const agentId = currentAgent?.immatriculation || currentAgent?.cp || currentAgent?.id;

  return (
    <div style={{ padding: "12px", maxWidth: 1000, margin: "0 auto", fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>🎓 Formation</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>Tes formations suivies</div>
      </div>
      <MesFormationsTab agentId={agentId} agent={currentAgent} schedule={schedule} cpsSchedule={cpsSchedule} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} refreshSchedule={refreshSchedule} />
    </div>
  );
}

// ─── ESPACE AFO — vue séparée du lateral (25/08, voir en-tête du fichier) ───
export function AfoView({ currentAgent, agents, refreshProfil, refreshSchedule }) {
  const agentId = currentAgent?.immatriculation || currentAgent?.cp || currentAgent?.id;
  const [afoSubTab, setAfoSubTab] = useState("mes");
  // Permet a "Tes sessions" d'ouvrir directement le detail d'une session (via
  // SessionDetailModal, onglet "Sessions") sans faire chercher la session
  // dans la liste globale — demande explicite d'Olivier (10/08) : trop de
  // sous-menus, trop dur de retrouver ses propres journees de formateur.
  const [pendingSessionId, setPendingSessionId] = useState(null);
  const goToSession = (id) => { setPendingSessionId(id); setAfoSubTab("planning"); };

  // Catalogue partage entre l'onglet Catalogue et l'onglet Sessions (creation
  // de session) -- charge une seule fois au niveau de l'espace AFO plutot que
  // de dupliquer le fetch par onglet (comme avant, quand les deux vivaient
  // ensemble sous "Gestion").
  const [catalogue, setCatalogue] = useState([]);
  const [loadingCat, setLoadingCat] = useState(true);
  const chargerCatalogue = useCallback(() => {
    setLoadingCat(true);
    api.formation.getCatalogue().then(rows => setCatalogue(rows || [])).catch(() => {}).finally(() => setLoadingCat(false));
  }, []);
  useEffect(() => { chargerCatalogue(); }, [chargerCatalogue]);

  // 11/09 (Olivier : "regarde toutes la parti afo [...] la rendre plus simple
  // ergonomique et evidente") -- "Gestion" etait le seul des 3 onglets
  // principaux a cacher lui-meme 2 sous-onglets (Catalogue/Sessions),
  // asymetrique avec "Tes sessions"/"Stats" qui eux etaient directs. Aplati
  // en 4 onglets a plat, tous au meme niveau, plus aucun sous-menu cache.
  const afoSubTabs = [
    { k: "mes",       label: "👨‍🏫 Tes sessions" },
    { k: "catalogue", label: "📖 Catalogue" },
    { k: "planning",  label: "📅 Planning" },
    { k: "stats",     label: "📊 Stats" },
  ];
  // 11/09 (Olivier, juste après l'aplatissement : "c'est quoi la difference
  // entre tes sessions et sessions. pas tres clair") -- les libellés courts
  // ("Tes sessions" vs "Sessions") ne suffisaient pas à distinguer "les
  // sessions où TU animes" (sous-liste) de "toutes les sessions créées par
  // n'importe quel AFO" (gestion complète, création/édition/lancement).
  // Rallonger le libellé du bouton aurait débordé sur mobile (grille à 2
  // colonnes de ~158px) -- une phrase de contexte sous les onglets, affichée
  // uniquement pour ces 2 cas ambigus, règle ça sans risque de mise en page.
  const afoSubTabHints = {
    mes: "Uniquement les sessions où TU animes comme formateur.",
    catalogue: "Les TYPES de formation qui existent (durée, format, catégorie) — pas encore de date ni de participants.",
    planning: "Le planning de TOUTES les sessions réellement programmées (dates, formateur(s), participants) — création, édition, lancement.",
  };

  return (
    <div style={{ padding: "12px", maxWidth: 1000, margin: "0 auto", fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>🎓 Espace AFO</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>Ton rôle de formateur</div>
      </div>

      <div style={{ background: NAVY.bgLight, border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 14, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6, marginBottom: 14 }}>
          {afoSubTabs.map(t => (
            <button key={t.k} onClick={() => setAfoSubTab(t.k)}
              style={{
                padding: "8px 14px", borderRadius: 9, border: "none", cursor: "pointer",
                fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
                background: afoSubTab === t.k ? NAVY.from : "var(--bg-card)",
                color: afoSubTab === t.k ? "#fff" : NAVY.accentDark,
                boxShadow: afoSubTab === t.k ? "0 2px 6px rgba(15,76,129,.35)" : "0 1px 2px rgba(15,23,42,.06)",
                transition: "background .15s ease, box-shadow .15s ease",
              }}>
              {t.label}
            </button>
          ))}
        </div>
        {afoSubTabHints[afoSubTab] && (
          <div style={{ fontSize: 11.5, color: NAVY.accentDark, background: "var(--bg-card)", border: `1px dashed ${NAVY.borderLight}`, borderRadius: 8, padding: "6px 10px", marginBottom: 12 }}>
            💡 {afoSubTabHints[afoSubTab]}
          </div>
        )}
        {afoSubTab === "mes" && <MesSessionsFormateurTab agentId={agentId} onGoToSession={goToSession} />}
        {afoSubTab === "catalogue" && <CatalogueSection catalogue={catalogue} loading={loadingCat} onChange={chargerCatalogue} />}
        {afoSubTab === "planning" && <SessionsSection catalogue={catalogue} agents={agents} refreshProfil={refreshProfil} refreshSchedule={refreshSchedule} pendingSessionId={pendingSessionId} onConsumePending={() => setPendingSessionId(null)} />}
        {afoSubTab === "stats" && <StatsTab agents={agents} catalogue={catalogue} />}
      </div>
    </div>
  );
}

// ─── MES FORMATIONS (tous les agents, uniquement le côté participant) ──────

function MesFormationsTab({ agentId, agent, schedule, cpsSchedule, agentProfiles, setAgentProfiles, refreshSchedule }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showDeclare, setShowDeclare] = useState(false);

  // Étude de poste (27/08, refondu le même jour -- Olivier : "dans le module
  // formation, il faut sepaarer ses journees et mettre les matinnee nuit
  // soiree ou journnee du poste tenue. et le nombre de journee faites par
  // poste") : calculé à la volée depuis le planning perso réel (jamais
  // stocké), année en cours seulement -- computeEtudePosteDetail exportée
  // par App.jsx (même principe que les fonctions déjà réutilisées par
  // FimPdfView.jsx, import circulaire sans risque tant qu'il n'est jamais
  // lu au niveau module, seulement dans ce useMemo). Depuis le 15/09,
  // cpsSchedule (déjà chargé au niveau App, rafraîchi toutes les 45s) est
  // fusionné en plus du perso -- voir le commentaire de la fonction elle-même.
  const etudeYear = new Date().getFullYear();
  const agentForCalc = useMemo(() => ({ ...(agent || {}), id: agentId }), [agent, agentId]);
  const etudeDetail = useMemo(() => computeEtudePosteDetail(agentForCalc, schedule || {}, etudeYear, cpsSchedule || {}), [agentForCalc, schedule, etudeYear, cpsSchedule]);

  const charger = useCallback(() => {
    setLoading(true);
    api.formation.getMesSessions().then(rows => setSessions(rows || [])).catch(() => setErr("Impossible de charger tes formations"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  // Besoins EIA (15/09) : lecture seule côté agent -- ce que l'AFO/ASFP a
  // enregistré pour lui lors de son entretien annuel, avec le même statut
  // "réalisée" recalculé côté serveur (jamais stocké). Pas de bouton
  // ajouter/retirer ici, la saisie reste réservée à l'AFO/ASFP.
  const [eia, setEia] = useState([]);
  useEffect(() => { api.formation.getMesEia().then(rows => setEia(rows || [])).catch(() => {}); }, []);

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

      {/* Besoins EIA (15/09) : lecture seule, n'apparaît que s'il y a au
          moins une demande enregistrée pour cet agent. */}
      {eia.length > 0 && (
        <div style={{ background: "var(--bg-card)", border: "1.5px solid #d8b4fe", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: 14 }}>📋 Tes besoins de formation (EIA)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {eia.map(e => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, gap: 8 }}>
                <span style={{ color: "var(--text-primary)", fontWeight: 600, minWidth: 0 }}>{e.intitule}</span>
                <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", color: e.realisee ? "#15803d" : "#b45309" }}>{e.realisee ? "✅ Réalisée" : "⏳ Demandée"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Étude de poste (27/08, refondu le même jour) : décompte séparé par
          poste + par vacation, année en cours -- compte comme une journée de
          formation (voir App.jsx/DashboardCompteurs), donc pas répété dans la
          liste ci-dessous (ce ne sont ni des sessions AFO ni des
          déclarations perso). */}
      {etudeDetail.total > 0 && (
        <div style={{ background: "var(--bg-card)", border: `1.5px solid ${AMBRE.borderLight}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: 14 }}>🎓 Étude de poste — {etudeYear}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, marginTop: 2, marginBottom: 10 }}>
            {etudeDetail.total} jour{etudeDetail.total > 1 ? "s" : ""} au total, comptés comme journées de formation
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {etudeDetail.postes.map(p => (
              <div key={p.code} style={{ fontSize: 12.5 }}>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{p.label}</span>
                <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}> — {p.total} jour{p.total > 1 ? "s" : ""} ({resumeParVacation(p.parShift)})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 30 }}>Chargement...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 30, fontSize: 13 }}>Aucune formation pour l'instant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map(it => it.source === "afo" ? (
            <div key={it.key} style={{ background: "var(--bg-card)", border: `1.5px solid ${AMBRE.borderLight}`, borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px var(--shadow-card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{it.intitule}</div>
                    <CategorieChip cat={it.categorie} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, marginTop: 2 }}>
                    📅 {fmtDate(it.date_session)} {it.heure_debut ? `· 🕐 ${fmtHeure(it.heure_debut)}` : ""} {it.lieu ? `· 📍 ${it.lieu}` : ""}
                  </div>
                </div>
                <StatutBadge session={it} />
              </div>
              <RosterLignes session={it} agentId={agentId} />
              {it.message_lancement && (
                <div style={{ marginTop: 8, fontSize: 12, color: AMBRE.accentDark, background: AMBRE.bgLight, border: `1px solid ${AMBRE.borderLight}`, borderRadius: 8, padding: "8px 10px" }}>
                  💬 {it.message_lancement}
                </div>
              )}
              {(() => {
                const notif = notifications.find(n => n.sessionId === it.id);
                if (!notif || notif.acquitte) return null;
                return (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: AMBRE.accentDark, fontWeight: 700 }}>🔔 Ajoutée à ton planning perso — pense à vérifier</span>
                    <button onClick={() => acquitter(it.id)} style={{ ...btnPrimary(AMBRE), padding: "5px 12px", fontSize: 12 }}>✓ Vu</button>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div key={it.key} style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px var(--shadow-card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{it.intitule}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, marginTop: 2 }}>
                    📅 {fmtDate(it.date)} {it.organisme ? `· ${it.organisme}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "3px 9px", background: "#f1f5f9", color: "#475569" }}>
                  {it.format === "e-learning" ? "💻 E-learning" : "📋 Externe"}
                </span>
              </div>
              <button onClick={() => retirerPerso(it.id)} style={{ marginTop: 8, background: "none", border: "none", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer", padding: 0 }}>
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

  if (loading) return <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 30 }}>Chargement...</div>;

  return (
    <div>
      {err && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>⚠️ {err}</div>}
      {sessionsFormateur.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", fontStyle: "italic", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
          Aucune session en tant que formateur pour l'instant.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessionsFormateur.map(s => (
            <div key={s.id} onClick={() => onGoToSession(s.id)}
              style={{ cursor: "pointer", background: "var(--bg-card)", border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 13 }}>{s.intitule}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, marginTop: 2 }}>📅 {fmtDate(s.date_session)} {s.heure_debut ? `· 🕐 ${fmtHeure(s.heure_debut)}` : ""} {s.lieu ? `· 📍 ${s.lieu}` : ""} · 👥 {s.participants.length} inscrit(s)</div>
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
                style={{ flex: 1, padding: 8, border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, background: form.format === k ? AMBRE.from : "var(--bg-card)", color: form.format === k ? "#fff" : "var(--text-secondary)" }}>
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
// GestionTab (le sous-menu "Gestion" avec son propre Catalogue/Sessions
// imbriqué) a été retiré le 11/09 -- Catalogue et Sessions sont désormais
// deux onglets directs de AfoView (voir plus haut), le state du catalogue
// vit au niveau de AfoView et est partagé entre eux.

// 26/08 (Olivier : "propose-moi" une presentation en colonne pour le
// catalogue) : vraie grille de colonnes par categorie (Intitulé / Durée /
// Format / Statut / Actions) au lieu d'une pile de cartes -- un `display:grid`
// a colonnes fixes plutot qu'une vraie balise <table> (coherent avec le reste
// du fichier, 100% style inline). Chaque ligne est cliquable et ouvre le
// nouveau CouvertureModal (qui est deja forme / pas encore, point 4 de la
// demande du 26/08) -- edition/archivage restent des boutons a part
// (stopPropagation, sinon un clic sur "✏️" ouvrirait aussi la couverture).
const CAT_COLS = "1fr 64px 96px 74px 78px 70px";
function CatalogueSection({ catalogue, loading, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState(null);
  const [couvertureId, setCouvertureId] = useState(null);
  // Vue globale de couverture (15/09, Olivier : "pas tres clair de voir la
  // situation globale") -- un seul fetch au montage (endpoint déjà AFO-only,
  // déjà existant, aucun endpoint dédié créé) plutôt qu'un appel par ligne de
  // catalogue. couvertureParFormation : Map(catalogue_id -> pct).
  const [couvertureStats, setCouvertureStats] = useState(null);
  useEffect(() => { api.formation.getStats().then(setCouvertureStats).catch(() => {}); }, []);
  const couvertureParFormation = {};
  if (couvertureStats?.totalAgentsActifs) {
    couvertureStats.parFormation.forEach(f => {
      couvertureParFormation[f.catalogue_id] = (f.agents.length / couvertureStats.totalAgentsActifs) * 100;
    });
  }

  const nbActives = catalogue.filter(c => c.statut !== "archive").length;
  const nbArchivees = catalogue.filter(c => c.statut === "archive").length;

  return (
    <div>
      {/* Tuiles résumé (15/09, refonte visuelle -- repère immédiat avant de
          scroller le détail, réutilise StatTuile déjà défini plus bas). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8, marginBottom: 14, maxWidth: 260 }}>
        <StatTuile label="Actives" value={nbActives} />
        <StatTuile label="Archivées" value={nbArchivees} />
      </div>
      <button onClick={() => { setEdit(null); setShowForm(v => !v); }} style={{ ...btnPrimary(NAVY), marginBottom: 14 }}>
        {showForm ? "✕ Annuler" : "+ Nouvelle formation"}
      </button>
      {showForm && <CatalogueForm initial={edit} onCancel={() => setShowForm(false)} onSaved={() => { setShowForm(false); onChange(); }} />}

      {loading ? (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 30 }}>Chargement...</div>
      ) : CATEGORIES.map(cat => {
        const items = catalogue.filter(c => c.categorie === cat);
        if (!items.length) return null;
        return (
          <div key={cat} style={{ marginBottom: 18 }}>
            <div style={{ marginBottom: 8 }}><CategorieChip cat={cat} /></div>

            {/* Desktop/tablette : vraie grille de colonnes (masquée sous 640px, voir theme.css) */}
            <div className="f2ppmp-cat-desktop" style={{ border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden", overflowX: "auto" }}>
              <div style={{ minWidth: 460 }}>
                <div style={{ display: "grid", gridTemplateColumns: CAT_COLS, gap: 8, padding: "8px 12px", background: "var(--bg-page)", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: .3, borderBottom: "1.5px solid var(--border)" }}>
                  <span>Intitulé</span><span>Durée</span><span>Format</span><span>Couv.</span><span>Statut</span><span>Actions</span>
                </div>
                {items.map((f, i) => (
                  <div key={f.id} onClick={() => setCouvertureId(f.id)}
                    style={{ display: "grid", gridTemplateColumns: CAT_COLS, gap: 8, alignItems: "center", padding: "9px 12px", cursor: "pointer", opacity: f.statut === "archive" ? 0.55 : 1, background: "var(--bg-card)", borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{f.intitule}{f.obligatoire ? " ⭐" : ""}</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{f.duree || "—"}</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{f.format || "—"}</span>
                    <CouvertureBadge pct={couvertureParFormation[f.id]} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: f.statut === "archive" ? "var(--text-muted)" : "#15803d" }}>{f.statut === "archive" ? "Archivée" : "Active"}</span>
                    <span style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setEdit(f); setShowForm(true); }} title="Modifier" style={{ ...btnSecondary, padding: "4px 8px", fontSize: 12 }}>✏️</button>
                      <button onClick={() => api.formation.updateCatalogue(f.id, { statut: f.statut === "archive" ? "actif" : "archive" }).then(onChange)}
                        title={f.statut === "archive" ? "Réactiver" : "Archiver"} style={{ ...btnSecondary, padding: "4px 8px", fontSize: 12 }}>
                        {f.statut === "archive" ? "↺" : "📦"}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile (<640px, 26/08 -- Olivier : "la vue telephone est pas
                tres lisible les colonne sont pas aligné [...] il faut
                glisser pour tout voir" -- 5 colonnes fixes ne rentrent pas
                sur un ecran etroit sans scroll horizontal) : cartes
                empilees, jamais de scroll horizontal, meme comportement au
                clic (ouvre CouvertureModal). */}
            <div className="f2ppmp-cat-mobile" style={{ flexDirection: "column", gap: 8 }}>
              {items.map(f => (
                <div key={f.id} onClick={() => setCouvertureId(f.id)}
                  style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 12px", cursor: "pointer", opacity: f.statut === "archive" ? 0.55 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{f.intitule}{f.obligatoire ? " ⭐" : ""}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: f.statut === "archive" ? "var(--text-muted)" : "#15803d", whiteSpace: "nowrap" }}>{f.statut === "archive" ? "Archivée" : "Active"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{[f.duree, f.format].filter(Boolean).join(" · ") || "—"}</span>
                    <CouvertureBadge pct={couvertureParFormation[f.id]} />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setEdit(f); setShowForm(true); }} title="Modifier" style={{ ...btnSecondary, padding: "5px 10px", fontSize: 12 }}>✏️ Modifier</button>
                    <button onClick={() => api.formation.updateCatalogue(f.id, { statut: f.statut === "archive" ? "actif" : "archive" }).then(onChange)}
                      title={f.statut === "archive" ? "Réactiver" : "Archiver"} style={{ ...btnSecondary, padding: "5px 10px", fontSize: 12 }}>
                      {f.statut === "archive" ? "↺ Réactiver" : "📦 Archiver"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!loading && catalogue.length === 0 && <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 30, fontSize: 13 }}>Aucune formation au catalogue.</div>}

      {couvertureId && <CouvertureModal catalogueId={couvertureId} onClose={() => setCouvertureId(null)} />}
    </div>
  );
}

// 26/08 -- suivi de couverture d'une formation (point 4) : qui l'a deja
// suivie (avec la date la plus recente), qui ne l'a pas encore suivie. Scope
// = tous les agents actifs (choix confirme par Olivier), pas filtre par
// famille -- il juge lui-meme qui est concerne. Reutilise exactement la meme
// regle de presence reelle que les stats (un declin retire l'agent de
// "formes" sans action manuelle).
function CouvertureModal({ catalogueId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    api.formation.getCouvertureFormation(catalogueId).then(setData).catch(() => setErr("Impossible de charger la couverture")).finally(() => setLoading(false));
  }, [catalogueId]);

  const total = data ? data.formes.length + data.nonFormes.length : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 750, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--bg-card)", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
        <div style={{ background: `linear-gradient(135deg,${NAVY.from},${NAVY.to})`, padding: "16px 20px", position: "sticky", top: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#fff" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{data?.catalogue?.intitule || "..."}</div>
            {data && (
              <div style={{ fontSize: 12, opacity: .85 }}>
                {data.formes.length}/{total} formé(s){(data.demandesEia||[]).length > 0 ? ` · 🙋 ${data.demandesEia.length} demande(s) EIA` : ""}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 10, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          {loading ? <div style={{ textAlign: "center", color: "var(--text-secondary)" }}>Chargement...</div> : err ? (
            <div style={{ color: "#b91c1c", fontSize: 12.5 }}>⚠️ {err}</div>
          ) : (
            <>
              {/* 15/09 (EIA) : qui a demandé CETTE formation en EIA cette
                  année -- sert à l'AFO/ASFP pour regrouper des agents et
                  déclencher une session (voir aussi le bouton "+ Ajouter
                  tous les demandeurs EIA" de SessionForm). N'apparaît que
                  s'il y a au moins une demande, pour ne pas alourdir la
                  modale sur une formation jamais demandée en EIA.
                  16/09 (Olivier : "il faut mettre les demande en 1er [...]
                  je trouve le panneau pas tres lisible") -- remontée en
                  PREMIER (avant "déjà formés"/"pas encore formés", ordre
                  d'origine) : c'est l'info la plus actionnable pour l'AFO/
                  ASFP qui ouvre ce panneau (décider de déclencher une
                  session) -- et chaque section a désormais un vrai filet de
                  séparation (borderTop), pour ne plus lire les 3 listes
                  comme un seul bloc continu. */}
              {(data.demandesEia||[]).length > 0 && (
                <div style={{ marginBottom: 20, paddingBottom: 18, borderBottom: "1.5px solid var(--border)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed", marginBottom: 8 }}>🙋 Ont demandé en EIA cette année ({data.demandesEia.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {data.demandesEia.map(a => (
                      <div key={a.cp} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "5px 10px", borderRadius: 6, background: "var(--bg-page)" }}>
                        <span style={{ color: "var(--text-primary)" }}>{a.prenom} {a.nom}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: a.realisee ? "#15803d" : "#b45309" }}>{a.realisee ? "✅ Réalisée" : "⏳ Demandée"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 20, paddingBottom: 18, borderBottom: "1.5px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d", marginBottom: 8 }}>✅ Déjà formés ({data.formes.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {data.formes.map(a => (
                    <div key={a.cp} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "5px 10px", borderRadius: 6, background: "var(--bg-page)" }}>
                      <span style={{ color: "var(--text-primary)" }}>{a.prenom} {a.nom}</span>
                      <span style={{ color: "var(--text-secondary)" }}>{fmtDate(a.derniere_date)}</span>
                    </div>
                  ))}
                  {data.formes.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Personne pour l'instant.</div>}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#b45309", marginBottom: 8 }}>🕳️ Pas encore formés ({data.nonFormes.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {data.nonFormes.map(a => (
                    <div key={a.cp} style={{ fontSize: 12.5, padding: "5px 10px", borderRadius: 6, background: "var(--bg-page)", color: "var(--text-primary)" }}>{a.prenom} {a.nom}</div>
                  ))}
                  {data.nonFormes.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Tout le monde est formé.</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Fiche agent (15/09, Olivier : "il le faudrait en nominatif sur la fiche
// agent qui sera dans le suivi de la personne par asfp et afo. poste par
// poste avec les dates") -- vue AFO/ASFP unique par agent, réunit sessions
// suivies + formations perso déclarées + étude de poste (poste par poste,
// avec dates) -- jusqu'ici seul l'agent lui-même voyait tout ça réuni (perso,
// "Mes formations"). Même patron de modale que CouvertureModal juste
// au-dessus (overlay + carte + en-tête dégradé), pour rester cohérent.
function FicheAgentModal({ cp, catalogue, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // Besoins EIA (15/09) : mini-formulaire d'ajout, réservé AFO/ASFP (comme
  // le reste de cette fiche) -- côté agent, la même donnée est visible en
  // lecture seule dans "Mes formations" (voir MesFormationsTab).
  const [eiaCatalogueId, setEiaCatalogueId] = useState("");
  const [eiaDate, setEiaDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [eiaErr, setEiaErr] = useState("");
  const [eiaSaving, setEiaSaving] = useState(false);

  const charger = useCallback(() => {
    setLoading(true);
    api.formation.getFicheAgent(cp).then(setData).catch(() => setErr("Impossible de charger la fiche")).finally(() => setLoading(false));
  }, [cp]);
  useEffect(() => { charger(); }, [charger]);

  async function ajouterEia() {
    if (!eiaCatalogueId) return setEiaErr("Choisis une formation");
    setEiaErr(""); setEiaSaving(true);
    try {
      await api.formation.createEia({ cp_agent: cp, catalogue_id: Number(eiaCatalogueId), date_demande: eiaDate });
      setEiaCatalogueId("");
      charger();
    } catch (e) { setEiaErr(e.message || "Erreur"); }
    setEiaSaving(false);
  }
  async function retirerEia(id) {
    try { await api.formation.deleteEia(id); charger(); } catch (e) { setEiaErr(e.message || "Erreur"); }
  }

  // Étude de poste : regroupée par poste (comme la vue perso), mais avec la
  // LISTE COMPLÈTE des dates par poste (pas juste un total) -- c'est
  // précisément ce qui manquait côté AFO/ASFP ("poste par poste avec les
  // dates"). Depuis le 15/09, e.code_poste peut venir de 2 sources au format
  // différent : le perso (code COURT local, ex "CCL") ou CPS Officiel (déjà
  // canonique avec suffixe de vacation, ex "PICCLO") -- resolveJsCode
  // (client.js, déjà exportée) traduit les deux vers le même format attendu
  // par getPosteLabelFromCode (App.jsx) : traduction normale pour un code
  // court, passthrough pour un code déjà canonique.
  const etudeParPoste = {};
  (data?.etudePoste || []).forEach(e => {
    const jsCode = e.code_poste ? resolveJsCode(e.code_poste, e.code_equipe) : null;
    const label = jsCode ? (getPosteLabelFromCode(jsCode) || e.code_poste) : (e.code_poste || "Poste inconnu");
    if (!etudeParPoste[label]) etudeParPoste[label] = [];
    // jsCode résolu gardé sur l'entrée (utilisé ci-dessous pour le repli de
    // libellé de vacation, voir shiftLabelEtude).
    etudeParPoste[label].push({ ...e, _jsCode: jsCode });
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 760, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--bg-card)", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
        <div style={{ background: `linear-gradient(135deg,${NAVY.from},${NAVY.to})`, padding: "16px 20px", position: "sticky", top: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#fff" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{data?.agent ? `${data.agent.prenom} ${data.agent.nom}` : "..."}</div>
            {data && <div style={{ fontSize: 12, opacity: .85 }}>{data.agent.cp}</div>}
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 10, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          {loading ? <div style={{ textAlign: "center", color: "var(--text-secondary)" }}>Chargement...</div> : err ? (
            <div style={{ color: "#b91c1c", fontSize: 12.5 }}>⚠️ {err}</div>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: NAVY.accentDark, marginBottom: 8 }}>🎓 Formations suivies ({data.sessions.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 18 }}>
                {data.sessions.map(s => (
                  <div key={s.session_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12.5, padding: "6px 10px", borderRadius: 6, background: "var(--bg-page)" }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{s.intitule}</span>
                      {!s.toujours_present && s.statut === "lancee" && <span style={{ color: "#b91c1c", fontSize: 10.5, marginLeft: 6 }}>(déclinée)</span>}
                    </div>
                    <span style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{fmtDate(s.date_session)}</span>
                  </div>
                ))}
                {data.sessions.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Aucune session suivie.</div>}
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, color: NAVY.accentDark, marginBottom: 8 }}>📚 Formations déclarées ({data.formationsPerso.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 18 }}>
                {data.formationsPerso.map(f => (
                  <div key={f.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "6px 10px", borderRadius: 6, background: "var(--bg-page)" }}>
                    <span style={{ color: "var(--text-primary)" }}>{f.intitule}{f.organisme ? ` (${f.organisme})` : ""}</span>
                    <span style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{fmtDate(f.date)}</span>
                  </div>
                ))}
                {data.formationsPerso.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Aucune formation perso déclarée.</div>}
              </div>

              {/* Besoins EIA (15/09, Olivier : "la parti eia dans la fiche de
                  l'agent sert a connaitre enregistrer ses demandes") -- saisi
                  ici par l'AFO/ASFP au moment de l'entretien, statut recalculé
                  à chaque lecture (jamais stocké, voir EIA_REALISEE côté
                  backend) : passe automatiquement au vert dès que l'agent a
                  réellement suivi une session de cette même formation, sans
                  action manuelle. */}
              <div style={{ fontSize: 12, fontWeight: 700, color: NAVY.accentDark, marginBottom: 8 }}>📋 Besoins EIA ({data.eia.length})</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <select value={eiaCatalogueId} onChange={e => setEiaCatalogueId(e.target.value)} style={{ ...inputStyle, fontSize: 12, flex: 1 }}>
                  <option value="">+ Formation demandée...</option>
                  {(catalogue || []).filter(c => c.statut !== "archive").map(c => <option key={c.id} value={c.id}>{c.intitule}</option>)}
                </select>
                <input type="date" value={eiaDate} onChange={e => setEiaDate(e.target.value)} style={{ ...inputStyle, fontSize: 12, width: "auto" }} />
                <button onClick={ajouterEia} disabled={eiaSaving} style={{ ...btnSecondary, fontSize: 12 }}>{eiaSaving ? "..." : "Ajouter"}</button>
              </div>
              {eiaErr && <div style={{ color: "#dc2626", fontSize: 11.5, marginBottom: 8 }}>⚠️ {eiaErr}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 18 }}>
                {data.eia.map(e => (
                  <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12.5, padding: "6px 10px", borderRadius: 6, background: "var(--bg-page)" }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{e.intitule}</span>
                      <span style={{ color: "var(--text-secondary)" }}> — {fmtDate(e.date_demande)} ({e.annee})</span>
                    </div>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", color: e.realisee ? "#15803d" : "#b45309" }}>{e.realisee ? "✅ Réalisée" : "⏳ Demandée"}</span>
                      <button onClick={() => retirerEia(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 12 }}>✕</button>
                    </span>
                  </div>
                ))}
                {data.eia.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Aucun besoin EIA enregistré.</div>}
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, color: NAVY.accentDark, marginBottom: 8 }}>🧭 Étude de poste ({data.etudePoste.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.entries(etudeParPoste).map(([label, entries]) => {
                  // Sous-groupé par vacation (matinée/soirée/nuit/journée),
                  // demandé par Olivier le 15/09 pour rester lisible sur un
                  // poste avec beaucoup de dates ("la c'est fouilli [...] par
                  // type de poste [...] matinee nuit soiree et les dates") --
                  // chaque vacation garde sa propre liste de dates, déjà
                  // triée du plus récent au plus ancien (ordre d'origine de
                  // data.etudePoste conservé au sein de chaque sous-groupe).
                  const parVacation = {};
                  entries.forEach(e => {
                    const key = shiftKeyEtude(e.code_equipe, e._jsCode) || "?";
                    if (!parVacation[key]) parVacation[key] = [];
                    parVacation[key].push(e);
                  });
                  return (
                    <div key={label} style={{ background: "var(--bg-page)", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>{label} — {entries.length} jour{entries.length > 1 ? "s" : ""}</div>
                      <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 4 }}>
                        {SHIFT_ORDER_ETUDE.filter(s => parVacation[s]?.length).map(s => (
                          <div key={s} style={{ fontSize: 11.5 }}>
                            <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{SHIFT_LABEL_ETUDE[s]} ({parVacation[s].length})</span>
                            <span style={{ color: "var(--text-secondary)" }}> — {parVacation[s].map(e => `${fmtDate(e.date_jour)}${e.source === "cps" ? " (CPS)" : ""}`).join(" · ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {Object.keys(etudeParPoste).length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Aucune journée d'étude de poste.</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CatalogueForm({ initial, onCancel, onSaved }) {
  const [form, setForm] = useState(initial || { categorie: "PRCI", intitule: "", description: "", duree: "", duree_heures: "", format: "", public_cible: "", prerequis: "", obligatoire: false });
  const [dureeJours, setDureeJours] = useState(() => parseDureeJours(initial?.duree));
  const initialFormat = useMemo(() => splitChoixLibre(initial?.format, FORMAT_OPTIONS), [initial]);
  const [formatChoix, setFormatChoix] = useState(initialFormat.choix);
  const [formatAutre, setFormatAutre] = useState(initialFormat.autre);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.intitule.trim()) return setErr("L'intitulé est obligatoire");
    setErr(""); setSaving(true);
    const payload = { ...form, duree: formatDureeJours(dureeJours), format: formatChoix === "Autre" ? formatAutre.trim() : formatChoix };
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
                style={{ flex: 1, padding: 8, border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, background: form.categorie === c ? NAVY.from : "var(--bg-card)", color: form.categorie === c ? "#fff" : "var(--text-secondary)" }}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div><div style={labelStyle}>Intitulé</div><input value={form.intitule} onChange={e => setForm(p => ({ ...p, intitule: e.target.value }))} style={inputStyle} /></div>
        <div><div style={labelStyle}>Description</div><textarea value={form.description || ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "vertical" }} /></div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Durée (jours)</div>
            <input type="number" step="0.5" min="0" value={dureeJours} onChange={e => setDureeJours(e.target.value)} placeholder="ex: 1" style={inputStyle} />
            {dureeJours !== "" && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>Affiché : {formatDureeJours(dureeJours) || "—"}</div>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Durée en heures</div>
            <input type="number" step="0.5" min="0" value={form.duree_heures ?? ""} onChange={e => setForm(p => ({ ...p, duree_heures: e.target.value }))} placeholder="ex: 7" style={inputStyle} />
          </div>
        </div>
        <div>
          <div style={labelStyle}>Format</div>
          <ChoixLibre options={FORMAT_OPTIONS} choix={formatChoix} onChoix={setFormatChoix} autre={formatAutre} onAutre={setFormatAutre} famille={NAVY} />
        </div>
        <div><div style={labelStyle}>Public cible</div><input value={form.public_cible || ""} onChange={e => setForm(p => ({ ...p, public_cible: e.target.value }))} style={inputStyle} /></div>
        <div><div style={labelStyle}>Prérequis</div><input value={form.prerequis || ""} onChange={e => setForm(p => ({ ...p, prerequis: e.target.value }))} style={inputStyle} /></div>
        <button onClick={() => setForm(p => ({ ...p, obligatoire: !p.obligatoire }))}
          style={{ padding: 8, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, background: form.obligatoire ? NAVY.from : "var(--bg-card)", color: form.obligatoire ? "#fff" : "var(--text-secondary)", border: `1px solid ${NAVY.borderLight}` }}>
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
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 30 }}>Chargement...</div>
      ) : sessions.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 30, fontSize: 13 }}>Aucune session.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.map(s => (
            <div key={s.id} onClick={() => setOpenId(s.id)}
              style={{ cursor: "pointer", background: "var(--bg-card)", border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 13 }}>{s.intitule}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, marginTop: 2 }}>📅 {fmtDate(s.date_session)} {s.heure_debut ? `· 🕐 ${fmtHeure(s.heure_debut)}` : ""} {s.lieu ? `· 📍 ${s.lieu}` : ""} · 👥 {s.nb_participants} inscrit(s)</div>
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

// 26/08 (Olivier : "programmer des date de formation avec des participants
// c'est pas intuitif") : formulaire regroupé en 3 sections visuellement
// distinctes (sous-titres) -- Quoi & quand / Qui anime / Qui participe --
// reste un seul écran (pas un wizard multi-étapes), juste mieux scanné. Le
// vrai point de friction (composer la liste de participants un par un) est
// adressé par "+ Ajouter tous les non-formés" : appelle la même couverture
// que CouvertureModal pour la formation choisie et précoche d'un coup tous
// les agents qui ne l'ont pas encore suivie -- l'AFO peut ensuite affiner à
// la main comme avant.
function FormSectionTitle({ children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent-active)", textTransform: "uppercase", letterSpacing: .3, marginTop: 4 }}>{children}</div>;
}

function SessionForm({ catalogue, agents, onCancel, onSaved }) {
  const [form, setForm] = useState({ catalogue_id: catalogue[0]?.id || "", date_session: "", heure_debut: "" });
  const [lieuChoix, setLieuChoix] = useState("PRCI");
  const [lieuAutre, setLieuAutre] = useState("");
  const [formateurs, setFormateurs] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [chargementNonFormes, setChargementNonFormes] = useState(false);
  const [chargementEia, setChargementEia] = useState(false);

  const afos = agents.filter(a => a.is_afo || a.is_asfp);
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

  async function ajouterNonFormes() {
    if (!form.catalogue_id) return setErr("Choisis d'abord une formation du catalogue");
    setErr(""); setChargementNonFormes(true);
    try {
      const cov = await api.formation.getCouvertureFormation(form.catalogue_id);
      const cps = cov.nonFormes.map(a => a.cp);
      setParticipants(p => Array.from(new Set([...p, ...cps])));
    } catch (e) { setErr(e.message || "Erreur"); }
    setChargementNonFormes(false);
  }

  // 15/09 (EIA, Olivier : "en faisant des tri par formation demandé en eia
  // [...] il peut regroupe des agent pour declencher un formation") -- même
  // principe que ajouterNonFormes, mais précoche les agents qui ont demandé
  // CETTE formation en EIA cette année (déjà réalisées incluses -- l'AFO
  // garde la main pour les retirer lui-même si redondant).
  async function ajouterDemandesEia() {
    if (!form.catalogue_id) return setErr("Choisis d'abord une formation du catalogue");
    setErr(""); setChargementEia(true);
    try {
      const cov = await api.formation.getCouvertureFormation(form.catalogue_id);
      const cps = (cov.demandesEia || []).map(a => a.cp);
      setParticipants(p => Array.from(new Set([...p, ...cps])));
    } catch (e) { setErr(e.message || "Erreur"); }
    setChargementEia(false);
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
        <FormSectionTitle>🗓️ Quoi & quand</FormSectionTitle>
        <div>
          <div style={labelStyle}>Formation du catalogue</div>
          <select value={form.catalogue_id} onChange={e => setForm(p => ({ ...p, catalogue_id: Number(e.target.value) }))} style={inputStyle}>
            {catalogue.filter(c => c.statut !== "archive").map(c => <option key={c.id} value={c.id}>{c.categorie} — {c.intitule}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><div style={labelStyle}>Date</div><input type="date" value={form.date_session} onChange={e => setForm(p => ({ ...p, date_session: e.target.value }))} style={inputStyle} /></div>
          <div style={{ flex: 1 }}><div style={labelStyle}>Heure de début (optionnel)</div><input type="time" value={form.heure_debut} onChange={e => setForm(p => ({ ...p, heure_debut: e.target.value }))} style={inputStyle} /></div>
        </div>
        <div>
          <div style={labelStyle}>Lieu</div>
          <ChoixLibre options={LIEU_OPTIONS} choix={lieuChoix} onChoix={setLieuChoix} autre={lieuAutre} onAutre={setLieuAutre} famille={NAVY} />
        </div>

        <FormSectionTitle>👨‍🏫 Qui anime</FormSectionTitle>
        <div>
          <div style={labelStyle}>Formateurs (jusqu'à 3)</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {afos.map(a => (
              <button key={a.id} onClick={() => toggleFormateur(a.id)}
                style={{ padding: "6px 12px", borderRadius: 20, border: "1px solid " + (formateurs.includes(a.id) ? NAVY.from : "var(--border)"), cursor: "pointer", fontSize: 12, fontWeight: 600, background: formateurs.includes(a.id) ? NAVY.from : "var(--bg-card)", color: formateurs.includes(a.id) ? "#fff" : "var(--text-secondary)" }}>
                {a.prenom} {a.nom}
              </button>
            ))}
            {afos.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Aucun agent AFO pour l'instant.</div>}
          </div>
        </div>

        <FormSectionTitle>👥 Qui participe</FormSectionTitle>
        <div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <button type="button" onClick={ajouterNonFormes} disabled={chargementNonFormes}
              style={{ ...btnSecondary, fontSize: 12, background: AMBRE.bgLight, color: AMBRE.accentDark, border: `1px solid ${AMBRE.borderLight}` }}>
              {chargementNonFormes ? "..." : "+ Ajouter tous les non-formés"}
            </button>
            <button type="button" onClick={ajouterDemandesEia} disabled={chargementEia}
              style={{ ...btnSecondary, fontSize: 12, background: "#f3e8ff", color: "#7c3aed", border: "1px solid #d8b4fe" }}>
              {chargementEia ? "..." : "+ Ajouter tous les demandeurs EIA"}
            </button>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher un agent..." style={{ ...inputStyle, marginBottom: 8 }} />
          <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, border: "1px solid var(--border)", borderRadius: 8, padding: 6, background: "var(--bg-card)" }}>
            {filtered.map(a => (
              <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 6px", cursor: "pointer", color: "var(--text-primary)" }}>
                <input type="checkbox" checked={participants.includes(a.id)} onChange={() => toggleParticipant(a.id)} />
                {a.prenom} {a.nom} <span style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>{a.id}</span>
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>{participants.length} sélectionné(s)</div>
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
  const [heureDebut, setHeureDebut] = useState("");
  const [savingHeure, setSavingHeure] = useState(false);
  const [savingMsg, setSavingMsg] = useState(false);

  const charger = useCallback(() => {
    setLoading(true);
    api.formation.getSessionDetail(sessionId).then(d => { setData(d); setMsg(d.session.message_lancement || ""); setHeureDebut(fmtHeure(d.session.heure_debut)); }).catch(() => setErr("Impossible de charger la session")).finally(() => setLoading(false));
  }, [sessionId]);
  useEffect(() => { charger(); }, [charger]);

  async function lancer() {
    setErr("");
    try {
      await api.formation.lancerSession(sessionId, msg);
      charger(); onChanged(); refreshProfil?.(); refreshSchedule?.();
    } catch (e) { setErr(e.message || "Erreur"); }
  }
  // 26/08 (Olivier : "il faudrait une case heure de debut que le formateur
  // renseigne") -- editable a tout moment (pas seulement avant lancement,
  // contrairement a la date qui elle reste figee une fois le planning des
  // participants deja ecrit).
  async function sauvegarderHeure() {
    setErr(""); setSavingHeure(true);
    try { await api.formation.updateSession(sessionId, { heure_debut: heureDebut || null }); charger(); onChanged(); }
    catch (e) { setErr(e.message || "Erreur"); }
    setSavingHeure(false);
  }
  // 26/08 (Olivier : "lorsqu'une formation est planifié, ou meme lancé, le
  // formateur peut mettre un message libre pour les participant") -- avant
  // ce jour, le message n'etait modifiable qu'au moment du lancement (bloc
  // ci-dessous, statut==="planifiee"). Reste editable une fois lancee, via un
  // bouton dedie (le message affiche cote participant vient directement de
  // message_lancement, relu a chaque ouverture de "Mes formations" -- pas
  // besoin d'un nouveau mecanisme de notification pour qu'ils le voient).
  async function sauvegarderMessage() {
    setErr(""); setSavingMsg(true);
    try { await api.formation.updateSession(sessionId, { message_lancement: msg }); charger(); onChanged(); }
    catch (e) { setErr(e.message || "Erreur"); }
    setSavingMsg(false);
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

  const afos = agents.filter(a => (a.is_afo || a.is_asfp) && !data?.formateurs.some(f => f.cp === a.id));
  const nonInscrits = agents.filter(a => !data?.participants.some(p => p.cp_agent === a.id));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--bg-card)", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
        <div style={{ background: `linear-gradient(135deg,${NAVY.from},${NAVY.to})`, padding: "16px 20px", position: "sticky", top: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#fff" }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{data?.session?.intitule || "..."}</div>
            <div style={{ fontSize: 12, opacity: .85 }}>{data ? `${fmtDate(data.session.date_session)}${data.session.heure_debut ? " · " + fmtHeure(data.session.heure_debut) : ""}${data.session.lieu ? " · " + data.session.lieu : ""}` : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 10, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          {loading ? <div style={{ textAlign: "center", color: "var(--text-secondary)" }}>Chargement...</div> : !data ? null : (
            <>
              {err && <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>{err}</div>}

              <div style={{ marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <StatutBadge session={data.session} />
                <button onClick={supprimer} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer" }}>🗑 Supprimer la session</button>
              </div>

              <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: "var(--accent-active)" }}>👨‍🏫 Formateurs</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, marginBottom: 10 }}>
                {data.formateurs.map(f => (
                  <span key={f.cp} style={{ fontSize: 12, background: NAVY.bgLight, color: NAVY.accentDark, borderRadius: 20, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                    {f.prenom} {f.nom}
                    <button onClick={() => retirerFormateur(f.cp)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 12 }}>✕</button>
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

              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-active)" }}>👥 Participants ({data.participants.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, marginBottom: 10 }}>
                {data.participants.map(p => (
                  <div key={p.cp_agent} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 8px", borderRadius: 6, background: data.session.statut === "lancee" && !p.toujours_present ? "#fef2f2" : "var(--bg-page)" }}>
                    <span style={{ textDecoration: data.session.statut === "lancee" && !p.toujours_present ? "line-through" : "none", color: data.session.statut === "lancee" && !p.toujours_present ? "#b91c1c" : "var(--text-primary)" }}>
                      {p.prenom} {p.nom}
                      {data.session.statut === "lancee" && !p.toujours_present && <span style={{ marginLeft: 6, fontWeight: 700 }}>⚠️ a retiré la formation de son planning</span>}
                    </span>
                    <button onClick={() => retirerParticipant(p.cp_agent)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>✕</button>
                  </div>
                ))}
                {data.participants.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Aucun participant.</div>}
              </div>
              <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
                <select value={addParticipantCp} onChange={e => setAddParticipantCp(e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
                  <option value="">+ ajouter un participant...</option>
                  {nonInscrits.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
                </select>
                <button onClick={ajouterParticipant} style={{ ...btnSecondary, fontSize: 12 }}>OK</button>
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-active)", marginBottom: 6 }}>🕐 Heure de début</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                <input type="time" value={heureDebut} onChange={e => setHeureDebut(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
                <button onClick={sauvegarderHeure} disabled={savingHeure} style={{ ...btnSecondary, fontSize: 12 }}>{savingHeure ? "..." : "Enregistrer"}</button>
              </div>

              {(data.session.statut === "planifiee" || data.session.statut === "lancee") && (
                <>
                  <div style={labelStyle}>Message {data.session.statut === "planifiee" ? "de lancement (optionnel)" : "pour les participants"}</div>
                  <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", marginBottom: 10 }} placeholder="Visible par les participants" />
                  {data.session.statut === "planifiee" ? (
                    <>
                      <button onClick={lancer} style={{ ...btnPrimary(NAVY), width: "100%" }}>🚀 Lancer la session</button>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>Ajoute "🎓 Formation" en plus du contenu déjà présent dans le planning de chaque participant (rien n'est jamais écrasé) et les prévient. Chaque agent valide sa venue en libérant sa journée depuis son planning perso.</div>
                    </>
                  ) : (
                    <button onClick={sauvegarderMessage} disabled={savingMsg} style={{ ...btnPrimary(NAVY), width: "100%" }}>{savingMsg ? "..." : "💾 Mettre à jour le message"}</button>
                  )}
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

// 26/08 -- mini-tuile de stat (reprend le principe deja utilise dans
// StatsEquipeView.jsx, pas le composant -- juste le meme esprit "valeur en
// avant, libelle discret dessous").
function StatTuile({ label, value }) {
  return (
    <div style={{ background: "var(--bg-page)", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 1, textTransform: "uppercase", letterSpacing: .2 }}>{label}</div>
    </div>
  );
}

function StatsTab({ agents, catalogue }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [couvertureId, setCouvertureId] = useState(null);
  // 15/09 -- roster "Par agent" (Olivier : "tu peut faire une parti stat par
  // agent ? avec la liste des agents ayant eu une formation ? et la
  // possiblite de faire un tri pat formation ou les agents ayant eu des
  // etudes de postes ?") -- filtre par formation + tri, purement client
  // (data.parAgent deja calcule cote serveur, aucun nouvel appel reseau).
  const [filtreFormation, setFiltreFormation] = useState("");
  const [filtreEtude, setFiltreEtude] = useState(false);
  const [triAgent, setTriAgent] = useState("nom");
  // Fiche agent (15/09, Olivier : "il le faudrait en nominatif sur la fiche
  // agent [...] poste par poste avec les dates") -- recherche d'agent, même
  // principe que la recherche déjà présente ailleurs dans l'appli (Annuaire).
  const [ficheSearch, setFicheSearch] = useState("");
  const [ficheAgentCp, setFicheAgentCp] = useState(null);
  const ficheResultats = ficheSearch.trim().length >= 2
    ? (agents || []).filter(a => `${a.prenom} ${a.nom} ${a.id}`.toLowerCase().includes(ficheSearch.trim().toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    api.formation.getStats().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 30 }}>Chargement...</div>;
  if (!data) return <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 30, fontSize: 13 }}>Impossible de charger les statistiques.</div>;

  const parAgentAffiche = (data.parAgent || [])
    .filter(a => !filtreFormation || a.formations.some(f => String(f.catalogue_id) === filtreFormation))
    .filter(a => !filtreEtude || a.etudePosteJours > 0)
    .slice()
    .sort((x, y) => {
      if (triAgent === "nbFormations") return y.formations.length - x.formations.length || x.nom.localeCompare(y.nom);
      if (triAgent === "etude") return (y.etudePosteJours || 0) - (x.etudePosteJours || 0) || x.nom.localeCompare(y.nom);
      return x.nom.localeCompare(y.nom) || x.prenom.localeCompare(y.prenom);
    });

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-active)", marginBottom: 8 }}>👤 Fiche agent</div>
      <div style={{ position: "relative", marginBottom: 20 }}>
        <input
          value={ficheSearch}
          onChange={e => setFicheSearch(e.target.value)}
          placeholder="🔍 Rechercher un agent (nom, prénom, CP)…"
          style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 9, fontSize: 13, outline: "none", background: "var(--bg-card)", color: "var(--text-primary)" }}
        />
        {ficheResultats.length > 0 && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--bg-card)", border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 9, boxShadow: "0 4px 14px rgba(15,23,42,.12)", zIndex: 20, overflow: "hidden" }}>
            {ficheResultats.map(a => (
              <div key={a.id} onClick={() => { setFicheAgentCp(a.id); setFicheSearch(""); }}
                style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "var(--text-primary)", borderBottom: "1px solid var(--border)" }}>
                {a.prenom} {a.nom} <span style={{ color: "var(--text-muted)", fontSize: 11 }}>({a.id})</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {ficheAgentCp && <FicheAgentModal cp={ficheAgentCp} catalogue={catalogue} onClose={() => setFicheAgentCp(null)} />}

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-active)", marginBottom: 8 }}>👥 Par agent</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <select value={filtreFormation} onChange={e => setFiltreFormation(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12 }}>
          <option value="">Toutes les formations</option>
          {data.parFormation.filter(f => f.agents.length > 0).map(f => (
            <option key={f.catalogue_id} value={f.catalogue_id}>{f.intitule}</option>
          ))}
        </select>
        <select value={triAgent} onChange={e => setTriAgent(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12 }}>
          <option value="nom">Trier : Nom (A→Z)</option>
          <option value="nbFormations">Trier : Nb de formations</option>
          <option value="etude">Trier : Jours d'étude de poste</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, cursor: "pointer" }}>
          <input type="checkbox" checked={filtreEtude} onChange={e => setFiltreEtude(e.target.checked)} />
          Uniquement avec étude de poste
        </label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {parAgentAffiche.map(a => (
          <div key={a.cp} onClick={() => setFicheAgentCp(a.cp)} style={{ background: "var(--bg-card)", border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{a.prenom} {a.nom}</div>
              {a.etudePosteJours > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", background: "#f3e8ff", borderRadius: 999, padding: "2px 8px" }}>🎓 {a.etudePosteJours}j étude de poste</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {a.formations.map(f => (
                <span key={f.catalogue_id} style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px" }}>{f.intitule}</span>
              ))}
            </div>
          </div>
        ))}
        {(data.parAgent || []).length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Aucun agent formé ni en étude de poste pour l'instant.</div>}
        {(data.parAgent || []).length > 0 && parAgentAffiche.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Aucun agent ne correspond à ce filtre.</div>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-active)", marginBottom: 8 }}>📖 Par formation</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {data.parFormation.map(f => (
          <div key={f.catalogue_id} style={{ background: "var(--bg-card)", border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{f.intitule}</div>
                <CategorieChip cat={f.categorie} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, marginTop: 2 }}>{f.nb_sessions} session(s) · {f.agents.length} agent(s) formé(s){f.nbDemandesEia > 0 ? ` · 🙋 ${f.nbDemandesEia} demande(s) EIA` : ""}</div>
            </div>
            <button onClick={() => setCouvertureId(f.catalogue_id)} style={{ ...btnSecondary, fontSize: 12, padding: "6px 12px" }}>Voir le détail</button>
          </div>
        ))}
        {data.parFormation.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Aucune donnée.</div>}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-active)", marginBottom: 8 }}>📅 Répartition annuelle (catégorie × source)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
        {data.parAnneeCategorieSource.map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, background: "var(--bg-card)", borderRadius: 8, padding: "6px 12px", color: "var(--text-secondary)", fontWeight: 500 }}>
            <span>{r.annee} · {r.categorie}</span>
            <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{r.nbAgents} agent(s)</span>
          </div>
        ))}
        {data.parAnneeCategorieSource.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Aucune donnée.</div>}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-active)", marginBottom: 8 }}>🎓 Par AFO (visible par tous les AFO)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.parAfo.map(a => {
          const totalJours = Object.values(a.joursParAn).reduce((s, n) => s + n, 0);
          const totalHeures = Object.values(a.heuresParAn).reduce((s, n) => s + n, 0);
          return (
            <div key={a.cp} style={{ background: "var(--bg-card)", border: `1.5px solid ${NAVY.borderLight}`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)", marginBottom: 8 }}>{a.prenom} {a.nom}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                <StatTuile label="Sessions" value={a.nbSessions} />
                <StatTuile label="Jours" value={totalJours} />
                <StatTuile label="Heures" value={totalHeures % 1 === 0 ? totalHeures : totalHeures.toFixed(1)} />
                <StatTuile label="Agents formés" value={a.agentsFormesGlobal} />
              </div>
            </div>
          );
        })}
        {data.parAfo.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Aucun AFO pour l'instant.</div>}
      </div>

      {couvertureId && <CouvertureModal catalogueId={couvertureId} onClose={() => setCouvertureId(null)} />}
    </div>
  );
}
