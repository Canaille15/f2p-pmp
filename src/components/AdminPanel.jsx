// ─── AdminPanel.jsx ───────────────────────────────────────────────────────────
// Panneau d'administration F2P.PMP
// Fonctions : liste agents, créer, supprimer, réinitialiser PIN
// À placer dans : src/components/AdminPanel.jsx
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import api from "../api/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const GRADES = ["CO4","CO5","CP4NIV1","CP4NIV2","CP5NIV1","CP5NIV2","CP5NIV3","CP6NIV1","CP6NIV2","CP7NIV1","CO6"];
const FAMILLES = ["PRCI","PAR"];

// Table de libellés + ordre recopiés depuis HAB_PRCI/HAB_PAR (App.jsx, non
// exportés) — même convention que StatsEquipeView.jsx. Ici PPRCI est gardé
// (contrairement à Stat'Equip) : c'est un vrai code de la table habilitation,
// l'éditeur admin doit pouvoir le cocher/décocher comme les autres.
const HAB_LABELS = {
  PICCL: "CCL", PIADJ: "Adj CCL", PILNE: "AC LNE", PILNO: "AC LNO", PILCL: "AC LC", PIVGD: "AC VGD",
  PIPA1J: "Pauseur CCL", PIPA2J: "Pauseur Adjoint", PIPA3J: "Pauseur VGD",
  PIDPXJ: "DPX PRCI", PIASSJ: "Adj DPX", PPRCI: "PPRCI", AFOPRCI: "AFO PRCI",
  "A-PRCI": "A-PRCI", "SD%": "SD",
  "PAAC1-": "AC PAR", "PAAC2-": "Aide AC PAR", PAACXX: "CT AC Travaux",
  PAPAUJ: "Pauseur PAR", PADPXJ: "DPX PAR", PAASMJ: "ASMTE PAR", "AFO PAR": "AFO PAR",
};
const HAB_ORDER = [
  "PICCL", "PIADJ", "PILNE", "PILNO", "PILCL", "PIVGD",
  "PIPA1J", "PIPA2J", "PIPA3J", "PIDPXJ", "PIASSJ", "PPRCI", "AFOPRCI", "A-PRCI", "SD%",
  "PAAC1-", "PAAC2-", "PAACXX",
  "PAPAUJ", "PADPXJ", "PAASMJ", "AFO PAR",
];

// ─── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────────

