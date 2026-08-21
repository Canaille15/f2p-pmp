// ─── DayEditPopup.jsx ─────────────────────────────────────────────────────────
// Popup de saisie — F2P.PMP
// Logique définitive :
//   - 🌙 toggle indépendant : coexiste avec tout, non comptabilisé, sauvegardé
//   - N = nuit du soir, s'affiche toujours en bas de case
//   - Pas de propagation automatique sur J+1
//   - Pas de grisage, pas de blocage
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect } from "react";
import api, { convertirCodePosteVersJsCode } from "../api/client";

// Ordre d'affichage réorganisé le 19/08 (Olivier : "je veux que tri l'ordre
// d'affichage des touches du pop up : 1ere ligne des repos absences ; rp,
// rpp, ru, rq, rn, tc, ty nu. en 2 ligne [...] conges, fetes, fomation,
// greve, maladie, vt" -- "sans rien casse car des agents ont deja acces a
// leur compte") -- purement visuel : le rendu (plus bas, deux blocs
// explicites au lieu d'un seul .map() filtré) impose l'ordre exact demandé,
// cet array ne sert plus que de table de correspondance code→couleur
// (via .find(), donc son propre ordre interne n'a aucun effet fonctionnel).
const CODES_REPOS = [
  { code:"RP",  label:"RP",        color:"#16a34a" },
  { code:"RPP", label:"RPP",       color:"#0d9488" },
  { code:"RU",  label:"RU",        color:"#ca8a04" },
  { code:"RQ",  label:"RQ",        color:"#ca8a04" },
  { code:"RN",  label:"RN",        color:"#4338ca" },
  { code:"TC",  label:"TC",        color:"#0284c7" },
  { code:"TY",  label:"TY",        color:"#0284c7" },
  { code:"NU",  label:"NU",        color:"#475569" },
  { code:"CA",  label:"Congés",    color:"#eab308" },
  { code:"MA",  label:"Maladie",   color:"#dc2626" },
  { code:"VT",  label:"VT",        color:"#eab308" },
  { code:"FOR", label:"Formation", color:"#b45309" },
];
// Deux séquences explicites pour le rendu (voir plus bas) -- remplace
// l'ancien .filter(r=>r.code!=="CA"&&r.code!=="VT").map(...) dont l'ordre
// suivait simplement celui du tableau ci-dessus.
const CODES_REPOS_LIGNE1 = ["RP","RPP","RU","RQ","RN","TC","TY","NU"];

const CODES_TRAVAIL = [
  { code:"M",  label:"Matin",    heures:"06h10–14h17", color:"#8B0000" },
  { code:"AM", label:"Soirée",   heures:"14h05–22h17", color:"#8B0000" },
  { code:"N",  label:"Nuit ↓",   heures:"22h15–06h17", color:"#1e293b" },
  { code:"J",  label:"Journée",  heures:"08h00–17h45", color:"#8B0000" },
];

// Grève (04/08, demandé par Olivier) : DA/DB/DC sont une absence indépendante
// qui se combine avec n'importe quelle journée de travail (ou reste seule) —
// contrairement aux codes de CODES_REPOS ci-dessus, qui occupent le même
// emplacement que "Travail" (un seul choisi à la fois). Couleur alignée sur
// celle du code "Absent" existant (ABS), voir getColor("ABS") côté App.jsx.
const GREVE = [
  { code:"DA", label:"01h00 grève" },
  { code:"DB", label:"1/2 journée grève" },
  { code:"DC", label:"journée grève" },
];

const FETES = [
  {code:"F1",label:"1er Jan."},{code:"F2",label:"Lundi Pâques"},
  {code:"F3",label:"1er Mai"},{code:"F4",label:"Ascension"},
  {code:"FV",label:"8 Mai"},{code:"F5",label:"Pentecôte"},
  {code:"F6",label:"14 Juil."},{code:"F7",label:"15 Août"},
  {code:"F8",label:"1er Nov."},{code:"F9",label:"11 Nov."},
  {code:"F0",label:"Noël"},{code:"VN",label:"Veille Noël"},
  {code:"JF",label:"Fête SNCF"},
];

const POSTES_PRCI = [
  {code:"CCL",  label:"CCL",         types:["M","AM","N"]},
  {code:"ADJ",  label:"Adj CCL",     types:["M","AM","N"]},
  {code:"LNE",  label:"AC LNE",      types:["M","AM","N"]},
  {code:"LNO",  label:"AC LNO",      types:["M","AM","N"]},
  {code:"VGD",  label:"AC VGD",      types:["M","AM"]},
  {code:"LC",   label:"AC LC",       types:["M","AM","N"]},
  {code:"PA1J", label:"Pauseur CCL", types:["J"]},
  {code:"PA2J", label:"Pauseur Adjoint", types:["J"]},
  {code:"PA3J", label:"Pauseur VGD", types:["J"]},
  {code:"DPXJ", label:"DPX PRCI",    types:["J"]},
  {code:"ASSJ", label:"Adj DPX",     types:["J"]},
  {code:"PPRCI",label:"PPRCI",       types:["J","M","AM"]},
  {code:"AFOPR",label:"AFO PRCI",    types:["J"]},
  // VM/CAF (19/08, demandé par Olivier) : ce sont des journées de travail à
  // part entière (comptent normalement dans "Jours travaillés"), pas des
  // absences -- corrigé après un premier essai erroné qui les traitait comme
  // des codes équipe indépendants type Maladie/Absent. "Certificat d'Aptitude
  // à la Fonction" (CAF) et "Visite médicale" (VM), même principe que
  // PPRCI/PPAR : postes génériques, jamais liés à une habilitation précise
  // (voir l'exemption dans getPostes plus bas).
  {code:"VM",   label:"VM",          types:["J"]},
  {code:"CAF",  label:"CAF",         types:["J"]},
  // AY (19/08, demandé par Olivier) : remplace le bouton "Absent" (ABS,
  // section Repos/Absences, retiré) -- ancien "Absent" transformé en poste
  // sous Journée, même principe que VM/CAF : compte comme jour travaillé.
  // Contrainte explicite d'Olivier : "AY ne doit jamais apparaitre dans le
  // previonnel. ca doit rester a 100% dans le perso" -- AY n'est donc PAS
  // dans POSTES_JOURNEE (App.jsx, qui alimente aussi les rangées de
  // GlobalView/CPS Officiel/Prévisionnel) : résolu à part (getPosteLabelFromCode,
  // POSTE_REGISTRY), jamais par ce canal partagé.
  {code:"AY",   label:"AY - Absence",types:["J"]},
];

const POSTES_PAR = [
  {code:"AC1",  label:"AC PAR",      types:["M","AM","N"]},
  {code:"AC2",  label:"Aide AC PAR", types:["M","AM","N"]},
  {code:"ACXX", label:"CT Travaux",  types:["N"]},
  {code:"PARJ", label:"Pauseur PAR", types:["J"]},
  {code:"DPXP", label:"DPX PAR",     types:["J"]},
  {code:"ASMP", label:"ASMTE PAR",   types:["J"]},
  {code:"PPAR", label:"PPAR", types:["J"]},
];

// Regroupement des postes "Journée" en lignes (19/08, demandé par Olivier :
// "sur la 1ere ligne [...] pauseur ccl, ajd prci, vgd, pausur par. en ligne
// 2 asmte par, afo prci [...] ligne 3 pprci [...] ligne suivante, dpx prci,
// dpx par, adj dpx [...] tu garde les nom deja mis avant") -- purement un
// regroupement d'affichage, PAS une nouvelle liste de postes : chaque ligne
// est filtrée depuis postesJ (déjà filtré par habilitation dans getPostes),
// jamais depuis POSTES_PRCI/POSTES_PAR directement, donc un agent sans une
// habilitation donnée continue de ne pas voir ce bouton précis, exactement
// comme avant. 3 noms cités par Olivier n'existaient pas déjà dans la liste
// (SD, Assistant PRCI, AFO PAR) -- volontairement absents ici, conformément
// à "tu garde les nom deja mis avant" (aucun nouveau poste inventé).
const POSTE_ROWS_J = [
  ["PA1J","PA2J","PA3J","PARJ"], // Pauseur CCL / Pauseur Adjoint / Pauseur VGD / Pauseur PAR
  ["ASMP","AFOPR"],              // ASMTE PAR / AFO PRCI
  ["PPRCI","PPAR"],              // PPRCI / PPAR
  ["DPXJ","DPXP","ASSJ"],        // DPX PRCI / DPX PAR / Adj DPX
  ["VM","CAF","AY"],             // pas mentionnés par Olivier, gardés en dernière ligne
];

const HORAIRES_DEFAUT = { M:"06h10–14h17", AM:"14h05–22h17", N:"22h15–06h17", J:"08h00–17h45" };

// jsCode canonique → code court local (sens inverse de convertirCodePosteVersJsCode).
// entry.jsCode/jsCode2 arrivent ici déjà sous forme canonique (App.jsx les convertit
// systématiquement après sauvegarde, pour l'affichage — voir le commentaire dans
// App.jsx sur l'affichage optimiste). Sans cette table, poste1/posteN s'initialisaient
// avec le code canonique : aucun bouton ne matchait (poste affiché comme "non sélectionné"
// alors qu'il l'était), et surtout, si l'agent enregistrait à nouveau sans re-choisir de
// poste (ex: juste pour ajouter une nuit), ce code canonique repartait tel quel vers
// saveEntry, qui le reconnaît (à raison) comme déjà canonique et refuse de le sauvegarder
// comme code_poste — effaçant silencieusement le poste en base.
const CANONIQUE_VERS_COURT = {};
[...POSTES_PRCI, ...POSTES_PAR].forEach(p => {
  p.types.forEach(type => {
    const canon = convertirCodePosteVersJsCode(p.code, type);
    if (canon) CANONIQUE_VERS_COURT[canon] = p.code;
  });
});
const versCodeCourt = (jsCode) => (jsCode ? (CANONIQUE_VERS_COURT[jsCode] || jsCode) : jsCode);

// Table de correspondance exacte : code court local (ce fichier) → code
// réellement enregistré dans les habilitations (AgentHeader.jsx / backend).
// PPRCI et PPAR sont volontairement absents : toujours proposés sans
// condition d'habilitation (poste générique de famille).
const CODE_VERS_HAB = {
  // PRCI
  "CCL":"PICCL", "ADJ":"PIADJ", "LNE":"PILNE", "LNO":"PILNO", "VGD":"PIVGD", "LC":"PILCL",
  "PA1J":"PIPA1J", "PA2J":"PIPA2J", "PA3J":"PIPA3J", "DPXJ":"PIDPXJ", "ASSJ":"PIASSJ",
  "AFOPR":"AFOPRCI",
  // PAR
  "AC1":"PAAC1-", "AC2":"PAAC2-", "ACXX":"PAACXX", "PARJ":"PAPAUJ", "DPXP":"PADPXJ",
  "ASMP":"PAASMJ",
};