export default function AdminPanel({ currentUser, onAgentsChanged }) {
  const [agents, setAgents]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [familleFilter, setFamilleFilter] = useState("TOUS");
  // Filtre "Réserve régionale" : orthogonal à famille (un réserviste garde sa
  // famille PRCI ou PAR de base, ce filtre s'ajoute plutôt qu'il ne remplace).
  const [reserveOnly, setReserveOnly] = useState(false);
  // Filtre "Formateur AFO" : même principe que Réserve régionale, orthogonal
  // à famille/réserve (un AFO garde sa famille PRCI/PAR de base).
  const [afoOnly, setAfoOnly] = useState(false);
  // Filtre "Admin" : même principe, complète le trio Réserve/AFO (16/08) —
  // sert aussi de "liste des admins" (cliquer réduit la grille aux admins).
  const [adminOnly, setAdminOnly] = useState(false);
  // Filtres "DPX"/"Assistant DPX" (28/08) : même principe, orthogonaux au
  // reste — un DPX garde sa famille/son statut Réserve régionale de base.
  const [dpxOnly, setDpxOnly] = useState(false);
  const [adjointDpxOnly, setAdjointDpxOnly] = useState(false);
  // Statut actif/quitté (16/08) — par défaut on ne montre que les actifs,
  // un agent quitté reste consultable via ce filtre (historique jamais supprimé).
  const [statutFilter, setStatutFilter] = useState("actif");
  const [modal, setModal]             = useState(null); // "create" | { type:"delete"|"reset", agent }
  const [usageOpen, setUsageOpen]     = useState(false); // 02/09 : suivi d'usage anonyme
  const [msg, setMsg]                 = useState(null); // { type:"ok"|"err", text }
  const [pdfBusy, setPdfBusy]         = useState(false);

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

  // ─── Annuaire téléphonique imprimable (29/08, demandé par Olivier) ─────────
  // 2 pages A4 (tri par nom, puis tri par prénom -- pour retrouver quelqu'un
  // quel que soit le côté de la feuille recto/verso qu'on regarde). Tous les
  // agents actifs sont listés (nom+prénom) ; le téléphone n'est imprimé que
  // si l'agent a explicitement activé "Visible sur l'annuaire téléphonique
  // imprimé" dans son profil (case laissée vide sinon -- jamais l'agent
  // retiré de la liste). Génération 100% côté navigateur (pdf-lib, comme les
  // 4 autres générateurs du projet) -- pas de charge serveur.
  async function genererAnnuairePdf() {
    setPdfBusy(true);
    try {
      const liste = await api.annuaire.getPdfData();
      if (!liste || !liste.length) { afficherMsg("err", "Aucun agent à imprimer"); return; }

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 40, GAP = 18;
      const dateGen = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

      // 29/08, suite immédiate (Olivier : "trace les ligne des colonne et
      // agrandi un peu la police mais en gardant tout sur un page" puis
      // "fait un liseré vertical aussi pour separer no et tel") -- grille
      // complète (cadre + séparateurs de colonnes + liseré Nom/Téléphone +
      // ligne sous chaque rangée). Recherche du MEILLEUR compromis colonnes/
      // police : priorité au moins de colonnes possible (donc la colonne la
      // plus large, donc le moins de troncature de nom), la police étant
      // alors déduite pour remplir exactement cette largeur -- un premier
      // essai qui maximisait la police en premier retombait sur 3 colonnes
      // étroites (159pt) au lieu de 2 larges (248pt) dès que l'effectif ne
      // tenait pas tout juste en 2 colonnes à la plus grande taille testée,
      // tronquant les noms à 8 caractères ("AKSSIRI…") -- corrigé.
      function dessinerPage(listeTriee, critereTri) {
        const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        page.drawText("Annuaire téléphonique", { x: MARGIN, y: PAGE_H - 44, size: 17, font: fontBold, color: rgb(0.05, 0.27, 0.5) });
        page.drawText(`Tri par ${critereTri} — généré le ${dateGen}`, { x: MARGIN, y: PAGE_H - 62, size: 9.5, font, color: rgb(0.4, 0.44, 0.5) });

        const tableTop = PAGE_H - 78;
        const headerH = 20;
        const usableH = tableTop - MARGIN - headerH;
        const n = listeTriee.length;

        // Recherche du meilleur compromis, quel que soit l'effectif (29/08,
        // Olivier : "s'il y a plus d'agent ca s'adaptera ?") -- garde la
        // MEILLEURE config rencontrée (fontSize le plus grand) au fil de la
        // boucle plutôt qu'un repli fixe si aucune config confortable
        // (fs>=8) n'est trouvée : la table reste TOUJOURS calculée pour
        // tenir sur une page, même avec un effectif bien plus grand
        // qu'aujourd'hui (jusqu'à ~86 agents en 2 colonnes, ~130 en 3,
        // au-delà la police continue de se réduire proprement en 4-6
        // colonnes plutôt que de risquer un débordement).
        let best = null;
        for (let nc = 1; nc <= 6; nc++) {
          const cw = (PAGE_W - 2 * MARGIN - (nc - 1) * GAP) / nc;
          if (cw < 100) break; // plus de colonnes ne ferait plus qu'empirer la lisibilité, inutile de continuer
          const rpc = Math.ceil(n / nc);
          const fs = Math.min(12, Math.floor((usableH / rpc - 8) * 2) / 2); // arrondi au 0.5 le plus proche
          if (fs < 4) continue; // vraiment illisible à cette largeur, cherche avec plus de colonnes
          if (!best || fs > best.fontSize) best = { fontSize: fs, rowH: fs + 8, rowsPerCol: rpc, nbCols: nc, colW: cw };
          if (fs >= 8) break; // déjà confortable, pas la peine de chercher plus loin
        }
        const { fontSize, rowH, rowsPerCol, nbCols, colW } = best || { fontSize: 4, rowH: 12, rowsPerCol: n, nbCols: 1, colW: PAGE_W - 2 * MARGIN };

        const gridColor = rgb(0.8, 0.83, 0.87);
        const tableHeight = headerH + rowsPerCol * rowH;
        const tableBottom = tableTop - tableHeight;
        const phoneReserve = 88; // place réservée à droite pour un numéro, colonne alignée même si vide
        page.drawRectangle({ x: MARGIN, y: tableBottom, width: PAGE_W - 2 * MARGIN, height: tableHeight, borderColor: gridColor, borderWidth: 1 });
        page.drawLine({ start: { x: MARGIN, y: tableTop - headerH }, end: { x: PAGE_W - MARGIN, y: tableTop - headerH }, thickness: 1, color: gridColor });
        for (let c = 0; c < nbCols; c++) {
          const colX = MARGIN + c * (colW + GAP);
          if (c > 0) page.drawLine({ start: { x: colX - GAP / 2, y: tableTop }, end: { x: colX - GAP / 2, y: tableBottom }, thickness: 1, color: gridColor });
          // Liseré Nom/Téléphone (demandé le 29/08) -- même position que la
          // réserve utilisée plus bas pour aligner le texte du téléphone.
          const xSepTel = colX + colW - phoneReserve;
          page.drawLine({ start: { x: xSepTel, y: tableTop - headerH }, end: { x: xSepTel, y: tableBottom }, thickness: 0.75, color: gridColor });
        }

        // 29/08, suite immédiate (Olivier : "dans le tri par prenom, il faut
        // lire le prenom en 1er") -- l'ordre affiché (Nom Prénom / Prénom
        // Nom) suit désormais le critère de tri de la page, pour rester
        // cohérent avec l'ordre alphabétique réellement appliqué.
        const parPrenom = critereTri === "prénom";
        const headerFontSize = Math.min(9, fontSize);
        for (let c = 0; c < nbCols; c++) {
          const x = MARGIN + c * (colW + GAP) + 6;
          const yH = tableTop - 14;
          page.drawText(parPrenom ? "Prénom NOM" : "NOM Prénom", { x, y: yH, size: headerFontSize, font: fontBold, color: rgb(0.4, 0.44, 0.5) });
          const xTel = MARGIN + c * (colW + GAP) + colW - phoneReserve + 6;
          page.drawText("Téléphone", { x: xTel, y: yH, size: headerFontSize, font: fontBold, color: rgb(0.4, 0.44, 0.5) });
        }

        const maxChars = Math.max(6, Math.floor((colW - 18 - phoneReserve) / (fontSize * 0.52)));
        listeTriee.forEach((a, i) => {
          const col = Math.floor(i / rowsPerCol);
          const row = i % rowsPerCol;
          const colX = MARGIN + col * (colW + GAP);
          const x = colX + 6;
          const rowTop = tableTop - headerH - row * rowH;
          const y = rowTop - rowH * 0.68;
          const nomComplet = parPrenom ? `${a.prenom || ""} ${a.nom || ""}`.trim() : `${a.nom || ""} ${a.prenom || ""}`.trim();
          page.drawText(nomComplet.length > maxChars ? nomComplet.slice(0, maxChars - 1) + "…" : nomComplet, { x, y, size: fontSize, font, color: rgb(0.12, 0.15, 0.2) });
          if (a.telephone) {
            const telW = font.widthOfTextAtSize(a.telephone, fontSize);
            page.drawText(a.telephone, { x: colX + colW - 12 - telW, y, size: fontSize, font, color: rgb(0.12, 0.15, 0.2) });
          }
          if (row < rowsPerCol - 1) {
            page.drawLine({ start: { x: colX, y: rowTop - rowH }, end: { x: colX + colW, y: rowTop - rowH }, thickness: 0.5, color: gridColor });
          }
        });
      }

      dessinerPage([...liste].sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr")), "nom");
      dessinerPage([...liste].sort((a, b) => (a.prenom || "").localeCompare(b.prenom || "", "fr")), "prénom");

      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Annuaire_telephonique_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      afficherMsg("err", e.message || "Erreur lors de la génération du PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  // ─── Filtrage ────────────────────────────────────────────────────────────────
  const agentsFiltres = agents.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.nom?.toLowerCase().includes(q) ||
      a.prenom?.toLowerCase().includes(q) ||
      a.cp?.toLowerCase().includes(q);
    const matchFamille = familleFilter === "TOUS" || a.famille === familleFilter;
    const matchReserve = !reserveOnly || a.is_reserve;
    const matchAfo = !afoOnly || a.is_afo;
    const matchAdmin = !adminOnly || a.is_admin;
    const matchDpx = !dpxOnly || a.is_dpx;
    const matchAdjointDpx = !adjointDpxOnly || a.is_adjoint_dpx;
    const matchStatut = (a.statut || "actif") === statutFilter;
    return matchSearch && matchFamille && matchReserve && matchAfo && matchAdmin && matchDpx && matchAdjointDpx && matchStatut;
  });
  const nbReserve = agents.filter(a => a.is_reserve && (a.statut || "actif") === "actif").length;
  const nbAfo = agents.filter(a => a.is_afo && (a.statut || "actif") === "actif").length;
  const nbAdmin = agents.filter(a => a.is_admin && (a.statut || "actif") === "actif").length;
  const nbDpx = agents.filter(a => a.is_dpx && (a.statut || "actif") === "actif").length;
  const nbAdjointDpx = agents.filter(a => a.is_adjoint_dpx && (a.statut || "actif") === "actif").length;
  const nbQuittes = agents.filter(a => a.statut === "quitte").length;

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
  async function handleToggleReserve(agent) {
    try {
      await api.agents.update(agent.cp, { is_reserve: !agent.is_reserve });
      afficherMsg("ok", `${agent.prenom} ${agent.nom} ${agent.is_reserve ? "n'est plus" : "est maintenant"} en réserve régionale`);
      charger();
      onAgentsChanged?.();
    } catch (e) {
      afficherMsg("err", e.message || "Erreur modification réserve régionale");
    }
  }
  async function handleToggleAfo(agent) {
    try {
      await api.agents.update(agent.cp, { is_afo: !agent.is_afo });
      afficherMsg("ok", `${agent.prenom} ${agent.nom} ${agent.is_afo ? "n'est plus" : "est maintenant"} formateur AFO`);
      charger();
      onAgentsChanged?.();
    } catch (e) {
      afficherMsg("err", e.message || "Erreur modification statut AFO");
    }
  }
  // 28/08, demandé par Olivier ("mettre une case pour dpx et assistant dpx
  // dans les fiches, pour identifier les gens et leurs poste") — remplace,
  // pour le décompte "Encadrement" de Stat'Equip, l'ancien calcul basé sur
  // les habilitations (self-service) : un rôle réel validé par un admin,
  // même principe que Réserve régionale/AFO ci-dessus.
  async function handleToggleDpx(agent) {
    try {
      await api.agents.update(agent.cp, { is_dpx: !agent.is_dpx });
      afficherMsg("ok", `${agent.prenom} ${agent.nom} ${agent.is_dpx ? "n'est plus" : "est maintenant"} DPX`);
      charger();
      onAgentsChanged?.();
    } catch (e) {
      afficherMsg("err", e.message || "Erreur modification statut DPX");
    }
  }
  async function handleToggleAdjointDpx(agent) {
    try {
      await api.agents.update(agent.cp, { is_adjoint_dpx: !agent.is_adjoint_dpx });
      afficherMsg("ok", `${agent.prenom} ${agent.nom} ${agent.is_adjoint_dpx ? "n'est plus" : "est maintenant"} Assistant DPX`);
      charger();
      onAgentsChanged?.();
    } catch (e) {
      afficherMsg("err", e.message || "Erreur modification statut Assistant DPX");
    }
  }
  async function handleToggleRoulement(agent) {
    const nouveau = agent.type_roulement === "Réserve" ? "3x8" : "Réserve";
    try {
      await api.agents.setRoulement(agent.cp, nouveau);
      afficherMsg("ok", `${agent.prenom} ${agent.nom} : ${nouveau === "Réserve" ? "Réserve" : "Roulement"}`);
      charger();
    } catch (e) {
      afficherMsg("err", e.message || "Erreur modification réserve/roulement");
    }
  }
  async function handleDepart(agent, dateDepart) {
    try {
      await api.agents.marquerDepart(agent.cp, dateDepart);
      afficherMsg("ok", `${agent.prenom} ${agent.nom} marqué comme quitté`);
      setModal(null);
      charger();
      onAgentsChanged?.();
    } catch (e) {
      afficherMsg("err", e.message || "Erreur départ agent");
    }
  }
  async function handleReactiver(agent) {
    try {
      await api.agents.reactiver(agent.cp);
      afficherMsg("ok", `${agent.prenom} ${agent.nom} réactivé`);
      charger();
      onAgentsChanged?.();
    } catch (e) {
      afficherMsg("err", e.message || "Erreur réactivation");
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
    <div style={{ padding: "12px", maxWidth: "100%", boxSizing: "border-box", overflowX: "hidden" }}>

      {/* Titre */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>👑 Panneau Admin</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
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

      {/* Barre d'outils — recherche sur sa propre ligne (elle seule prend
          toute la largeur, donc elle ne pousse plus les filtres à la ligne
          suivante), puis une ligne dédiée aux filtres + compteur + création. */}
      <div style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Rechercher un agent..."
          style={{
            width: "100%", boxSizing: "border-box", padding: "8px 12px",
            border: "1.5px solid var(--border)", borderRadius: 8,
            background: "var(--bg-card)", color: "var(--text-primary)",
            fontSize: 13, outline: "none", marginBottom: 10
          }}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FAMILLES.map(f => (
              <button key={f} onClick={() => setFamilleFilter(familleFilter === f ? "TOUS" : f)}
                style={{
                  padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                  background: familleFilter === f ? (f === "PRCI" ? "#1d4ed8" : "#065f46") : "var(--bg-page)",
                  color: familleFilter === f ? "#fff" : "var(--text-secondary)"
                }}>
                {f} ({agents.filter(a => a.famille === f).length})
              </button>
            ))}
            <button onClick={() => setReserveOnly(v => !v)}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                background: reserveOnly ? "#7c3aed" : "var(--bg-page)",
                color: reserveOnly ? "#fff" : "var(--text-secondary)"
              }}>
              🔁 Réserve régionale ({nbReserve})
            </button>
            <button onClick={() => setAfoOnly(v => !v)}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                background: afoOnly ? "#b45309" : "var(--bg-page)",
                color: afoOnly ? "#fff" : "var(--text-secondary)"
              }}>
              🎓 Formateur AFO ({nbAfo})
            </button>
            <button onClick={() => setAdminOnly(v => !v)}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                background: adminOnly ? "#1e293b" : "var(--bg-page)",
                color: adminOnly ? "#fff" : "var(--text-secondary)"
              }}>
              👑 Admin ({nbAdmin})
            </button>
            <button onClick={() => setDpxOnly(v => !v)}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                background: dpxOnly ? "#0f766e" : "var(--bg-page)",
                color: dpxOnly ? "#fff" : "var(--text-secondary)"
              }}>
              🧭 DPX ({nbDpx})
            </button>
            <button onClick={() => setAdjointDpxOnly(v => !v)}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                background: adjointDpxOnly ? "#0d9488" : "var(--bg-page)",
                color: adjointDpxOnly ? "#fff" : "var(--text-secondary)"
              }}>
              🧭 Assistant DPX ({nbAdjointDpx})
            </button>
            <button onClick={() => setStatutFilter(s => s === "actif" ? "quitte" : "actif")}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                background: statutFilter === "quitte" ? "#78716c" : "var(--bg-page)",
                color: statutFilter === "quitte" ? "#fff" : "var(--text-secondary)"
              }}>
              {statutFilter === "quitte" ? `🚪 Quittés (${nbQuittes})` : `🚪 Voir les quittés (${nbQuittes})`}
            </button>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
              {agentsFiltres.length} agent{agentsFiltres.length > 1 ? "s" : ""}
            </span>
            <button onClick={() => setUsageOpen(true)}
              style={{
                background: "var(--bg-page)", color: "var(--text-secondary)", border: "1.5px solid var(--border)",
                borderRadius: 8, padding: "8px 16px", cursor: "pointer",
                fontSize: 13, fontWeight: 700, whiteSpace: "nowrap"
              }}>
              📊 Utilisation
            </button>
            <button onClick={genererAnnuairePdf} disabled={pdfBusy}
              style={{
                background: "var(--bg-page)", color: "var(--text-secondary)", border: "1.5px solid var(--border)",
                borderRadius: 8, padding: "8px 16px", cursor: pdfBusy ? "wait" : "pointer",
                fontSize: 13, fontWeight: 700, whiteSpace: "nowrap"
              }}>
              {pdfBusy ? "⏳ Génération…" : "📇 Annuaire tél. (PDF)"}
            </button>
            <button onClick={() => setModal("create")}
              style={{
                background: "#1e293b", color: "#fff", border: "none",
                borderRadius: 8, padding: "8px 16px", cursor: "pointer",
                fontSize: 13, fontWeight: 700, whiteSpace: "nowrap"
              }}>
              ➕ Nouvel agent
            </button>
          </div>
        </div>
      </div>

      {/* Liste agents — cartes responsive */}
      {loading ? (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40, fontSize: 15 }}>Chargement...</div>
      ) : agentsFiltres.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 30, fontSize: 14 }}>Aucun agent trouvé</div>
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
              {/* Identité */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{
                  width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
                  background: a.famille === "PRCI" ? "#1d4ed8" : "#065f46",
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 800,
                }}>
                  {(a.prenom?.[0] || "") + (a.nom?.[0] || "")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.prenom} {a.nom}
                  </div>
                  <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#334155", background: "#f1f5f9", borderRadius: 5, padding: "1px 7px" }}>{a.cp}</span>
                    <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>{a.grade}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "2px 9px",
                      background: a.famille === "PRCI" ? "#dbeafe" : "#d1fae5",
                      color: a.famille === "PRCI" ? "#1e40af" : "#065f46",
                    }}>{a.famille}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 8px",
                      color: a.has_pin ? "#15803d" : "#b91c1c",
                      background: a.has_pin ? "#dcfce7" : "#fee2e2",
                    }}>
                      {a.has_pin ? "✅ PIN" : "⚠️ Sans PIN"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Statuts — pastilles cliquables (badge + bouton fusionnés, l'état actif se voit et se change au même endroit) */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <button onClick={() => handleToggleAdmin(a)}
                  style={{
                    background: a.is_admin ? "#ede9fe" : "#f8fafc",
                    color: a.is_admin ? "#6d28d9" : "#94a3b8",
                    border: `1px solid ${a.is_admin ? "#c4b5fd" : "#e2e8f0"}`,
                    borderRadius: 20, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  }}>
                  👑 Admin{a.is_admin ? " ✓" : ""}
                </button>
                <button onClick={() => handleToggleReserve(a)}
                  style={{
                    background: a.is_reserve ? "#f5f3ff" : "#f8fafc",
                    color: a.is_reserve ? "#7c3aed" : "#94a3b8",
                    border: `1px solid ${a.is_reserve ? "#ddd6fe" : "#e2e8f0"}`,
                    borderRadius: 20, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  }}>
                  🔁 Réserve régionale{a.is_reserve ? " ✓" : ""}
                </button>
                <button onClick={() => handleToggleAfo(a)}
                  style={{
                    background: a.is_afo ? "#fef3c7" : "#f8fafc",
                    color: a.is_afo ? "#b45309" : "#94a3b8",
                    border: `1px solid ${a.is_afo ? "#fde68a" : "#e2e8f0"}`,
                    borderRadius: 20, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  }}>
                  🎓 Formateur AFO{a.is_afo ? " ✓" : ""}
                </button>
                <button onClick={() => handleToggleDpx(a)}
                  style={{
                    background: a.is_dpx ? "#ccfbf1" : "#f8fafc",
                    color: a.is_dpx ? "#0f766e" : "#94a3b8",
                    border: `1px solid ${a.is_dpx ? "#99f6e4" : "#e2e8f0"}`,
                    borderRadius: 20, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  }}>
                  🧭 DPX{a.is_dpx ? " ✓" : ""}
                </button>
                <button onClick={() => handleToggleAdjointDpx(a)}
                  style={{
                    background: a.is_adjoint_dpx ? "#ccfbf1" : "#f8fafc",
                    color: a.is_adjoint_dpx ? "#0d9488" : "#94a3b8",
                    border: `1px solid ${a.is_adjoint_dpx ? "#99f6e4" : "#e2e8f0"}`,
                    borderRadius: 20, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  }}>
                  🧭 Assistant DPX{a.is_adjoint_dpx ? " ✓" : ""}
                </button>
                <button onClick={() => handleToggleRoulement(a)}
                  style={{
                    background: a.type_roulement === "Réserve" ? "#ecfdf5" : "#f8fafc",
                    color: a.type_roulement === "Réserve" ? "#047857" : "#94a3b8",
                    border: `1px solid ${a.type_roulement === "Réserve" ? "#a7f3d0" : "#e2e8f0"}`,
                    borderRadius: 20, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  }}>
                  {a.type_roulement === "Réserve" ? "🔁 Réserve" : "🔄 Roulement"}
                </button>
              </div>

              {/* Actions */}
              {a.statut === "quitte" ? (
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#78716c", fontWeight: 600 }}>
                    🚪 Quitté le {a.date_depart ? new Date(a.date_depart).toLocaleDateString("fr-FR") : "?"}
                  </span>
                  <button onClick={() => handleReactiver(a)}
                    style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700, marginLeft: "auto" }}>
                    ↺ Réactiver
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
                  <button onClick={() => setModal({ type: "edit", agent: a })}
                    style={{ background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                    ✏️ Modifier
                  </button>
                  <button onClick={() => setModal({ type: "reset", agent: a })}
                    style={{ background: "#f5f3ff", color: "#6d28d9", border: "1px solid #ddd6fe", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                    🔑 PIN
                  </button>
                  {a.cp !== currentUser?.agent?.cp && (
                    <button onClick={() => setModal({ type: "delete", agent: a })}
                      style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700, marginLeft: "auto" }}>
                      🚪 Départ
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
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
        <ModalDepart agent={modal.agent} onConfirmDepart={(date) => handleDepart(modal.agent, date)} onConfirmSuppression={() => handleDelete(modal.agent)} onClose={() => setModal(null)} />
      )}
      {modal?.type === "reset" && (
        <ModalResetPin agent={modal.agent} onConfirm={(pin) => handleResetPin(modal.agent, pin)} onClose={() => setModal(null)} />
      )}
      {usageOpen && <UsageStatsModal onClose={() => setUsageOpen(false)} />}
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
  const [form, setForm] = useState({ nom: agent.nom || "", prenom: agent.prenom || "", grade: agent.grade || "CO5", famille: agent.famille || "PRCI", is_reserve: agent.is_reserve || false, is_afo: agent.is_afo || false, is_dpx: agent.is_dpx || false, is_adjoint_dpx: agent.is_adjoint_dpx || false, telephone: "", email: "" });
  const [nouveauCp, setNouveauCp] = useState(agent.cp || "");
  const [err, setErr] = useState("");
  const [coordLoading, setCoordLoading] = useState(true);
  const [habilitations, setHabilitations] = useState({}); // {code_poste:'HC'}
  const [habLoading, setHabLoading] = useState(true);
  const [habSaving, setHabSaving] = useState(false);
  // Confirmation d'un changement de CP : panneau inline (24/08), plus un
  // window.confirm() natif -- cohérent avec le reste du panneau Admin (ex.
  // ModalDepart, "Suppression définitive"), même principe de gravité.
  const [confirmCpChange, setConfirmCpChange] = useState(false);
  useEffect(() => {
    api.agents.getById(agent.cp).then(full => {
      setForm(p => ({ ...p, telephone: full?.telephone || "", email: full?.email || "" }));
      setCoordLoading(false);
    }).catch(() => setCoordLoading(false));
    api.profil.get(agent.cp).then(p => {
      setHabilitations(p?.habilitations || {});
      setHabLoading(false);
    }).catch(() => setHabLoading(false));
  }, [agent.cp]);

  function toggleHab(code) {
    setHabilitations(p => { const next = { ...p }; if (next[code]) delete next[code]; else next[code] = 'HC'; return next; });
  }

  async function submit() {
    if (!form.nom.trim()) return setErr("Le nom est obligatoire");
    if (!form.prenom.trim()) return setErr("Le prenom est obligatoire");
    if (!nouveauCp.trim()) return setErr("Le CP est obligatoire");
    const cpChange = nouveauCp.trim().toUpperCase() !== agent.cp;
    if (cpChange && !confirmCpChange) { setConfirmCpChange(true); return; }
    setErr("");
    setHabSaving(true);
    try {
      const aujourdhui = new Date().toISOString().slice(0, 10);
      const habsArray = Object.keys(habilitations).filter(c => habilitations[c]).map(code_poste => ({ code_poste, date_debut: aujourdhui }));
      await api.profil.setHabilitations(agent.cp, habsArray);
    } catch (e) {
      setHabSaving(false);
      return setErr(e.message || "Erreur sauvegarde habilitations");
    }
    setHabSaving(false);
    onConfirm({ nom: form.nom.trim().toUpperCase(), prenom: form.prenom.trim(), grade: form.grade, famille: form.famille, is_reserve: form.is_reserve, is_afo: form.is_afo, is_dpx: form.is_dpx, is_adjoint_dpx: form.is_adjoint_dpx, telephone: form.telephone.trim(), email: form.email.trim(), ...(cpChange ? { nouveau_cp: nouveauCp.trim().toUpperCase() } : {}) });
  }

  return (
    <Modal title={`Modifier ${agent.prenom} ${agent.nom}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>CP SNCF</div>
          <input value={nouveauCp} onChange={e => { setNouveauCp(e.target.value); setConfirmCpChange(false); }} style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}/>
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
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Téléphone {coordLoading&&"(chargement…)"}</div>
          <input value={form.telephone} onChange={e => setForm(p => ({ ...p, telephone: e.target.value }))}
            placeholder="ex: 06 12 34 56 78"
            style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Email {coordLoading&&"(chargement…)"}</div>
          <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            placeholder="ex: prenom.nom@sncf.fr"
            style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}
          />
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>L'agent peut toujours modifier ces informations lui-même depuis "Mon profil", et choisir d'apparaître ou non dans l'Annuaire.</div>
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
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Réserve régionale</div>
          <button onClick={() => setForm(p => ({ ...p, is_reserve: !p.is_reserve }))}
            style={{
              width: "100%", padding: "8px", border: "none", borderRadius: 8, cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              background: form.is_reserve ? "#7c3aed" : "#f1f5f9",
              color: form.is_reserve ? "#fff" : "#64748b"
            }}>
            🔁 {form.is_reserve ? "Réserviste régional" : "Pas réserviste"}
          </button>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Formateur AFO</div>
          <button onClick={() => setForm(p => ({ ...p, is_afo: !p.is_afo }))}
            style={{
              width: "100%", padding: "8px", border: "none", borderRadius: 8, cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              background: form.is_afo ? "#b45309" : "#f1f5f9",
              color: form.is_afo ? "#fff" : "#64748b"
            }}>
            🎓 {form.is_afo ? "Formateur AFO" : "Pas formateur"}
          </button>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>DPX</div>
          <button onClick={() => setForm(p => ({ ...p, is_dpx: !p.is_dpx }))}
            style={{
              width: "100%", padding: "8px", border: "none", borderRadius: 8, cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              background: form.is_dpx ? "#0f766e" : "#f1f5f9",
              color: form.is_dpx ? "#fff" : "#64748b"
            }}>
            🧭 {form.is_dpx ? "DPX" : "Pas DPX"}
          </button>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Assistant DPX</div>
          <button onClick={() => setForm(p => ({ ...p, is_adjoint_dpx: !p.is_adjoint_dpx }))}
            style={{
              width: "100%", padding: "8px", border: "none", borderRadius: 8, cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              background: form.is_adjoint_dpx ? "#0d9488" : "#f1f5f9",
              color: form.is_adjoint_dpx ? "#fff" : "#64748b"
            }}>
            🧭 {form.is_adjoint_dpx ? "Assistant DPX" : "Pas assistant DPX"}
          </button>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
            🛠️ Habilitations {habLoading && "(chargement…)"}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
            Déclarées par l'agent lui-même dans "Mon profil" — modifiables ici.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 6 }}>
            {HAB_ORDER.map(code => {
              const actif = !!habilitations[code];
              return (
                <button key={code} onClick={() => toggleHab(code)}
                  style={{
                    padding: "6px 8px", borderRadius: 7, cursor: "pointer", fontSize: 11.5, fontWeight: 700,
                    border: `1px solid ${actif ? "#93c5fd" : "#e2e8f0"}`,
                    background: actif ? "#eff6ff" : "#f8fafc",
                    color: actif ? "#1d4ed8" : "#94a3b8",
                    textAlign: "left",
                  }}>
                  {actif ? "✓ " : ""}{HAB_LABELS[code] || code}
                </button>
              );
            })}
          </div>
        </div>
        {err && <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>! {err}</div>}
        {confirmCpChange && (
          <div style={{ fontSize: 11.5, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 10px" }}>
            ⚠️ Changer le CP de {agent.cp} vers {nouveauCp.trim().toUpperCase()} met à jour toutes les données liées à cet agent — clique à nouveau sur "Enregistrer" pour confirmer.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Annuler</button>
          <button onClick={submit} disabled={habSaving} style={{ flex: 1, padding: "10px", background: confirmCpChange ? "#dc2626" : "#1e293b", color: "#fff", border: "none", borderRadius: 8, cursor: habSaving ? "wait" : "pointer", fontWeight: 700 }}>
            {habSaving ? "Enregistrement…" : confirmCpChange ? "Confirmer le changement de CP" : "Enregistrer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Remplace l'ancienne suppression physique (ON DELETE CASCADE, détruisait tout
// l'historique — planning, formations, échanges) par un départ : le planning
// est vidé strictement après la date de départ (le prévisionnel que l'agent
// aurait rempli à l'avance et oublié d'effacer, qui polluerait sinon Planning
// Prévisionnel), tout ce qui précède est conservé, la connexion est bloquée.
// La suppression définitive reste possible mais discrète, en dernier recours.
function ModalDepart({ agent, onConfirmDepart, onConfirmSuppression, onClose }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [confirmSuppression, setConfirmSuppression] = useState(false);

  return (
    <Modal title="🚪 Départ d'un agent" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>
          {agent.prenom} {agent.nom} ({agent.cp})
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Date de départ</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}
          />
        </div>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          Le planning après cette date sera supprimé (prévisionnel non pertinent après le départ). Tout ce qui précède — planning réel, formations, échanges — est conservé. La connexion de l'agent sera bloquée, sa fiche reste consultable via le filtre "Quittés".
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Annuler</button>
          <button onClick={() => onConfirmDepart(date)} style={{ flex: 1, padding: "10px", background: "#78716c", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Confirmer le départ</button>
        </div>

        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 10, marginTop: 4 }}>
          {!confirmSuppression ? (
            <button onClick={() => setConfirmSuppression(true)}
              style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: 11.5, fontWeight: 600, textDecoration: "underline" }}>
              Suppression définitive (irréversible, déconseillé)
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11.5, color: "#b91c1c" }}>
                ⚠️ Efface tout l'historique de cet agent (planning, formations, échanges) — irréversible. Réservé à une fiche créée par erreur.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirmSuppression(false)} style={{ flex: 1, padding: "8px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Annuler</button>
                <button onClick={onConfirmSuppression} style={{ flex: 1, padding: "8px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Supprimer définitivement</button>
              </div>
            </div>
          )}
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

// ─── MODAL UTILISATION (suivi anonyme, 02/09) ─────────────────────────────────

// Libellés humains des clés de vue (VIEWS/navigateToView, App.jsx) — recopiés
// depuis SEARCH_MODULES (App.jsx, non exporté) pour rester cohérents avec le
// reste de l'appli, complétés par "afo"/"admin" (absents de SEARCH_MODULES
// car ils ne sont jamais proposés par la recherche globale). Une clé inconnue
// (ex: une future vue jamais ajoutée ici) reste affichée telle quelle plutôt
// que de disparaître silencieusement.
const VUE_LABELS = {
  personal: "📊 Mon planning",
  global: "📋 CPS Officiel",
  previsionnel: "📅 Planning Prévisionnel",
  echanges: "🔄 Échanges",
  annuaire: "📇 Annuaire",
  conges: "🗓️ Demande de congés",
  cetPdfs: "🏦 CET",
  d2i: "✊ D2I",
  fim: "🗂️ Fiche Individuelle",
  statsEquipe: "📊 Stat'Equip",
  profil: "👤 Mon profil",
  formation: "🎓 Formation",
  afo: "🎓 AFO",
  admin: "👑 Admin",
};

function UsageStatsModal({ onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.usage.getStats()
      .then(setData)
      .catch(() => setErr("Impossible de charger les statistiques d'utilisation."));
  }, []);

  const maxJour = data ? Math.max(1, ...data.visitesParJour.map(j => j.total)) : 1;
  const maxPage = data ? Math.max(1, ...data.topPages.map(p => p.total)) : 1;

  return (
    <Modal title="📊 Utilisation de l'appli" onClose={onClose} maxWidth={520}>
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14, lineHeight: 1.5 }}>
        Suivi anonyme — aucun nom, aucun CP n'est jamais affiché ici, uniquement
        des totaux. Basé sur les 30 derniers jours (sauf le compteur du jour).
      </div>

      {err && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 600 }}>⚠️ {err}</div>}
      {!data && !err && <div style={{ textAlign: "center", color: "#94a3b8", padding: 20 }}>Chargement...</div>}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Agents uniques */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[
              { label: "Aujourd'hui", val: data.agentsUniques.today },
              { label: "7 derniers jours", val: data.agentsUniques.last7 },
              { label: "30 derniers jours", val: data.agentsUniques.last30 },
            ].map(t => (
              <div key={t.label} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b" }}>{t.val}</div>
                <div style={{ fontSize: 10.5, color: "#64748b", fontWeight: 600, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Pages les plus consultées */}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>📖 Pages les plus consultées</div>
            {data.topPages.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Aucune donnée pour l'instant.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.topPages.map(p => (
                  <div key={p.vue} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 130, flexShrink: 0, fontSize: 12, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {VUE_LABELS[p.vue] || p.vue}
                    </div>
                    <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 5, overflow: "hidden", height: 14 }}>
                      <div style={{ width: `${(p.total / maxPage) * 100}%`, background: "#1d4ed8", height: "100%", borderRadius: 5 }} />
                    </div>
                    <div style={{ width: 34, textAlign: "right", fontSize: 12, fontWeight: 700, color: "#334155" }}>{p.total}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fréquence : visites par jour */}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#334155", marginBottom: 8 }}>📈 Fréquence (30 derniers jours)</div>
            {data.visitesParJour.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Aucune donnée pour l'instant.</div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 70, overflowX: "auto" }}>
                {data.visitesParJour.map(j => (
                  <div key={j.jour} title={`${j.jour} — ${j.total} navigation(s), ${j.agents} agent(s)`}
                    style={{ flex: "1 0 6px", minWidth: 6, background: "#1d4ed8", opacity: 0.85, borderRadius: "3px 3px 0 0", height: `${Math.max(4, (j.total / maxJour) * 100)}%` }} />
                ))}
              </div>
            )}
            <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 4 }}>Survoler une barre pour voir le détail du jour.</div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── MODAL BASE ───────────────────────────────────────────────────────────────

// Le contenu de ModalModifier a grossi (habilitations, 16/08) au point de
// dépasser la hauteur d'un écran mobile — l'overlay plein écran n'avait ni
// scroll ni maxHeight, donc `alignItems:"center"` recentrait un contenu trop
// grand en coupant le haut ET le bas, sans aucun moyen d'atteindre le bouton
// "Enregistrer". Corrigé : la carte a désormais une hauteur plafonnée, avec
// un scroll interne sur le corps uniquement (l'en-tête reste toujours visible).
function Modal({ title, onClose, children, maxWidth = 420 }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.6)",
      zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, backdropFilter: "blur(4px)"
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 60px rgba(0,0,0,.25)", overflow: "hidden"
      }}>
        <div style={{
          background: "#1e293b", padding: "16px 20px", flexShrink: 0,
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <div style={{ padding: "20px", overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}