export default function DayEditPopup({ date, entry, agent, agentProfiles, fetesPrises, onSave, onDelete, onClose, onCongeStatutChange, onVtStatutChange }) {

  const agKey = agent?.immatriculation || agent?.cp || agent?.id;
  const profile = agentProfiles?.[agKey] || {};
  const noteColor = profile.agentColors?.NOTE || "#b45309";
  const famille = agent?.famille || "PRCI";
  const tous_postes = famille === "PAR"
    ? [...POSTES_PAR, ...POSTES_PRCI]
    : [...POSTES_PRCI, ...POSTES_PAR];

  const habCodes = useMemo(() => {
    const habs = profile.habilitations || {};
    if (Array.isArray(habs)) return habs.map(h => h.code_poste);
    return Object.entries(habs).filter(([,v]) => v === "HC").map(([k]) => k);
  }, [profile.habilitations]);

  const getPostes = (type) => {
    if (!["M","AM","N","J"].includes(type)) return [];
    const postes = tous_postes.filter(p => p.types.includes(type));
    if (habCodes.length === 0) return postes;
    return postes.filter(p =>
      p.code === "PPRCI" || p.code === "PPAR" || p.code === "VM" || p.code === "CAF" || p.code === "AY" ||
      habCodes.includes(CODE_VERS_HAB[p.code] || p.code)
    );
  };

  // ── Initialisation ────────────────────────────────────────────────────────
  // N seule (equipe="N" sans equipe2) = nuit du soir → typeN="N", type1=null
  // N avec equipe2="N" = journée + nuit → type1=entry.equipe (M/AM/J), typeN="N"
  // Sinon : type1=entry.equipe, typeN=null

  // Nuit seule = equipe="N" sans journée (equipe2=null OU equipe2="N" avec equipe="N")
  const isNuitSeule = entry?.equipe === "N" && (entry?.equipe2 === "N" || !entry?.equipe2);

  const initType1 = isNuitSeule ? null : (entry?.equipe || null);
  const initTypeN = (entry?.equipe2 === "N" || isNuitSeule) ? "N" : null;
  const initPoste1 = isNuitSeule ? "" : (versCodeCourt(entry?.jsCode) || "");
  const initPosteN = isNuitSeule ? (versCodeCourt(entry?.jsCode) || "") : (versCodeCourt(entry?.jsCode2) || "");
  const initHoraires = isNuitSeule ? "" : (entry?.horaires || "");

  const [type1,     setType1]     = useState(initType1);
  const [poste1,    setPoste1]    = useState(initPoste1);
  const [horaires1, setHoraires1] = useState(initHoraires);
  const [typeN,     setTypeN]     = useState(initTypeN);
  const [posteN,    setPosteN]    = useState(initPosteN);
  // 🌙 finNuit : toggle indépendant, coexiste avec tout
  const [finNuit,   setFinNuit]   = useState(!!entry?.finNuit);
  const [notePerso, setNotePerso] = useState(entry?.notePerso || "");
  const [showFetes, setShowFetes] = useState(false);
  const [feteBloqueeMsg, setFeteBloqueeMsg] = useState(null);
  // Grève (04/08) : indépendant de type1/typeN, coexiste avec tout comme finNuit.
  const [greve, setGreve] = useState(entry?.greve || null);
  const [showGreve, setShowGreve] = useState(false);
  const toggleGreve = (code) => { setGreve(prev => prev === code ? null : code); setShowGreve(false); };

  // Formation AFO / auto-declaree (09/08) : meme principe que greve —
  // independant de type1/typeN, coexiste avec n'importe quelle journee.
  // Ecrite automatiquement par le module Formation (jamais depuis ce popup),
  // seul le retrait (decliner une session) se fait ici.
  const [formation, setFormation] = useState(entry?.formation || null);

  // Restaurer une participation declinee (10/08, Olivier) : si l'agent a
  // retire une formation (ou n'a jamais eu de FOR ce jour-la) mais reste
  // inscrit a une session LANCEE ce jour precis, on lui propose de la
  // re-choisir ici — plutot qu'un simple bouton "annuler le retrait" qui
  // ne saurait pas quoi faire si plusieurs formations sont proposees le
  // meme jour. Requete legere, refaite si "formation" repasse a null (ex:
  // apres un clic sur "Retirer" dans la meme session de popup).
  const [formationsProposees, setFormationsProposees] = useState([]);
  useEffect(() => {
    if (formation) return;
    let cancelled = false;
    api.formation.getProposees(date).then(rows => { if (!cancelled) setFormationsProposees(rows || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [date, formation]);

  // Congés Demandé/Refusé (06/08) : contrairement à "Accordé" (type1="CA",
  // écrit directement dans la case comme avant), Demandé/Refusé n'écrivent
  // JAMAIS dans le planning perso — c'est un suivi indépendant qui alimente
  // agentProfiles[agentId].congesDemandes (même modèle que le popup Congés,
  // voir computeDashboardConges/App.jsx). jourEtaitVideAtOpen est capturé UNE
  // FOIS depuis la prop entry (l'état AVANT ouverture du popup) — sert au
  // détachement auto (Phase 3, 15/07) : un suivi ne doit se détacher que si
  // le jour était vide au moment du marquage, jamais s'il avait déjà un
  // contenu légitime dès le départ (exactement ce cas ici, puisqu'on autorise
  // justement de marquer "Demandé" sur un jour déjà rempli).
  const jourEtaitVideAtOpen = !(entry?.equipe || entry?.equipe2);
  const trackingExistant = agentProfiles?.[agKey]?.congesDemandes?.[date];
  const codeActuelAuOuverture = entry?.equipe || entry?.equipe2;
  const congeStatutInitial = (trackingExistant && trackingExistant.statut &&
      !(trackingExistant.jourEtaitVide && codeActuelAuOuverture))
    ? trackingExistant.statut : null;
  const [congeStatut, setCongeStatut] = useState(congeStatutInitial);
  const [showConges, setShowConges] = useState(false);
  const toggleCongeStatut = (statut) => {
    if (congeStatut === statut) { setCongeStatut(null); return; }
    setCongeStatut(statut);
    // Un jour ne peut pas être à la fois "Accordé" (écrit CA dans la case) ET
    // "Demandé"/"Refusé" (suivi indépendant) — si le jour était déjà accordé,
    // choisir Demandé/Refusé désélectionne l'accord.
    if (type1 === "CA") { setType1(null); setPoste1(""); setHoraires1(""); }
  };

  // VT Demandé/Refusé (06/08, même principe que Congés ci-dessus, sur demande
  // d'Olivier — VT suit désormais exactement le même mécanisme, seul
  // l'affichage du numéro dans le calendrier reste sur la convention propre à
  // VT, cumul de fin de mois, voir App.jsx).
  const vtTrackingExistant = agentProfiles?.[agKey]?.vtTracking?.[date];
  const vtStatutInitial = (vtTrackingExistant && vtTrackingExistant.statut &&
      !(vtTrackingExistant.jourEtaitVide && codeActuelAuOuverture))
    ? vtTrackingExistant.statut : null;
  const [vtStatut, setVtStatut] = useState(vtStatutInitial);
  const [showVt, setShowVt] = useState(false);
  const toggleVtStatut = (statut) => {
    if (vtStatut === statut) { setVtStatut(null); return; }
    setVtStatut(statut);
    if (type1 === "VT") { setType1(null); setPoste1(""); setHoraires1(""); }
  };

  const dateObj = new Date(date + "T12:00:00");
  const dateLabel = dateObj.toLocaleDateString("fr-FR", {
    weekday:"long", day:"numeric", month:"long"
  });

  const getColor = (code) => {
    const t = CODES_TRAVAIL.find(t => t.code === code);
    if (t) return t.color;
    const r = CODES_REPOS.find(r => r.code === code);
    if (r) return r.color;
    if (FETES.find(f => f.code === code)) return "#ec4899";
    return "#64748b";
  };

  // Toggle type journée
  const toggleType1 = (code) => {
    if (code === "N") {
      // N = nuit du soir, géré par typeN
      setTypeN(prev => prev ? null : "N");
      if (typeN) setPosteN("");
      return;
    }
    if (type1 === code) {
      setType1(null);
      setPoste1("");
      setHoraires1("");
    } else {
      setType1(code);
      setHoraires1(["M","AM","J"].includes(code) ? (HORAIRES_DEFAUT[code] || "") : "");
      setPoste1("");
      setShowFetes(false);
    }
  };

  const isTravailJ = type1 && ["M","AM","J"].includes(type1);
  const postesJ = isTravailJ ? getPostes(type1) : [];
  const postesN = getPostes("N");

  const sauvegarder = () => {
    const newEntry = {
      equipe:     type1 || null,
      jsCode:     isTravailJ ? (poste1 || null) : null,
      horaires:   horaires1 || null,
      equipe2:    typeN || null,
      jsCodeNuit: typeN ? (posteN || null) : null,
      prive:      (type1===null&&typeN==="N") ? false : !["M","AM","N","J","JF","FOR","DISPO",
                    ...FETES.map(f=>f.code)].includes(type1),
      finNuit:    finNuit,
      notePerso:  notePerso || null,   // indépendant, disponible sur tout type de jour, sauvegardé tel quel
      greve:      greve || null,       // indépendant, se combine avec n'importe quelle journée (comme finNuit)
      formation:  formation || null,   // indépendant, retiré ici uniquement (jamais ajouté depuis ce popup)
    };
    onSave(newEntry);
    if (congeStatut !== congeStatutInitial && onCongeStatutChange) {
      onCongeStatutChange(date, congeStatut, jourEtaitVideAtOpen);
    }
    if (vtStatut !== vtStatutInitial && onVtStatutChange) {
      onVtStatutChange(date, vtStatut, jourEtaitVideAtOpen);
    }
  };

  return (
    <div style={{
      position:"fixed", inset:0,
      background:"rgba(15,23,42,.65)",
      zIndex:500, display:"flex",
      alignItems:"center", justifyContent:"center",
      padding:16, backdropFilter:"blur(3px)",
    }} onClick={e => e.target === e.currentTarget && onClose()}>

      <div style={{
        background:"#fff", borderRadius:20,
        width:"100%", maxWidth:420,
        boxShadow:"0 24px 60px rgba(0,0,0,.25)",
        overflow:"hidden", maxHeight:"90vh",
        display:"flex", flexDirection:"column",
      }}>

        {/* HEADER */}
        <div style={{
          background:"linear-gradient(135deg,#1e293b,#334155)",
          padding:"14px 18px",
          display:"flex", justifyContent:"space-between", alignItems:"center",
          flexShrink:0,
        }}>
          <div>
            <div style={{
              color:"#94a3b8", fontSize:10, fontWeight:700,
              textTransform:"uppercase", letterSpacing:.5,
            }}>
              {dateLabel}
            </div>
            {/* Aperçu */}
            <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap"}}>
              {finNuit && (
                <span style={{
                  background:"#0f172a", border:"1px solid #3b82f6",
                  color:"#93c5fd", fontSize:10, fontWeight:700,
                  padding:"2px 8px", borderRadius:5,
                }}>🌙</span>
              )}
              {notePerso && (
                <span style={{
                  background:"#422006", border:"1px solid #d97706",
                  color:"#fcd34d", fontSize:10, fontWeight:700,
                  padding:"2px 8px", borderRadius:5,
                }}>📝</span>
              )}
              {type1 && (
                <span style={{
                  background:getColor(type1), color:"#fff",
                  fontSize:10, fontWeight:700,
                  padding:"2px 7px", borderRadius:5,
                }}>
                  {type1}{poste1 ? " · "+(tous_postes.find(p=>p.code===poste1)?.label||poste1) : ""}
                </span>
              )}
              {typeN && (
                <span style={{
                  background:"#1e293b", color:"#fff",
                  fontSize:10, fontWeight:700,
                  padding:"2px 7px", borderRadius:5,
                }}>
                  Nuit{posteN ? " · "+(tous_postes.find(p=>p.code===posteN)?.label||posteN) : ""} ↓
                </span>
              )}
              {greve && (
                <span style={{
                  background:"#dc2626", color:"#fff",
                  fontSize:10, fontWeight:700,
                  padding:"2px 7px", borderRadius:5,
                }}>
                  ✊ {GREVE.find(g=>g.code===greve)?.label||greve}
                </span>
              )}
              {formation && (
                <span style={{
                  background:"#b45309", color:"#fff",
                  fontSize:10, fontWeight:700,
                  padding:"2px 7px", borderRadius:5,
                }}>
                  🎓 {formation}
                </span>
              )}
              {congeStatut && (
                <span style={{
                  background: congeStatut==="demande" ? "#92400e" : "#991b1b",
                  color:"#fff", fontSize:10, fontWeight:700,
                  padding:"2px 7px", borderRadius:5,
                }}>
                  {congeStatut==="demande" ? "⏳ Congé demandé" : "✕ Congé refusé"}
                </span>
              )}
              {vtStatut && (
                <span style={{
                  background: vtStatut==="demande" ? "#92400e" : "#991b1b",
                  color:"#fff", fontSize:10, fontWeight:700,
                  padding:"2px 7px", borderRadius:5,
                }}>
                  {vtStatut==="demande" ? "⏳ VT demandé" : "✕ VT refusé"}
                </span>
              )}
              {!finNuit && !type1 && !typeN && !notePerso && !greve && !formation && !congeStatut && !vtStatut && (
                <span style={{color:"#475569",fontSize:10}}>case vide</span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            background:"rgba(255,255,255,.1)", border:"none",
            color:"#fff", cursor:"pointer", borderRadius:8,
            width:32, height:32, fontSize:16, flexShrink:0,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>✕</button>
        </div>

        {/* CONTENU */}
        <div style={{
          overflowY:"auto", flex:1, padding:"14px 16px",
          display:"flex", flexDirection:"column", gap:14,
        }}>

          {/* ── 🌙 Toggle fin nuit — indépendant ── */}
          <button onClick={() => setFinNuit(v => !v)} style={{
            width:"100%", padding:"10px 14px",
            background: finNuit ? "#0f172a" : "#f8fafc",
            border: finNuit ? "2px solid #3b82f6" : "1.5px dashed #cbd5e1",
            borderRadius:10, cursor:"pointer",
            fontSize:12, fontWeight:700,
            color: finNuit ? "#93c5fd" : "#64748b",
            display:"flex", alignItems:"center", gap:8,
            transition:"all .15s",
          }}>
            🌙 Descente de nuit
            <span style={{
              marginLeft:"auto", fontSize:10, fontWeight:700,
              background: finNuit ? "#1e3a8a" : "#e2e8f0",
              color: finNuit ? "#bfdbfe" : "#94a3b8",
              borderRadius:6, padding:"1px 8px",
            }}>
              {finNuit ? "actif" : "inactif"}
            </span>
          </button>

          {/* ── 📝 Note perso — indépendant, visible uniquement par toi ── */}
          <div style={{
            padding:"10px 14px",
            background: notePerso ? "#1a1207" : "#f8fafc",
            border: `2px solid ${notePerso ? noteColor : "#cbd5e1"}`,
            borderStyle: notePerso ? "solid" : "dashed",
            borderRadius:10,
            transition:"all .15s",
          }}>
            <div style={{
              fontSize:12, fontWeight:700,
              color: notePerso ? noteColor : "#64748b",
              display:"flex", alignItems:"center", gap:8,
              marginBottom:8,
            }}>
              📝 Note (visible uniquement par toi)
              <span style={{
                marginLeft:"auto", fontSize:10, fontWeight:700,
                background: notePerso ? noteColor : "#e2e8f0",
                color: notePerso ? "#fff" : "#94a3b8",
                borderRadius:6, padding:"1px 8px",
              }}>
                {notePerso ? "actif" : "inactif"}
              </span>
            </div>
            <div style={{display:"flex", gap:6, alignItems:"center"}}>
              <input
                value={notePerso}
                onChange={e => setNotePerso(e.target.value)}
                placeholder="ex: Réunion service, visite de poste, rappel..."
                style={{
                  flex:1, padding:"9px 11px",
                  border: `1.5px solid ${notePerso ? noteColor : "#e2e8f0"}`,
                  borderRadius:8, background:"#fff",
                  fontSize:14, fontWeight:600, color:"#1e293b",
                  outline:"none", boxSizing:"border-box",
                }}
              />
              {notePerso && (
                <button onClick={() => setNotePerso("")} title="Effacer la note"
                  style={{
                    flexShrink:0, width:36, height:36,
                    background:"#fff", border:"1.5px solid #fca5a5",
                    borderRadius:8, cursor:"pointer",
                    color:"#dc2626", fontSize:15, fontWeight:800,
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>✕</button>
              )}
            </div>
          </div>

          {/* ── Repos / Absences ── */}
          <div>
            <div style={{
              fontSize:10, color:"#94a3b8", fontWeight:700,
              marginBottom:7, textTransform:"uppercase", letterSpacing:.5,
            }}>
              Repos / Absences
            </div>
            {/* Ligne 1 : RP, RPP, RU, RQ, RN, TC, TY, NU */}
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {CODES_REPOS_LIGNE1.map(code => {
                const r = CODES_REPOS.find(x => x.code === code);
                return (
                  <button key={r.code} onClick={() => toggleType1(r.code)} style={{
                    padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                    fontSize:12, fontWeight:700,
                    background: type1 === r.code ? r.color : "#f1f5f9",
                    color: type1 === r.code ? "#fff" : "#475569",
                    transition:"all .1s",
                  }}>{r.label}</button>
                );
              })}
            </div>
            {/* Ligne 2 : Congés, Fêtes, Formation, Grève, Maladie, VT (19/08,
                Olivier) -- Congés/VT gardent leur sous-menu Accordé/Demandé/
                Refusé (06/08, voir plus bas), Fêtes/Grève leur propre popup
                d'expansion (04/08), Formation/Maladie restent de simples
                toggles directs (CODES_REPOS). Uniquement un réordonnancement
                visuel, aucune de ces logiques n'a changé. */}
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:5}}>
              {/* Congés (06/08) : bouton dédié avec sous-menu Accordé/Demandé/Refusé
                  — contrairement aux autres codes de CODES_REPOS ci-dessus (un seul
                  toggle direct), "Congés" a 3 états distincts. Seul "Accordé" écrit
                  dans le planning perso (type1="CA", comportement inchangé depuis
                  toujours) ; "Demandé"/"Refusé" alimentent congesDemandes sans
                  jamais toucher à la case (voir toggleCongeStatut plus haut). */}
              <button onClick={() => setShowConges(v=>!v)} style={{
                padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                fontSize:12, fontWeight:700,
                background: type1==="CA" ? "#eab308"
                  : congeStatut==="demande" ? "#fef3c7"
                  : congeStatut==="refuse" ? "#fef2f2" : "#f1f5f9",
                color: type1==="CA" ? "#fff"
                  : congeStatut==="demande" ? "#92400e"
                  : congeStatut==="refuse" ? "#991b1b" : "#475569",
              }}>
                {type1==="CA" ? "Congés · Accordé"
                  : congeStatut==="demande" ? "⏳ Congés · Demandé"
                  : congeStatut==="refuse" ? "✕ Congés · Refusé" : "Congés"}
              </button>
              <button onClick={() => setShowFetes(v=>!v)} style={{
                padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                fontSize:12, fontWeight:700,
                background: showFetes || FETES.find(f=>f.code===type1) ? "#ec4899" : "#fdf2f8",
                color: showFetes || FETES.find(f=>f.code===type1) ? "#fff" : "#9d174d",
              }}>🩷 Fêtes</button>
              {(() => { const r = CODES_REPOS.find(x => x.code === "FOR"); return (
                <button onClick={() => toggleType1(r.code)} style={{
                  padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                  fontSize:12, fontWeight:700,
                  background: type1 === r.code ? r.color : "#f1f5f9",
                  color: type1 === r.code ? "#fff" : "#475569",
                  transition:"all .1s",
                }}>{r.label}</button>
              ); })()}
              {/* Grève (04/08) : indépendant de type1, se combine avec n'importe
                  quelle journée de travail — toggleGreve plutôt que toggleType1. */}
              <button onClick={() => setShowGreve(v=>!v)} style={{
                padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                fontSize:12, fontWeight:700,
                background: showGreve || greve ? "#dc2626" : "#fef2f2",
                color: showGreve || greve ? "#fff" : "#991b1b",
              }}>✊ Grève{greve ? " · "+greve : ""}</button>
              {(() => { const r = CODES_REPOS.find(x => x.code === "MA"); return (
                <button onClick={() => toggleType1(r.code)} style={{
                  padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                  fontSize:12, fontWeight:700,
                  background: type1 === r.code ? r.color : "#f1f5f9",
                  color: type1 === r.code ? "#fff" : "#475569",
                  transition:"all .1s",
                }}>{r.label}</button>
              ); })()}
              {/* VT (06/08) : même sous-menu Accordé/Demandé/Refusé que Congés,
                  sur demande d'Olivier — "le même fonctionnement pour les
                  demande accord et refus". Seul "Accordé" écrit dans le
                  planning perso (type1="VT"). */}
              <button onClick={() => setShowVt(v=>!v)} style={{
                padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                fontSize:12, fontWeight:700,
                background: type1==="VT" ? "#eab308"
                  : vtStatut==="demande" ? "#fef3c7"
                  : vtStatut==="refuse" ? "#fef2f2" : "#f1f5f9",
                color: type1==="VT" ? "#fff"
                  : vtStatut==="demande" ? "#92400e"
                  : vtStatut==="refuse" ? "#991b1b" : "#475569",
              }}>
                {type1==="VT" ? "VT · Accordé"
                  : vtStatut==="demande" ? "⏳ VT · Demandé"
                  : vtStatut==="refuse" ? "✕ VT · Refusé" : "VT"}
              </button>
            </div>
            {showGreve && (
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:7}}>
                {GREVE.map(g => (
                  <button key={g.code} onClick={() => toggleGreve(g.code)} style={{
                    width:96, padding:"4px 6px", borderRadius:7, border:"none", cursor:"pointer",
                    fontSize:11, fontWeight:700,
                    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                    textAlign:"center", lineHeight:1.25,
                    background: greve === g.code ? "#dc2626" : "#fef2f2",
                    color: greve === g.code ? "#fff" : "#991b1b",
                  }}>
                    <span>{g.code}</span>
                    <span style={{fontSize:9,opacity:.8}}>{g.label}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Formation (09/08) : jamais ajoutee directement depuis ce popup
                — ecrite automatiquement par le module Formation au lancement
                d'une session AFO, ou par une auto-declaration ("Mes
                formations"). Depuis ce popup, seuls le retrait (decliner) et
                la restauration via le picker ci-dessous (10/08) sont
                possibles. */}
            {formation && (
              <div style={{marginTop:10, padding:"8px 10px", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8}}>
                  <span style={{fontSize:12, fontWeight:700, color:"#78350f"}}>🎓 {formation}</span>
                  <button onClick={() => setFormation(null)} style={{
                    background:"#fff", border:"1px solid #fde68a", borderRadius:6,
                    padding:"3px 8px", cursor:"pointer", fontSize:11, fontWeight:700, color:"#92400e",
                  }}>✕ Retirer</button>
                </div>
                <div style={{fontSize:10, color:"#92400e", marginTop:5}}>
                  Tu valides ta présence à cette formation en libérant le reste de cette journée (efface ta journée habituelle ci-dessus). Si tu ne peux pas y participer, clique "Retirer" — l'organisateur en sera informé.
                </div>
              </div>
            )}
            {/* Restaurer une participation (10/08) : n'apparaît que s'il
                existe une ou plusieurs sessions LANCEES ce jour précis où
                l'agent reste inscrit (même s'il avait décliné) — il choisit
                laquelle il rejoint, ce qui réécrit "formation" comme si la
                session venait tout juste d'être lancée pour lui. */}
            {!formation && formationsProposees.length > 0 && (
              <div style={{marginTop:10, padding:"8px 10px", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8}}>
                <div style={{fontSize:12, fontWeight:700, color:"#78350f", marginBottom:6}}>🎓 Formation(s) proposée(s) ce jour</div>
                <div style={{display:"flex", flexWrap:"wrap", gap:5}}>
                  {formationsProposees.map(f => (
                    <button key={f.id} onClick={() => setFormation(f.intitule)} style={{
                      background:"#fff", border:"1px solid #fde68a", borderRadius:6,
                      padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700, color:"#92400e",
                    }}>{f.intitule}</button>
                  ))}
                </div>
                <div style={{fontSize:10, color:"#92400e", marginTop:5}}>
                  Choisis la formation que tu vas suivre pour reprendre ta participation — enregistre ensuite en libérant le reste de cette journée.
                </div>
              </div>
            )}
            {showConges && (
              <div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:7}}>
                  <button onClick={() => { toggleType1("CA"); setCongeStatut(null); setShowConges(false); }} style={{
                    padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                    fontSize:12, fontWeight:700,
                    background: type1==="CA" ? "#16a34a" : "#f0fdf4",
                    color: type1==="CA" ? "#fff" : "#166534",
                  }}>✓ Accordé</button>
                  <button onClick={() => { toggleCongeStatut("demande"); setShowConges(false); }} style={{
                    padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                    fontSize:12, fontWeight:700,
                    background: congeStatut==="demande" ? "#eab308" : "#fefce8",
                    color: congeStatut==="demande" ? "#fff" : "#92400e",
                  }}>⏳ Demandé</button>
                  <button onClick={() => { toggleCongeStatut("refuse"); setShowConges(false); }} style={{
                    padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                    fontSize:12, fontWeight:700,
                    background: congeStatut==="refuse" ? "#dc2626" : "#fef2f2",
                    color: congeStatut==="refuse" ? "#fff" : "#991b1b",
                  }}>✕ Refusé</button>
                </div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:5}}>
                  Seul "Accordé" écrit dans le planning — "Demandé"/"Refusé" n'effacent jamais ce qui est déjà saisi ce jour-là, et alimentent le suivi dans le panneau Congés.
                </div>
              </div>
            )}
            {showVt && (
              <div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:7}}>
                  <button onClick={() => { toggleType1("VT"); setVtStatut(null); setShowVt(false); }} style={{
                    padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                    fontSize:12, fontWeight:700,
                    background: type1==="VT" ? "#16a34a" : "#f0fdf4",
                    color: type1==="VT" ? "#fff" : "#166534",
                  }}>✓ Accordé</button>
                  <button onClick={() => { toggleVtStatut("demande"); setShowVt(false); }} style={{
                    padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                    fontSize:12, fontWeight:700,
                    background: vtStatut==="demande" ? "#eab308" : "#fefce8",
                    color: vtStatut==="demande" ? "#fff" : "#92400e",
                  }}>⏳ Demandé</button>
                  <button onClick={() => { toggleVtStatut("refuse"); setShowVt(false); }} style={{
                    padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                    fontSize:12, fontWeight:700,
                    background: vtStatut==="refuse" ? "#dc2626" : "#fef2f2",
                    color: vtStatut==="refuse" ? "#fff" : "#991b1b",
                  }}>✕ Refusé</button>
                </div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:5}}>
                  Seul "Accordé" écrit dans le planning — "Demandé"/"Refusé" n'effacent jamais ce qui est déjà saisi ce jour-là, et alimentent le suivi dans le panneau VT.
                </div>
              </div>
            )}
            {showFetes && (
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:7}}>
                {FETES.map(f => {
                  // Message présent = déjà prise ailleurs OU déjà payée : dans les deux cas on
                  // bloque la sélection plutôt que de recréer une incohérence, et on affiche le
                  // message au TAP (pas seulement au survol — le title seul est invisible au
                  // doigt sur mobile, où cette appli est surtout utilisée).
                  const messageBlocage = fetesPrises?.[f.code];
                  return (
                    <button key={f.code} onClick={() => {
                      if(messageBlocage){ setFeteBloqueeMsg(messageBlocage); return; }
                      setFeteBloqueeMsg(null);
                      toggleType1(f.code); setShowFetes(false);
                    }}
                      title={messageBlocage||undefined}
                      style={{
                      padding:"4px 9px", borderRadius:7, border:"none",
                      cursor: messageBlocage ? "not-allowed" : "pointer",
                      fontSize:11, fontWeight:700,
                      opacity: messageBlocage ? 0.4 : 1,
                      background: type1 === f.code ? "#ec4899" : "#fdf2f8",
                      color: type1 === f.code ? "#fff" : "#9d174d",
                    }}>
                      <span>{f.code}</span>
                      <span style={{fontSize:9,opacity:.8,marginLeft:3}}>{f.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {feteBloqueeMsg && (
              <div style={{
                marginTop:7, padding:"9px 11px", borderRadius:8,
                background:"#fef3c7", border:"1.5px solid #f59e0b",
                fontSize:11, color:"#78350f", lineHeight:1.5,
                display:"flex", gap:7, alignItems:"flex-start",
              }}>
                <span style={{flex:1}}>⚠️ {feteBloqueeMsg}</span>
                <button onClick={()=>setFeteBloqueeMsg(null)} style={{
                  background:"none", border:"none", color:"#78350f", cursor:"pointer",
                  fontWeight:800, fontSize:13, flexShrink:0, padding:0,
                }}>✕</button>
              </div>
            )}
          </div>

          {/* ── Travail ── */}
          <div>
            <div style={{
              fontSize:10, color:"#94a3b8", fontWeight:700,
              marginBottom:7, textTransform:"uppercase", letterSpacing:.5,
            }}>
              Travail
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:7}}>
              {CODES_TRAVAIL.map(t => {
                const isActive = t.code === "N" ? !!typeN : type1 === t.code;
                return (
                  <button key={t.code} onClick={() => toggleType1(t.code)} style={{
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
                  </button>
                );
              })}
            </div>
            <div style={{fontSize:9,color:"#94a3b8",marginTop:5,fontStyle:"italic"}}>
              Nuit ↓ = prise de nuit ce soir — s'affiche en bas de case
            </div>
          </div>

          {/* ── Poste journée ── */}
          {/* Bug corrigé (21/08) : le regroupement en lignes POSTE_ROWS_J
              (19/08, demandé par Olivier UNIQUEMENT pour "Journée") était
              appliqué à tort aussi pour Matin/Soirée (isTravailJ couvre
              M/AM/J, pas seulement J) -- POSTE_ROWS_J ne liste que des
              codes de type J (Pauseur/DPX/PPRCI/PPAR/VM/CAF/AY), donc CCL/
              ADJ/LNE/LNO/VGD/LC/AC1/AC2 (postes M/AM/N) disparaissaient
              silencieusement du picker sous Matin/Soirée, même avec
              l'habilitation correspondante -- signalé par Olivier (habilité
              CCL, absent sous Matinée/Soirée). Le regroupement en lignes
              reste réservé à type1==="J" ; M/AM gardent la liste plate
              d'origine. Filet de sécurité ajouté en plus : un poste J
              habilité mais absent de POSTE_ROWS_J (code futur jamais ajouté
              à ce regroupement) reste affiché plutôt que de disparaître. */}
          {isTravailJ && postesJ.length > 0 && (
            <div>
              <div style={{
                fontSize:10, color:"#94a3b8", fontWeight:700,
                marginBottom:7, textTransform:"uppercase", letterSpacing:.5,
              }}>
                Poste
              </div>
              {type1 === "J" ? (
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {POSTE_ROWS_J.map((rowCodes,i) => {
                    const rowPostes = rowCodes.map(c => postesJ.find(p => p.code === c)).filter(Boolean);
                    if (rowPostes.length === 0) return null;
                    return (
                      <div key={i} style={{display:"flex",flexWrap:"wrap",gap:5}}>
                        {rowPostes.map(p => (
                          <button key={p.code} onClick={() => setPoste1(poste1===p.code?"":p.code)} style={{
                            padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                            fontSize:12, fontWeight:700,
                            background: poste1 === p.code ? "#1e293b" : "#f1f5f9",
                            color: poste1 === p.code ? "#fff" : "#475569",
                          }}>{p.label}</button>
                        ))}
                      </div>
                    );
                  })}
                  {(() => {
                    const groupes = new Set(POSTE_ROWS_J.flat());
                    const orphelins = postesJ.filter(p => !groupes.has(p.code));
                    if (orphelins.length === 0) return null;
                    return (
                      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                        {orphelins.map(p => (
                          <button key={p.code} onClick={() => setPoste1(poste1===p.code?"":p.code)} style={{
                            padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                            fontSize:12, fontWeight:700,
                            background: poste1 === p.code ? "#1e293b" : "#f1f5f9",
                            color: poste1 === p.code ? "#fff" : "#475569",
                          }}>{p.label}</button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {postesJ.map(p => (
                    <button key={p.code} onClick={() => setPoste1(poste1===p.code?"":p.code)} style={{
                      padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                      fontSize:12, fontWeight:700,
                      background: poste1 === p.code ? "#1e293b" : "#f1f5f9",
                      color: poste1 === p.code ? "#fff" : "#475569",
                    }}>{p.label}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Horaires ── */}
          {isTravailJ && (
            <div>
              <div style={{
                fontSize:10, color:"#94a3b8", fontWeight:700,
                marginBottom:5, textTransform:"uppercase", letterSpacing:.5,
              }}>
                Horaires
              </div>
              <input
                value={horaires1}
                onChange={e => setHoraires1(e.target.value)}
                placeholder="ex: 06h10–14h17"
                style={{
                  width:"100%", padding:"8px 12px",
                  border:"1.5px solid #e2e8f0", borderRadius:8,
                  fontSize:13, fontFamily:"monospace",
                  outline:"none", boxSizing:"border-box",
                }}
              />
            </div>
          )}

          {/* ── Poste de nuit ── */}
          {typeN && postesN.length > 0 && (
            <div>
              <div style={{
                fontSize:10, color:"#94a3b8", fontWeight:700,
                marginBottom:5, textTransform:"uppercase", letterSpacing:.5,
              }}>
                Poste de nuit
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {postesN.map(p => (
                  <button key={p.code} onClick={() => setPosteN(posteN===p.code?"":p.code)} style={{
                    padding:"5px 11px", borderRadius:8, border:"none", cursor:"pointer",
                    fontSize:12, fontWeight:700,
                    background: posteN === p.code ? "#1e293b" : "#f1f5f9",
                    color: posteN === p.code ? "#fff" : "#475569",
                  }}>{p.label}</button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ACTIONS */}
        <div style={{
          padding:"12px 16px", borderTop:"1px solid #e2e8f0",
          display:"flex", gap:8, flexShrink:0, background:"#fff",
        }}>
          <button onClick={onClose} style={{
            flex:1, padding:"10px", background:"#f1f5f9", color:"#64748b",
            border:"none", borderRadius:10, cursor:"pointer",
            fontSize:13, fontWeight:600,
          }}>Annuler</button>
          <button onClick={sauvegarder} style={{
            flex:2, padding:"10px",
            background:"#1e293b", color:"#fff",
            border:"none", borderRadius:10, cursor:"pointer",
            fontSize:13, fontWeight:700,
          }}>✓ Enregistrer</button>
        </div>

      </div>
    </div>
  );
}
