import React from "react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import api, { convertirCodePosteVersJsCode, resolveJsCode } from "./api/client";
import AdminPanel from "./components/AdminPanel";
import AgentHeader from "./components/AgentHeader";
import DayEditPopup from "./components/DayEditPopup";
import DemandeCongesView from "./components/DemandeCongesView";
import { CetDashboardModal, computeDashboardCet, getCetTransfereJours, EpargneCetWidget, EpargneFetesCetWidget } from "./components/CetView";
import CetPdfsView from "./components/CetPdfsView";
import D2iView from "./components/D2iView";
import FimPdfView from "./components/FimPdfView";
import SignaturePad from "./components/SignaturePad";
import FormationView from "./components/FormationView";
import StatsEquipeView from "./components/StatsEquipeView";


// ─── SYNC SUPABASE ────────────────────────────────────────────────────────────

// Sauvegarder le profil agent dans Supabase
async function sbSaveProfile(agentId, data) {
  return sbFetch(`agent_profiles?on_conflict=agent_id`, {
    method: 'POST',
    body: JSON.stringify({
      agent_id: agentId,
      pin_hash: data.pinHash||null,
      is_admin: data.isAdmin||false,
      roulement: data.roulement||null,
      is_reserve: data.isReserve||false,
      familles_hab: data.famillesHab||null,
      habilitations: data.habilitations||{},
      agent_colors: data.agentColors||{},
      pause_figee: data.pauseFigee||{},
      compteur_corrections: data.compteurCorrections||{},
      depart_date: data.departDate||null,
      // Nouveaux champs synchronisés multi-appareils
      fetes_tracking: data.fetesTracking||{},
      pause_figee_fia_mois: data.pauseFigeeFiaMois||{},
      pause_figee_fia_done: data.pauseFigeeFiaDone||{},
      demandes_conges: data.demandesConges||[],
      notifications_acquittees: data.notificationsAcquittees||[],
      updated_at: new Date().toISOString(),
    }),
  });
}

// Charger le profil agent depuis Supabase
async function sbLoadProfile(agentId) {
  const data = await sbFetch(`agent_profiles?agent_id=eq.${agentId}&select=*`);
  return data?.[0] || null;
}

// Sauvegarder une entrée de planning
async function sbSaveEntry(agentId, dk, entry) {
  return sbFetch(`schedule_entries?on_conflict=agent_id,date`, {
    method: 'POST',
    body: JSON.stringify({
      agent_id: agentId,
      date: dk,
      equipe: entry.equipe||null,
      equipe2: entry.equipe2||null,
      js_code: entry.jsCode||null,
      horaires: entry.horaires||null,
      prive: entry.prive||false,
      fin_nuit: entry.finNuit||false,
      impression_at: entry.impressionAt||null,
      updated_at: new Date().toISOString(),
    }),
  });
}

// Charger tout le planning d'un agent
async function sbLoadSchedule(agentId) {
  const data = await sbFetch(`schedule_entries?agent_id=eq.${agentId}&select=*`);
  if (!data) return {};
  const result = {};
  data.forEach(row => {
    result[`${row.agent_id}-${row.date}`] = {
      equipe: row.equipe,
      equipe2: row.equipe2,
      jsCode: row.js_code,
      horaires: row.horaires,
      prive: row.prive,
      finNuit: row.fin_nuit,
      impressionAt: row.impression_at,
    };
  });
  return result;
}

// Supprimer une entrée de planning
async function sbDeleteEntry(agentId, dk) {
  return sbFetch(`schedule_entries?agent_id=eq.${agentId}&date=eq.${dk}`, {
    method: 'DELETE'
  });
}

// ─── PERSISTANCE LOCALE (localStorage) ───────────────────────────────────────
function useSwipeHandlers(onSwipeLeft, onSwipeRight, threshold=50){
  const startX=useRef(null);
  const startY=useRef(null);
  const onTouchStart=(e)=>{
    startX.current=e.touches[0].clientX;
    startY.current=e.touches[0].clientY;
  };
  const onTouchEnd=(e)=>{
    if(startX.current===null)return;
    const deltaX=e.changedTouches[0].clientX-startX.current;
    const deltaY=e.changedTouches[0].clientY-startY.current;
    if(Math.abs(deltaX)>threshold&&Math.abs(deltaX)>Math.abs(deltaY)*1.5){
      if(deltaX<0)onSwipeLeft&&onSwipeLeft();
      else onSwipeRight&&onSwipeRight();
    }
    startX.current=null;startY.current=null;
  };
  return {onTouchStart,onTouchEnd};
}
function usePersist(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem("f2ppmp_" + key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch { return defaultValue; }
  });
  const setPersist = useCallback((next) => {
    setValue(prev => {
      const val = typeof next === "function" ? next(prev) : next;
      try { localStorage.setItem("f2ppmp_" + key, JSON.stringify(val)); } catch {}
      return val;
    });
  }, [key]);
  return [value, setPersist];
}
// Fusionne une reponse api.planning.getSchedule(agentId) dans le state schedule,
// en reconciliant les entrees de CET agent : une date qui n'existe plus cote
// serveur (supprimee sur un autre appareil, par un admin, ou en base) est
// retiree du cache local plutot que laissee en fantome indefiniment (bug
// decouvert le 04/08 - la fusion additive {...prev,...entries} ne peut jamais
// supprimer une cle absente de la nouvelle reponse). getSchedule(agentId) est
// toujours un instantane COMPLET du planning de cet agent (aucun parametre
// from/to cote appelant), donc toute cle "agentId-date" absente de entries
// n'existe vraiment plus. Les entrees d'autres agents (vue admin) ne sont
// jamais touchees.
function reconcileSchedule(prev, agentId, entries) {
  const next = { ...prev };
  const prefix = agentId + "-";
  Object.keys(next).forEach(k => {
    if (k.startsWith(prefix) && !(k in entries)) delete next[k];
  });
  Object.entries(entries).forEach(([k, v]) => { next[k] = v; });
  return next;
}

// ─── MIGRATION DONNÉES ────────────────────────────────────────────────────────
const DATA_VERSION = "1.0";
try {
  if (localStorage.getItem("f2ppmp_version") !== DATA_VERSION) {
    localStorage.setItem("f2ppmp_version", DATA_VERSION);
  }
} catch {}

// ─── SUPABASE ────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://vrhykmrbdakjycfqbzpt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaHlrbXJiZGFranljZnFienB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTM0MTAsImV4cCI6MjA5NTgyOTQxMH0.LMAwtDR3hSliWV89KO9cRIaC3Wy2QGDh5r8Hl_G_4pY";
async function sbFetch(path, opts={}) {
  if (!SUPABASE_URL || SUPABASE_URL==="VOTRE_URL_SUPABASE") return null;
  const {headers:extraHeaders, ...restOpts} = opts;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...restOpts,
    headers:{
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": restOpts.method==="POST"?"resolution=merge-duplicates":"",
      ...(extraHeaders||{}),
    },
  });
  if (!res.ok) {
    console.error("Supabase error:", res.status, path);
    return null;
  }
  return res.json().catch(()=>null);
}
const sb = {
  select:(t,q="")=>sbFetch(`${t}?${q}`),
  insert:(t,b)=>sbFetch(t,{method:"POST",body:JSON.stringify(b)}),
  update:(t,m,b)=>sbFetch(`${t}?${m}`,{method:"PATCH",body:JSON.stringify(b),headers:{"Prefer":"return=representation"}}),
  delete:(t,m)=>sbFetch(`${t}?${m}`,{method:"DELETE"}),
  upsert:(t,b)=>sbFetch(t,{method:"POST",body:JSON.stringify(b),headers:{"Prefer":"resolution=merge-duplicates,return=representation"}}),
};

// ─── DONNÉES MÉTIER ───────────────────────────────────────────────────────────
const FAMILLES = {
  // highlightBg (19/08, demande d'Olivier "rendre visible tout de suite ou est
  // son nom" dans CPS Officiel/Previsionnel) : version nettement plus saturee
  // de la couleur de famille (deja utilisee pour l'accent/le badge PRCI-PAR),
  // reservee a la case de l'agent connecte -- jamais utilisee pour une case normale.
  PRCI:{ label:"PRCI PMP",        color:"#0f4c81", accent:"#3b82f6", light:"#eff6ff", highlightBg:"#bfdbfe" },
  PAR: { label:"PAR LGV Réserve", color:"#064e3b", accent:"#10b981", light:"#ecfdf5", highlightBg:"#a7f3d0" },
};

// Postes 3x8 ordonnés
const POSTES_PRCI_3x8 = [
  { code:"CCL", label:"CCL",     M:"PICCL-", AM:"PICCLO", N:"PICCLX" },
  { code:"ADJ", label:"Adj CCL", M:"PIADJ-", AM:"PIADJO", N:"PIADJX" },
  { code:"LNE", label:"AC LNE",  M:"PILNE-", AM:"PILNEO", N:"PILNEX" },
  { code:"LNO", label:"AC LNO",  M:"PILNO-", AM:"PILNOO", N:"PILNOX" },
  { code:"VGD", label:"AC VGD",  M:"PIVGD-", AM:"PIVGDO", N:null     },
  { code:"LC",  label:"AC LC",   M:"PILCL-", AM:"PILCLO", N:"PILCLX" },
];
// Postes structurellement non tenus certains jours (regle metier fixe, distincte des aleas signales)
const POSTES_NON_TENU_PAR_JOUR = {
  5: ["PAACXX"], // vendredi (index 4 = Ve dans dayIdx 0=Lu..6=Di, mais ici on utilise le jour ISO: 5=vendredi)
  6: ["PIPA1J","PIPA2J","PIPA3J","PIVGDO","PIADJX","PAPAUJ","PAASMJ","PAAC2O","PAAC2X","PAACXX"], // samedi (PIVGD- existe le samedi avec horaire different)
  0: ["PIVGD-","PIPA1J","PIPA2J","PIPA3J","PAAC2-","PAPAUJ","PAASMJ","PAAC2X","PAACXX"], // dimanche (PIVGD- non tenu matin, PIVGDO existe soiree avec horaire different donc absent de la liste)
};
function estNonTenuWeekend(jsCode, dateKey){
  const jourSemaine=new Date(dateKey+"T12:00:00").getDay(); // 0=dimanche,5=vendredi,6=samedi
  const liste=POSTES_NON_TENU_PAR_JOUR[jourSemaine];
  return liste ? liste.includes(jsCode) : false;
}
// Un jour ferie est traite comme un dimanche pour ces regles de postes
// structurellement non tenus (15/08, demande d'Olivier) — peu importe le
// jour de semaine reel sur lequel il tombe. Reutilise getDatesFetesAnnee
// (calcul deja fiabilise le 13/08 sur 2020-2050) plutot qu'une liste
// figee, pour rester juste tant que les dates de fetes sont calculables.
function estJourFerie(dateKey){
  const annee=parseInt(dateKey.slice(0,4),10);
  const dates=getDatesFetesAnnee(annee);
  return Object.values(dates).includes(dateKey);
}
function jourSuivant(dateKey){
  const d=new Date(dateKey+"T12:00:00");
  d.setDate(d.getDate()+1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
// Combine week-end + ferie (traite comme dimanche) + cas particulier PIADJX
// (nuit Adj CCL non tenue la veille d'un ferie, quel que soit le jour de la
// semaine — ex. nuit du 13/07 avant le 14 juillet). Renvoie le motif pour
// distinguer l'affichage "(week-end)" vs "(férié)", demande explicitement
// par Olivier — reste modifiable via le meme bouton 🔄 (renfort/alea) que
// le week-end, aucun changement necessaire de ce cote.
function estNonTenu(jsCode, dateKey){
  // Le week-end est toujours prioritaire sur le ferie : si un ferie tombe
  // un samedi ou un dimanche, on garde le libelle "week-end" deja existant
  // plutot que de le rebasculer en "ferie" — demande explicite d'Olivier
  // le 15/08 ("pas utile de mettre en ferie" dans ce cas).
  if(estNonTenuWeekend(jsCode,dateKey)) return {nonTenu:true, motif:"weekend"};
  if(estJourFerie(dateKey) && (POSTES_NON_TENU_PAR_JOUR[0]||[]).includes(jsCode)) return {nonTenu:true, motif:"ferie"};
  if(jsCode==="PIADJX" && estJourFerie(jourSuivant(dateKey))) return {nonTenu:true, motif:"ferie"};
  return {nonTenu:false, motif:null};
}
const POSTES_PAR_3x8 = [
  { code:"AC1",  label:"AC PAR",        M:"PAAC1-", AM:"PAAC1O", N:"PAAC1X" },
  { code:"AC2",  label:"Aide AC PAR",   M:"PAAC2-", AM:"PAAC2O", N:"PAAC2X" },
  { code:"ACXX", label:"CT AC Travaux", M:null,      AM:null,     N:"PAACXX" },
];

// Postes journée PRINCIPAUX (affichés dans section Journée)
const POSTES_JOURNEE_PRCI_PRINCIPAUX = ["PIPA1J","PIPA2J","PIPA3J"];
const POSTES_JOURNEE_PAR_PRINCIPAUX  = ["PAPAUJ","PAASMJ"];

// TOUS les postes journée avec métadonnées
const POSTES_JOURNEE = [
  { jsCode:"PIPA1J",  label:"Pauseur CCL",     horaires:"08h45–18h15", famille:"PRCI", maxSlots:1, allowFormation:false,  pause:"13h15–15h00", principal:true  },
  { jsCode:"PIPA2J",  label:"Pauseur Adjoint",     horaires:"10h15–19h45", famille:"PRCI", maxSlots:1, allowFormation:false,  pause:"13h15–15h00", principal:true  },
  { jsCode:"PIPA3J",  label:"Pauseur VGD",     horaires:"08h45–16h30", famille:"PRCI", maxSlots:1, allowFormation:false, pause:null,           principal:true  },
  { jsCode:"PIDPXJ",  label:"DPX PRCI",        horaires:"08h00–16h45", famille:"PRCI", maxSlots:1, allowFormation:false, pause:"12h00–13h00",  principal:false },
  { jsCode:"PIASSJ",  label:"Adj DPX PRCI",    horaires:"08h00–16h45", famille:"PRCI", maxSlots:1, allowFormation:false, pause:"12h00–13h00",  principal:false },
  { jsCode:"SD%",     label:"SD",              subtitle:"Service doux", horaires:"08h00–16h43", famille:"PRCI", maxSlots:1, allowFormation:false, pause:"12h00–13h00", principal:false },
  { jsCode:"F-PRCI",  label:"K-PRCI",          subtitle:"Formation PRCI", horaires:"09h00–17h45", famille:"PRCI", maxSlots:6, allowFormation:false, pause:"12h00–13h00", principal:false },
  { jsCode:"AFOPRCI", label:"AFO PRCI",         horaires:"09h00–16h45", famille:"PRCI", maxSlots:2, allowFormation:false, pause:"12h00–13h00",  principal:false },
  { jsCode:"CAF",     label:"CAF",              subtitle:"Certificat d'Aptitude à la Fonction", horaires:"09h00–14h30", famille:"PRCI", maxSlots:1, allowFormation:false, pause:null, principal:false },
  { jsCode:"PPRCI",   label:"PPRCI",            horaires:"09h00–16h45", famille:"PRCI", maxSlots:1, allowFormation:false, pause:null,           principal:false },
  { jsCode:"VM",      label:"VM",               subtitle:"Visite médicale", horaires:"Variable", famille:"PRCI", maxSlots:99, allowFormation:false, pause:null, principal:false },
  { jsCode:"PAPAUJ",  label:"Pauseur PAR",      horaires:"09h00–17h45", famille:"PAR",  maxSlots:1, allowFormation:false, pause:"12h45–13h45",  principal:true  },
  { jsCode:"PADPXJ",  label:"DPX PAR",          horaires:"08h00–16h45", famille:"PAR",  maxSlots:1, allowFormation:false, pause:"12h00–13h00",  principal:false },
  { jsCode:"PAASMJ",  label:"ASMTE PAR",        horaires:"08h00–16h45", famille:"PAR",  maxSlots:1, allowFormation:false,  pause:"12h00–13h00",  principal:true  },
  { jsCode:"AFO PAR", label:"AFO PAR",           horaires:"09h00–16h45", famille:"PAR",  maxSlots:2, allowFormation:false, pause:null,           principal:false },
  { jsCode:"K-PAR",   label:"K-PAR",             subtitle:"Formation PAR",   horaires:"09h00–17h45", famille:"PAR",  maxSlots:2,  allowFormation:false, pause:"12h00–13h00", principal:false },
  { jsCode:"F-PAR",   label:"F-PAR",             subtitle:"Formateur PAR",   horaires:"09h00–17h45", famille:"PAR",  maxSlots:4,  allowFormation:false, pause:"12h00–13h00", principal:false },
  // PRCI supplémentaires
  { jsCode:"K-PRCI",  label:"K-PRCI",            subtitle:"Formation PRCI",  horaires:"09h00–17h45", famille:"PRCI", maxSlots:4,  allowFormation:false, pause:"12h00–13h00", principal:false },
  { jsCode:"A-PRCI",  label:"A-PRCI",            subtitle:"Assistant PRCI",  horaires:"09h00–17h45", famille:"PRCI", maxSlots:4,  allowFormation:false, pause:"12h00–13h00", principal:false },
  { jsCode:"DISPO",   label:"DISPO",             subtitle:"Disponible",      horaires:"Variable",     famille:"PRCI", maxSlots:99, allowFormation:false, pause:null,          principal:false },
];

// Codes fêtes légales SNCF
const CODES_FETES = {
  "F1":"1er Janvier",
  "F2":"Lundi de Pâques",
  "F3":"1er Mai",
  "F4":"Ascension",
  "FV":"8 Mai",
  "F5":"Lundi de Pentecôte",
  "F6":"14 Juillet",
  "F7":"15 Août",
  "F8":"1er Novembre",
  "F9":"11 Novembre",
  "F0":"Noël",
  "VN":"Samedi veille de Noël (si Noël = dimanche)",
};

// Équipes avec flag prive et couleur agenda perso
export const EQUIPES = [
  // ── TRAVAIL — fond intense, texte blanc ──────────────────────────────────
  { code:"M",    label:"Matinée",    heures:"06h10–14h17", color:"#8B0000", textColor:"#fff", dot:"#fca5a5", prive:false, compteur:"travail", bg:"#8B0000" },
  { code:"AM",   label:"Soirée",     heures:"14h05–22h17", color:"#8B0000", textColor:"#fff", dot:"#fca5a5", prive:false, compteur:"travail", bg:"#8B0000" },
  { code:"N",    label:"Nuit",       heures:"22h15–06h17", color:"#8B0000", textColor:"#fff", dot:"#fca5a5", prive:false, compteur:"travail", bg:"#8B0000" },
  { code:"J",    label:"Journée",    heures:"08h00–17h45", color:"#8B0000", textColor:"#fff", dot:"#fca5a5", prive:false, compteur:"travail", bg:"#8B0000" },
  { code:"JF",   label:"Fête",  heures:"",            color:"#ec4899", textColor:"#fff", dot:"#fce7f3", prive:false, compteur:"FETE",    bg:"#ec4899" },
  // ── REPOS / RÉSERVISTE — fond coloré, texte blanc ────────────────────────
  { code:"RP",   label:"RP",         heures:"",            color:"#16a34a", textColor:"#fff", dot:"#bbf7d0", prive:true,  compteur:"RP",      bg:"#16a34a" },
  { code:"RPP",  label:"RPP",        heures:"",            color:"#0d9488", textColor:"#fff", dot:"#99f6e4", prive:true,  compteur:"RP",      bg:"#0d9488" },
  { code:"RU",   label:"RU",         heures:"",            color:"#ca8a04", textColor:"#fff", dot:"#fef9c3", prive:true,  compteur:"RU",      bg:"#ca8a04" },
  // RQ recoloré le 18/08 (Olivier, audit UI, suite du correctif RU/RQ sur
  // DETAIL_CONFIG/CARDS/DEFAULT_COLORS — EQUIPES avait été oublié, gouverne
  // la vue CPS Officiel non-modifiable) — même fuchsia que le reste.
  { code:"RQ",   label:"RQ",         heures:"",            color:"#a21caf", textColor:"#fff", dot:"#f5d0fe", prive:true,  compteur:"RU",      bg:"#a21caf" },
  { code:"TC",   label:"TC",         heures:"",            color:"#0284c7", textColor:"#fff", dot:"#e0f2fe", prive:true,  compteur:"TC",      bg:"#0284c7" },
  // TY recoloré le 18/08 (Olivier, audit UI : "TC et TY partagent exactement
  // la même couleur" dans EQUIPES/CARDS, alors que DEFAULT_COLORS les
  // différenciait déjà) — violet distinct, ne collisionne pas avec CET (#7c3aed).
  { code:"TY",   label:"TY",         heures:"",            color:"#9333ea", textColor:"#fff", dot:"#f3e8ff", prive:true,  compteur:"TC",      bg:"#9333ea" },
  { code:"RN",   label:"RN",         heures:"",            color:"#4338ca", textColor:"#fff", dot:"#e0e7ff", prive:true,  compteur:"RN",      bg:"#4338ca" },
  { code:"NU",   label:"NU",         heures:"",            color:"#475569", textColor:"#fff", dot:"#cbd5e1", prive:false, compteur:"RU",      bg:"#475569" },
  { code:"CA",   label:"Congés", heures:"",            color:"#eab308", textColor:"#fff", dot:"#fef9c3", prive:true,  compteur:"CP",      bg:"#eab308" },
  { code:"CP",   label:"Congés",      heures:"",            color:"#eab308", textColor:"#fff", dot:"#fef9c3", prive:true,  compteur:"CP",      bg:"#eab308" },
  { code:"MA",   label:"Maladie",    heures:"",            color:"#dc2626", textColor:"#fff", dot:"#fecaca", prive:true,  compteur:"ABS",     bg:"#dc2626" },
  { code:"VT",   label:"VT",         heures:"",            color:"#eab308", textColor:"#fff", dot:"#fef9c3",  prive:true,  compteur:"ABS",     bg:"#eab308" },
  { code:"ABS",  label:"Absent",     heures:"",            color:"#dc2626", textColor:"#fff", dot:"#fecaca", prive:true,  compteur:"ABS",     bg:"#dc2626" },
  { code:"FOR",  label:"Formation",  heures:"",            color:"#b45309", textColor:"#fff", dot:"#fef9c3", prive:false, compteur:"FOR",     bg:"#b45309" },
  { code:"DISPO",label:"Dispo",      heures:"",            color:"#059669", textColor:"#fff", dot:"#d1fae5", prive:false, compteur:"DISPO",   bg:"#059669" },
  { code:"VM",   label:"VM",         heures:"",            color:"#6b7280", textColor:"#fff", dot:"#f3f4f6", prive:true,  compteur:"ABS",     bg:"#6b7280" },
  // CET (06/08) : jour d'utilisation en temps du Compte Épargne Temps, écrit
  // dans le planning perso à l'accord d'un mouvement "utilisation" (voir
  // CetView.jsx) — même principe que VT, compteur générique "ABS".
  { code:"CET",  label:"CET",        heures:"",            color:"#7c3aed", textColor:"#fff", dot:"#ede9fe", prive:true,  compteur:"ABS",     bg:"#7c3aed" },
  ...Object.keys(CODES_FETES).map(k=>({ code:k, label:k, heures:"", color:"#ec4899", textColor:"#fff", dot:"#fce7f3", prive:true, compteur:"FETE", bg:"#ec4899" })),
];
const EQ = Object.fromEntries(EQUIPES.map(e=>[e.code,e]));

// Césures manuelles (trait d'union invisible ­) pour les libellés qui débordent
// dans les cases étroites de la vue Mois — hyphens:"auto" (CSS) ne se déclenche pas de
// façon fiable dans tous les environnements (dictionnaire de coupure absent), donc on
// choisit nous-mêmes un point de coupure correct plutôt que de laisser le navigateur
// couper au milieu d'une syllabe (ex: "Matiné"+"e" tout seul en dessous).
const CESURES_LABEL = {
  "Matinée":"Mati­née", "Soirée":"Soi­rée", "Journée":"Jour­née",
  "Congés":"Con­gés", "Maladie":"Mala­die", "Formation":"For­ma­tion",
};
const avecCesure = (s) => CESURES_LABEL[s] || s;

// EQ_COLORS — alias de EQ avec mapping bg/tc/dot pour compatibilité
const EQ_COLORS = Object.fromEntries(
  Object.entries(EQ).map(([k,v])=>[k,{
    ...v,
    bg: v.bg||v.color,
    tc: v.textColor||v.tc,
    dot: v.dot,
    label: v.label,
    prive: v.prive||false,
  }])
);
// ─── IMPORT BULLETIN DE COMMANDE / DÉROULÉ PRÉVISIONNEL ──────────────────────
const BULLETIN_OCR_APIKEY = "K85147389088957";

// Échelle de rendu adaptative pour l'OCR (23/08, cas réel : un "roulement"
// scanné en une seule page à résolution native déjà élevée, ~1740x2508 —
// le rendu à scale=3.0 fixe produisait une image ~5220x7524 (~39 mégapixels),
// trop volumineuse pour OCR.space (échec systématique des 2 moteurs, "signal
// is aborted without reason", confirmé en conditions réelles). scale=3.0
// reste pertinent et inchangé pour un scan classique de résolution native
// modeste (ex. une page A4 595x842 -> ~1785x2526 à 3x, jamais un problème
// historiquement) — le vrai bug était l'absence de plafond, pas la valeur
// 3.0 elle-même. Garde 3.0 pour les pages "normales", ne le réduit que
// lorsque la page native est déjà grande, pour ne jamais dépasser maxDim
// sur le plus grand côté. maxDim=2600 (abaissé de 3000 le 23/08, mesuré
// insuffisant : 3000+JPEG q0.85 donnait encore 1.03 Mo sur le cas réel,
// juste AU-DESSUS de la vraie limite du plan gratuit OCR.space — confirmée
// exactement 1 Mo par fichier, documentation officielle) — vise une marge
// de sécurité réelle plutôt que de coller pile à la limite.
function computeOcrScale(page, maxDim = 2600) {
  const native = page.getViewport({ scale: 1.0 });
  const longSide = Math.max(native.width, native.height);
  return Math.min(3.0, maxDim / longSide);
}

async function ocrSpaceRequest(imageB64, mimeType, engine, timeoutMs) {
  const form = new URLSearchParams();
  form.append("apikey", BULLETIN_OCR_APIKEY);
  form.append("base64Image", "data:" + mimeType + ";base64," + imageB64);
  form.append("filetype", "Auto");
  form.append("OCREngine", engine);
  form.append("isTable", "true");
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: form, signal: controller.signal });
    const data = await res.json();
    if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage?.[0] || "Erreur OCR");
    return data.ParsedResults?.map(r => r.ParsedText).join("\n") || "";
  } finally {
    clearTimeout(t);
  }
}

// Moteur 2 = meilleure lecture des tableaux mais parfois surchargé côté ocr.space
// (timeout après 60s constaté le 03/08) — on borne l'attente à 25s puis on
// bascule automatiquement sur le moteur 1 (plus rapide, moins précis sur les
// tableaux mais reste fiable) plutôt que de laisser l'agent attendre une minute
// pour rien à chaque import.
async function ocrImageViaOcrSpace(imageB64, mimeType) {
  try {
    const text = await ocrSpaceRequest(imageB64, mimeType, "2", 25000);
    if (text) return text;
  } catch (e) {
    console.warn("OCR moteur 2 indisponible, nouvelle tentative avec le moteur 1:", e.message);
  }
  return ocrSpaceRequest(imageB64, mimeType, "1", 45000);
}

// Regroupe les items de texte d'une page en "rangees" par PROXIMITE reelle du Y
// (au lieu d'un simple Math.round a l'entier le plus proche) : sur les feuilles
// de presence SNCF (CPS Officiel + bulletin de commande), les colonnes d'une
// meme rangee (code JS, horaire, Nom...) peuvent avoir un Y qui varie de
// quelques diziemes de point d'une colonne a l'autre (decalage de ligne de
// base typographique) - assez pour, de temps en temps, tomber de part et
// d'autre d'une frontiere d'arrondi (ex: 594.48 arrondi a 594 mais 594.96
// arrondi a 595) et scinder a tort UNE SEULE vraie rangee en deux morceaux
// distincts (code JS isole d'un cote, Nom isole de l'autre). Cause racine
// confirmee par script de diagnostic sur 2 PDF reels (17/08 : import CPS
// PRCI/PAR "devenu tres mauvais", agents manquants + mal attribues) : le code
// JS orphelin ne trouve alors aucun nom dans sa propre ligne et est rejete
// (`if(!ag) return`), pendant que le Nom orphelin se recolle sur une tout
// autre rangee (regle de fusion "pas de jsCode/horaire -> rattacher a la
// ligne precedente") - source des 2 symptomes signales (jours non detectes +
// mauvais poste). Seuil de 3.0pt choisi apres mesure : les vrais ecarts
// intra-rangee observes sont <2pt, les vrais ecarts entre 2 rangees
// distinctes sont >12pt - plateau de resultats identiques confirme de 3 a
// 8pt (aucune sur-fusion de rangees reellement distinctes a ce seuil).
function clusterizeRowsByProximity(items, tolerance = 3.0) {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const clusters = [];
  let current = null, anchorY = null;
  sorted.forEach(it => {
    if (current === null || Math.abs(anchorY - it.y) > tolerance) {
      current = [];
      clusters.push(current);
      anchorY = it.y;
    }
    current.push(it);
  });
  return clusters.map(c => c.sort((a, b) => a.x - b.x).map(o => o.s).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean);
}

async function extraireTextePdfNatif(base64Pdf) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
  const raw = atob(base64Pdf);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tcontent = await page.getTextContent();
    const items = tcontent.items.map(it => ({ y: it.transform[5], x: it.transform[4], s: it.str }));
    pages.push(clusterizeRowsByProximity(items).join("\n"));
  }
  return pages.join("\n");
}

// Déduit le code_equipe (M/AM/N/J/RP/CA/...) depuis le code brut "Utilisation" du bulletin
function deriveCodeEquipeBulletin(code, heureDebut) {
  if (/^RPP$/.test(code)) return "RPP";
  if (/^RP$/.test(code)) return "RP";
  if (/^RU$/.test(code)) return "RU";
  if (/^RQ$/.test(code)) return "RQ";
  if (/^C$/.test(code) || /^CA$/.test(code)) return "CA";
  if (/^F[0-9V]$/.test(code)) return code; // fête précise (F1..F9, F0, FV) — conservée telle quelle pour le suivi exact
  if (/^F-[A-Z]{2,5}$/.test(code)) return "FOR";
  if (/^NU$/.test(code)) return "NU";
  // Formation en doublon sur un poste : le marqueur "/" en fin de code (ex: "PIADJX/")
  // est parfois corrompu en "J" à l'extraction ("PIADJXJ") — dans ce cas précis (un
  // second suffixe -/O/X/J directement après un premier -/O/X), c'est le PREMIER
  // suffixe qui donne la véritable équipe (ici X = Nuit), pas le second.
  if (code.length >= 2 && code[code.length - 1] === "J" && /[-OX]/.test(code[code.length - 2])) {
    const base = code[code.length - 2];
    if (base === "-") return "M";
    if (base === "O") return "AM";
    return "N";
  }
  if (code.endsWith("J")) return "J";
  if (code.endsWith("-")) return "M";
  if (code.endsWith("O")) return "AM";
  if (code.endsWith("X")) return "N";
  // fix (18/08) : un code "PH..." (autre UO, ex: PH0003) n'a aucun des suffixes
  // -/O/X/J connus — faute d'horaire fourni par le déroulé prévisionnel pour
  // en déduire l'équipe, traité par défaut comme une Journée générique plutôt
  // que d'être perdu (equipe=null aurait empêché toute écriture planning).
  if (/^PH/.test(code)) return "J";
  if (heureDebut) {
    const h = parseInt(heureDebut.slice(0, 2), 10);
    if (h >= 4 && h < 11) return "M";
    if (h >= 11 && h < 20) return "AM";
    return "N";
  }
  return null;
}

// Déroulé prévisionnel : pas d'horaire fourni dans le document -> horaire générique de l'équipe (EQUIPES)
function deduireHoraireGeneriqueEquipe(codeEquipe) {
  const eq = EQ[codeEquipe];
  if (!eq || !eq.heures) return { heure_debut: null, heure_fin: null };
  const m = eq.heures.match(/(\d{2})h(\d{2}).(\d{2})h(\d{2})/);
  if (!m) return { heure_debut: null, heure_fin: null };
  return { heure_debut: `${m[1]}:${m[2]}:00`, heure_fin: `${m[3]}:${m[4]}:00` };
}

// Retrouve le libellé lisible d'un poste (ex: "CCL", "AC PAR") à partir de son code jsCode (ex: "PICCL-")
export function getPosteLabelFromCode(jsCode) {
  if (!jsCode) return null;
  // AY (19/08, demandé par Olivier) : volontairement PAS dans POSTES_JOURNEE
  // -- cette table alimente aussi la construction des rangées de GlobalView
  // (CPS Officiel ET Planning Prévisionnel, chemin partagé), et AY doit
  // "rester à 100% dans le perso" (jamais y apparaître). Résolu ici en dur,
  // uniquement pour ce lookup de label (utilisé uniquement par PersonalView
  // et l'import perso, jamais par GlobalView).
  if (jsCode === "AY") return "AY - Absence";
  // Journée équipe (21/08) : même raison qu'AY juste au-dessus -- jamais
  // dans POSTES_JOURNEE, résolue ici en dur.
  if (jsCode === "JEQ") return "Journée équipe";
  // RFT SAM (23/08) : jamais dans POSTES_PAR_3x8 (voir POSTE_REGISTRY),
  // résolu ici en dur -- son propre code sert déjà de libellé lisible.
  if (jsCode === "RFT SAM") return "RFT SAM";
  const tousPostes3x8 = [...POSTES_PRCI_3x8, ...POSTES_PAR_3x8];
  const p3x8 = tousPostes3x8.find(p => p.M === jsCode || p.AM === jsCode || p.N === jsCode);
  if (p3x8) return p3x8.label;
  const pj = POSTES_JOURNEE.find(p => p.jsCode === jsCode);
  if (pj) return pj.label;
  return null;
}

// Parse un bulletin de commande SNCF (texte déjà extrait, PDF natif ou OCR) :
// capture la date d'édition + chaque jour (code "Utilisation" + PS/FS si présents)
function parseBulletinCommande(text) {
  const editionMatch = text.match(/Edition le\s*(\d{2})[\/1](\d{2})\/(\d{4})\s*,?\s*(\d{2}):(\d{2})/i);
  const editionDate = editionMatch
    ? `${editionMatch[3]}-${editionMatch[2]}-${editionMatch[1]} ${editionMatch[4]}:${editionMatch[5]}:00`
    : null;

  // Codes valides reconnus (postes 3x8 PI/PA se terminant par -, O, X ou J ; codes spéciaux ;
  // codes formation type "F-PAR", avec ou sans espace après le tiret ; NU ; RFT SAM)
  const CODE_RE = /\b(?:RPP|RP|RU|RQ|CA|NU|DISPO|F[0-9V]|F-\s?[A-Z]{2,5}|C)\b|\bRFT\s?SAM\b|\b(?:P[Ii]|P[Aa])[A-Z0-9]{2,6}[-OXJ]/g;

  // On neutralise les dates des lignes d'en-tête ("Edition le..." et "Commande allant du...")
  // pour qu'elles ne soient pas prises pour des jours du tableau (même longueur de texte
  // préservée pour ne pas décaler les positions utilisées ensuite).
  let workText = text;
  const editionLine = text.match(/Edition le\s*\d{2}[\/1]\d{2}\/\d{4}\s*,?\s*\d{2}:\d{2}/i);
  if (editionLine) workText = workText.slice(0, editionLine.index) + " ".repeat(editionLine[0].length) + workText.slice(editionLine.index + editionLine[0].length);
  const periodeLine = workText.match(/Commande allant du\s*\d{2}[\/1]\d{2}\/\d{4}\s*au\s*\d{2}[\/1]\d{2}\/\d{4}/i);
  if (periodeLine) workText = workText.slice(0, periodeLine.index) + " ".repeat(periodeLine[0].length) + workText.slice(periodeLine.index + periodeLine[0].length);

  // Découpage par DATE (JJ/MM/AAAA) : les dates restent quasi toujours intactes, contrairement
  // aux noms de jour (ex: "Ven" -> "yen"). On tolère aussi un "/" mal reconnu en "1"
  // (ex: "04107/2026"), défaut récurrent observé sur plusieurs bulletins.
  const dateRe = /(\d{2})[\/1](\d{2})\/(\d{4})/g;
  const dateMatches = [...workText.matchAll(dateRe)];

  // Association jour <-> code : ancrée sur l'abréviation du jour (Sam/Dim/Lun...) plutôt que
  // sur la proximité textuelle avec la date. La proximité pure se plante quand deux jours sont
  // très rapprochés dans le texte (ex: "RP" suivi d'une annotation courte) : le point milieu de
  // la fenêtre de recherche peut tomber EN PLEIN MILIEU du mot du code juste avant la date, le
  // rendant invisible — le code du jour SUIVANT se fait alors voler sa place, un décalage qui se
  // propage ensuite en cascade sur tous les jours suivants. L'abréviation du jour précède
  // toujours son propre code sans ambiguïté, quelle que soit la longueur du contenu : ancrage
  // bien plus fiable, confirmé sur bulletin réel (04/2026, agent 9308712R).
  const DAY_ABBR_RE = /\b(Mer|Jeu|Ven|Sam|Dim|Lun|Mar)\b/g;
  const dayMatches = [...workText.matchAll(DAY_ABBR_RE)];
  const codesParJour = dayMatches.map((dayM, idx) => {
    const zoneStart = dayM.index + dayM[0].length;
    const zoneEnd = idx + 1 < dayMatches.length ? dayMatches[idx + 1].index : workText.length;
    const zone = workText.slice(zoneStart, zoneEnd);
    // Cas particulier "Pauseur" : le code affiché (ex. PIPA2J) manque parfois entièrement
    // du texte extrait, alors que le sous-code "du PIPA2E" lui est toujours présent. On le
    // détecte en priorité et on en déduit le code (E -> J).
    const pauseurMatch = zone.match(/\bdu\s+PIPA([123])E\b/i);
    if (pauseurMatch) return `PIPA${pauseurMatch[1]}J`;
    CODE_RE.lastIndex = 0;
    let cm;
    while ((cm = CODE_RE.exec(zone)) !== null) {
      const before = zone.slice(Math.max(0, cm.index - 5), cm.index);
      if (/\bdu\s*$/i.test(before)) continue;
      return cm[0].replace(/^(F-)\s+/, "$1"); // normalise "F- PAR" -> "F-PAR"
    }
    return null;
  });

  const jours = [];
  const echecs = [];

  for (let i = 0; i < dateMatches.length; i++) {
    const dm = dateMatches[i];
    const dateJour = `${dm[3]}-${dm[2]}-${dm[1]}`;
    // Zone horaires : jusqu'à la date suivante (PS/FS apparaissent toujours après la date
    // dans le document). Sert aussi à détecter l'annotation RPP juste après la date.
    const finZone = i + 1 < dateMatches.length ? dateMatches[i + 1].index : text.length;
    const zoneHoraires = text.slice(dm.index + dm[0].length, finZone);

    const code = codesParJour[i];
    if (!code) { echecs.push({ date: dateJour, motif: "code_illisible" }); continue; }

    // Toutes les heures HH:MM trouvées dans la zone, triées chronologiquement : la plus
    // tôt est l'heure de début, la plus tardive la fin (inversé pour la nuit, qui traverse
    // minuit). Plus robuste que d'associer chaque label PS/FS à une valeur, l'ordre du texte
    // étant trop variable selon les défauts d'extraction du PDF. Le ":" est parfois perdu à
    // l'extraction et remplacé par un simple espace (ex: "13 00" au lieu de "13:00") : on
    // tolère les deux, avec limite de minutes (0-59) pour éviter de confondre avec d'autres
    // paires de nombres fortuites.
    const valeurs = [...zoneHoraires.matchAll(/\b([01]\d|2[0-3])[:\s]([0-5]\d)\b/g)]
      .map(m => ({ h: m[1], mn: m[2], total: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) }))
      .sort((a, b) => a.total - b.total);
    const codeEquipeProvisoire = deriveCodeEquipeBulletin(code, null);
    let heureDebut = null, heureFin = null;
    if (valeurs.length === 1) {
      heureDebut = `${valeurs[0].h}:${valeurs[0].mn}:00`;
    } else if (valeurs.length >= 2) {
      const min = valeurs[0], max = valeurs[valeurs.length - 1];
      if (codeEquipeProvisoire === "N") {
        heureDebut = `${max.h}:${max.mn}:00`;
        heureFin = `${min.h}:${min.mn}:00`;
      } else {
        heureDebut = `${min.h}:${min.mn}:00`;
        heureFin = `${max.h}:${max.mn}:00`;
      }
    }

    const codeEquipeBrut = deriveCodeEquipeBulletin(code, heureDebut);
    // Sur le bulletin réel, un RPP est imprimé comme "RP" suivi d'une ligne
    // d'annotation juste après la date (le mot "RPP", mais le "R" initial
    // disparaît systématiquement à l'extraction : on observe "PP", "Pp", "p"
    // ou ":PP" selon les jours). On cherche cette annotation juste après la
    // date, avant tout autre contenu — un vrai RP simple n'a rien à cet
    // endroit (le jour suivant s'enchaîne directement).
    let codeEquipe = codeEquipeBrut;
    if (codeEquipeBrut === "RP") {
      const apresDate = zoneHoraires.replace(/^\s+/, "");
      if (/^:?\s*[pP]{1,2}\b/.test(apresDate)) codeEquipe = "RPP";
    }
    const estCodeSpecial = /^(RPP|RP|RU|RQ|C|CA|DISPO|NU)$/.test(code) || /^RFT\s?SAM$/i.test(code) || /^F[0-9V]$/.test(code) || /^F-[A-Z]{2,5}$/.test(code);

    jours.push({
      date_jour: dateJour,
      code_poste: estCodeSpecial ? null : code,
      code_equipe: codeEquipe,
      heure_debut: heureDebut,
      heure_fin: heureFin,
      source_edition_date: editionDate,
    });
  }
  // Diagnostic : comparer à la période complète "Commande allant du... au..." pour
  // repérer les jours qui n'ont même pas été détectés comme bloc (pas juste en échec de code)
  const periodeMatch = text.match(/Commande allant du\s*(\d{2})\/(\d{2})\/(\d{4})\s*au\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (periodeMatch) {
    const debut = new Date(`${periodeMatch[3]}-${periodeMatch[2]}-${periodeMatch[1]}T12:00:00`);
    const fin = new Date(`${periodeMatch[6]}-${periodeMatch[5]}-${periodeMatch[4]}T12:00:00`);
    const datesDetectees = new Set(jours.map(j => j.date_jour));
    const datesEnEchec = new Set(echecs.filter(e => e.date).map(e => e.date));
    for (let d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) {
      const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!datesDetectees.has(dk) && !datesEnEchec.has(dk)) {
        echecs.push({ date: dk, motif: "jour_non_detecte" });
      }
    }
  }

  return { editionDate, jours, echecs };
}
// ─── PARSER DÉROULÉ PRÉVISIONNEL ──────────────────────────────────────────────
// (extraction par coordonnées x/y tentée puis abandonnée le 04/07/2026 au
// profit de l'extraction texte native — voir FEATURES_ajout_04072026)

function parseDeroulePrevisionnel(text) {
  // fix (19/08, roulement de Maxime CORDEAU) : tronquer avant la légende
  // "Note explicative" en fin de document — elle contient de fausses
  // occurrences "Ve 15"/"Sa 16" (exemples pédagogiques du fonctionnement
  // NUIT01, jamais de vraies données de jour) qui matchent quand même le
  // regex de capture d'un jour — elles consomment alors un usedCounts pour
  // cette clé, ce qui peut décaler l'attribution du vrai candidat suivant
  // pour tout futur document où plusieurs mois du bloc partagent ce même
  // jour de semaine. Toujours en toute fin de texte, rien d'utile après.
  const noteIdx = text.search(/Note explicative/i);
  if (noteIdx >= 0) text = text.slice(0, noteIdx);
  // fix extraction (18/08, déroulé prévisionnel d'Antoine LEGOGUELIN) : sur ce
  // document, la lettre "P" est systématiquement rendue "I'" (I majuscule +
  // apostrophe) par l'extraction pdfjs — "PIPA2J" (le poste, qui contient DEUX
  // "P") ressort donc "I'IPA2J" (1er P touché), "PII'A2J" (3e P touché) ou
  // "I'II'A2J" (les deux). Les variantes ou le "P" corrompu est le TOUT DEBUT
  // du code (ex: "I'IPA2J") ne satisfont meme pas le minimum de longueur du
  // regex de capture de code (1 seul caractere valide avant l'apostrophe) —
  // le code entier disparaissait silencieusement (aucune ligne "rejetee" a
  // afficher, juste un jour jamais importe). Mesure precise : 58 jours sur
  // 365 concernes sur le cas reel testé. Remplacement au niveau texte brut,
  // avant tout parsing — l'apostrophe n'apparait nulle part ailleurs dans ce
  // type de document, substitution donc sans risque.
  text = text.replace(/I['’]/g, "P");
  // fix extraction (18/08, confirmé par Olivier en comparant au document
  // papier — "je vois pas ca ecrit [...] et c'esttous des rp") : "RP"
  // (repos périodique) ressort "14F" sur ce document précis (2026), une
  // corruption différente de "RI" ci-dessus mais qui vise le même code.
  // "14F" commence par un chiffre — le regex de capture de code exige une
  // lettre majuscule en premier caractère, donc ce jeton n'était même pas
  // capturé du tout (pas juste rejeté, silencieusement absent), d'où un
  // simple alias dans normaliseCode n'aurait jamais pu suffire. Remplacement
  // au niveau texte brut comme pour "I'" ci-dessus : "14F" n'apparaît nulle
  // part ailleurs dans ce type de document (jamais un jour du mois "14"
  // suivi directement de "F"), substitution sans risque.
  text = text.replace(/\b14F\b/g, "RP");
  // fix (19/08, roulement de Maxime CORDEAU) : "RP"/"RU"/"RQ"/"RPP" parfois
  // collé sans espace au code poste qui suit sur la même case ("RPPILNEX" au
  // lieu de "RP PILNEX", ex. nuit "orpheline" — voir aussi le 2e passage plus
  // bas) — insère l'espace manquant avant parsing pour que les 2 codes soient
  // capturés comme 2 périodes distinctes, comme le format normal du document.
  // fix (21/08, roulement de Lionel CHENEVOTOT, poste AC1/AC2 PAR) : meme
  // collage sans espace, mais avec le prefixe poste lui-meme deja corrompu
  // "PA"->"PM" (voir canonAC plus bas) -- "RPPMC1X" (au lieu de "RP PAAC1X").
  text = text.replace(/\b(RPP|RP|RU|RQ)(PI|PA|PM)/g, "$1 $2");
  const editionMatch = text.match(/Le\s*(\d{2})[/1](\d{2})[/1](\d{4})/i);
  const editionDate = editionMatch
    ? `${editionMatch[3]}-${editionMatch[2]}-${editionMatch[1]} 00:00:00`
    : null;

  const yearCounts = {};
  for (const m of text.matchAll(/(\d{2})\/(\d{4})/g)) {
    yearCounts[m[2]] = (yearCounts[m[2]] || 0) + 1;
  }
  const annee = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    || String(new Date().getFullYear());

  // fix OCR (19/08, déroulé prévisionnel 2027 de Maxime CORDEAU) : le numéro
  // de jour peut aussi ressortir "io"→10, "ii"→11, "is"→15 (I/i→1, S/s→5,
  // O/o→0 combinés sur 2 caractères) — "o"/"O" n'était pas encore couvert.
  // "L/l" (21/08, roulement Lionel CHENEVOTOT) : meme confusion visuelle
  // avec le chiffre "1" (ex: "Ma il"→"Ma 11"), ajoutee au meme titre.
  const normaliseNum = n => n.replace(/[IiLl]/g, "1").replace(/[Ss]/g, "5").replace(/[Oo]/g, "0");
  const DEJA_VALIDE = /^(RPP|RP|RU|RQ|CA|C|DISPO|F[0-9V]|F-[A-Z]{2,}|PI[A-Z0-9-]{2,}|PA[A-Z0-9-]{2,}|PH[A-Z0-9-]{2,})$/;
  // fix (21/08, roulement de Lionel CHENEVOTOT, poste AC1/AC2 PAR — 674911)
  // : sur ce document, la paire "AA" de "PAAC1.../PAAC2..." se fusionne de
  // facon tres inconsistante a l'extraction pdfjs — tour a tour "M" (PMC1-),
  // "u"/"U" (Puc2X), "&" (P&AC2-), "4"/"5"/"À" (R4AC2-/P5ÀC1O), une
  // seconde lettre "P" (PPAC1-), ou disparait entierement (cio→PAAC1O) —
  // et le "P" initial lui-meme peut se lire "R" (RAAC1-) ou "e" (eucio).
  // Trop de variantes distinctes pour un simple alias comme les autres fix
  // OCR ci-dessous — plutot qu'enumerer chaque forme, reconnaissance ciblee
  // sur ce SEUL domaine de codes (PAAC1-/O/X, PAAC2-/O/X, aucun autre poste
  // PRCI/PAR n'a cette forme) : on retrouve le chiffre 1/2 (ou son glyphe
  // confondu I/i/l/L) et le suffixe -/O/X, le "bruit AA" entre les deux
  // etant simplement ignore quelle que soit sa forme. Ne s'applique QUE si
  // digit ET suffixe sont tous deux retrouves avec confiance — sinon on
  // laisse le jour non reconnu plutot que de deviner (ex: "PAAi" sans
  // suffixe, "eucx" sans chiffre, restent non resolus).
  const canonAC = (s) => {
    if (!s) return null;
    let t = s.replace(/^[Rr]/, "P").replace(/^[Ee]/, "P");
    if (!/^P/.test(t)) {
      if (/^[AaMmUu&45ÀÁPp]/.test(t)) t = "P" + t;
      else if (/^[Cc]/.test(t)) t = "PAA" + t;
      else return null;
    }
    let rest = t.slice(1);
    rest = rest.replace(/^[AaMmUu&45ÀÁPp\\'’]{0,3}/, "");
    rest = rest.replace(/^[Cc]?/, "");
    const dm = rest.match(/^([12iIlL])/);
    if (!dm) return null;
    const digit = dm[1] === "2" ? "2" : "1";
    rest = rest.slice(1).trim();
    let suffix = null;
    if (rest === "-" || rest === "–") suffix = "-";
    else if (/^[Oo0]$/.test(rest)) suffix = "O";
    else if (/^[Xx]$/.test(rest)) suffix = "X";
    else return null;
    return `PAAC${digit}${suffix}`;
  };
  const normaliseCode = c => {
    if (!c) return null; c = c.trim();
    c = c.replace(/\bHP\b/g, "RP");
    c = c.replace(/P[IO][CO][CO]L/g, "PICCL");
    c = c.replace(/ccx/gi, "PICCLX"); c = c.replace(/^(F-)\s+/, "$1");
    // fix OCR (18/08, déroulé prévisionnel) : "I" majuscule lu comme chiffre "1"
    // en tête de code (ex: "P1PA2J" au lieu de "PIPA2J") — aucun vrai code ne
    // commence par "P1" (toujours "PI"/"PA"), remplacement sans risque.
    if (/^P1/.test(c)) c = "PI" + c.slice(2);
    // fix OCR : "RP" (repos périodique) rendu "RI" par certaines polices — le
    // "P" est lu comme "I" suivi d'une apostrophe (jamais capturée par le
    // regex de code, qui s'arrête à la première non-lettre/chiffre). Aucun
    // vrai code ne vaut "RI", alias sans risque.
    if (c === "RI") c = "RP";
    // fix OCR : "F1" (1er Janvier) rendu "FI" (chiffre 1 lu comme lettre I)
    if (c === "FI") c = "F1";
    // fix OCR : "PIPA2J" rendu "PII'A2J" (le 2e "P" lu "I'", regex de code
    // s'arrete a l'apostrophe -> ne capture que "PII") ou "PPPA2J" (le "I"
    // disparait, le "P" se duplique) — confirme par inspection du texte brut
    // (systematiquement suivi de "A2J" dans les 2 cas), meme categorie que
    // les autres fixups OCR ci-dessus.
    if (c === "PII" || c === "PPPA2J") c = "PIPA2J";
    // fix (21/08) : si le code n'est toujours pas reconnu apres les fixups
    // ci-dessus, tenter la reconnaissance ciblee AC1/AC2 (voir canonAC) —
    // jamais declenchee sur un code deja valide (RP/RU/PICCL/etc.).
    if (!DEJA_VALIDE.test(c)) {
      const ac = canonAC(c);
      if (ac) return ac;
    }
    return c || null;
  };
  const getHoraires = eq => {
    const e = EQ[eq];
    if (!e?.heures) return { heure_debut: null, heure_fin: null };
    const mh = e.heures.match(/(\d{2})h(\d{2}).(\d{2})h(\d{2})/);
    if (!mh) return { heure_debut: null, heure_fin: null };
    return { heure_debut: `${mh[1]}:${mh[2]}:00`, heure_fin: `${mh[3]}:${mh[4]}:00` };
  };

  // Séparer les deux blocs (6 mois / 6 mois) : lecture directe des 2 lignes
  // d'en-tête réelles du document (6 paires "MM/AAAA" par ligne), plutôt que
  // de supposer "Jan-Juin / Juil-Déc de la même année". Bug trouvé le 19/08
  // (déroulé prévisionnel de Maxime CORDEAU, 05/2026→04/2027) : un roulement
  // peut être imprimé à tout moment de l'année pour 12 mois, en démarrant
  // n'importe quel mois et en débordant sur l'année suivante — le split
  // fixe "^07/annee" ne matchait alors JAMAIS (le doc démarre en mai, pas
  // janvier), tout le texte retombait dans un seul bloc, traité avec des
  // mois candidats 01-06 d'une SEULE année globale — les vraies données de
  // janvier-avril de l'année suivante se faisaient alors mal-attribuer à
  // un mois de l'année précédente qui partage le même jour de semaine
  // (148 jours "importés" au lieu de ~345, dont 87 sous la mauvaise année,
  // silencieusement — le planning perso semblait vide car les jours
  // atterrissaient sur un mois/année qu'on ne consultait pas).
  const HEADER_LINE_RE = /^\s*(\d{2})[\/1](\d{4})(?:\s+\d{2}[\/1]\d{4}){5}\s*$/gm;
  const headerLines = [];
  { let hm; HEADER_LINE_RE.lastIndex = 0;
    while ((hm = HEADER_LINE_RE.exec(text)) !== null) {
      const paires = [];
      const pairRe = /(\d{2})[\/1](\d{4})/g; let pm;
      while ((pm = pairRe.exec(hm[0])) !== null) paires.push({ mm: pm[1], yyyy: pm[2] });
      headerLines.push({ index: hm.index, paires });
    }
  }

  let sepEnd, moisAnnee1, moisAnnee2;
  if (headerLines.length === 2 && headerLines[0].paires.length === 6 && headerLines[1].paires.length === 6) {
    // Chemin robuste : les 12 (mois, année) réels sont lus directement sur
    // les 2 lignes d'en-tête du document, dans l'ordre de leurs colonnes —
    // fonctionne quel que soit le mois de départ et gère nativement un
    // débordement sur l'année suivante.
    sepEnd = headerLines[1].index;
    moisAnnee1 = headerLines[0].paires;
    moisAnnee2 = headerLines[1].paires;
  } else {
    // Repli : comportement historique (documents dont l'en-tête n'a pas pu
    // être lue proprement, ex. OCR trop dégradé) — Jan-Juin / Juil-Déc de
    // l'année majoritaire du document, jamais retiré pour rester
    // non-régressif sur les cas déjà correctement couverts jusqu'ici.
    const bloc2Match = new RegExp("^0?7\\/" + annee, "m").exec(text);
    sepEnd = bloc2Match ? bloc2Match.index
      : (() => { const sepIdx = text.search(/_{6,}/); return sepIdx >= 0 ? text.indexOf("\n", sepIdx) : -1; })();
    const MOIS_BLOC1 = new Set(["01","02","03","04","05","06"]);
    const MOIS_BLOC2 = new Set(["07","08","09","10","11","12"]);
    const detectOrdre = (t, moisSet) => {
      const re = new RegExp("(\\d{2})\\/" + annee, "g");
      const seen = new Set(); const ordre = []; let m;
      while ((m = re.exec(t)) !== null) {
        const mm = m[1];
        if (!seen.has(mm) && moisSet.has(mm)) { seen.add(mm); ordre.push(mm); }
      }
      for (const mm of moisSet) { if (!ordre.includes(mm)) ordre.push(mm); }
      return ordre;
    };
    moisAnnee1 = detectOrdre(text, MOIS_BLOC1).map(mm => ({ mm, yyyy: annee }));
    moisAnnee2 = detectOrdre(text, MOIS_BLOC2).map(mm => ({ mm, yyyy: annee }));
  }
  const texteBloc1 = sepEnd > 0 ? text.slice(0, sepEnd) : text;
  const texteBloc2 = sepEnd > 0 ? text.slice(sepEnd) : "";

  const ABBR_FROM_DAY = ["Di","Lu","Ma","Me","Je","Ve","Sa"];
  // Chaque candidat porte désormais sa propre année (yyyy), plus une année
  // globale unique pour tout le document — indispensable pour un roulement
  // qui traverse une frontière calendaire (ex: 04/2027 dans le 2e bloc d'un
  // document dont l'en-tête global reste majoritairement 2026).
  const buildCandidates = (paires) => {
    const map = {};
    paires.forEach((p, ordreIdx) => {
      const y = parseInt(p.yyyy, 10), mIdx = parseInt(p.mm, 10);
      const daysInMonth = new Date(y, mIdx, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(y, mIdx - 1, day);
        const abbr = ABBR_FROM_DAY[d.getDay()];
        const key = `${abbr}_${day}`;
        if (!map[key]) map[key] = [];
        map[key].push({ mm: p.mm, yyyy: p.yyyy, ordreIdx });
      }
    });
    for (const key in map) map[key].sort((a, b) => a.ordreIdx - b.ordreIdx);
    return map;
  };
  const cmap1 = buildCandidates(moisAnnee1);
  const cmap2 = buildCandidates(moisAnnee2);

  const DAY_ABBRS = new Set(["Je","Ve","Sa","Di","Lu","Ma","Me"]);
  // "PH..." (18/08, découvert sur le déroulé d'Antoine LEGOGUELIN) : code d'une
  // affectation sur une autre UO que PRCI/PAR (ex: PH0003), jamais rejeté avant
  // ce correctif — était donc silencieusement ignoré sur toute la période de
  // l'ancienne affectation. Traité comme un poste Journée générique par
  // deriveCodeEquipeBulletin (pas de suffixe -/O/X connu), faute de mieux.
  const CODE_VALID = /^(RPP|RP|RU|RQ|CA|C|DISPO|F[0-9V]|F-[A-Z]{2,}|PI[A-Z0-9-]{2,}|PA[A-Z0-9-]{2,}|PH[A-Z0-9-]{2,})$/;
  const SPECIAL = new Set(["RPP","RP","RU","RQ","CA","C","DISPO"]);
  // Numéro de jour : "\d+" pour le cas normal, ou 1-2 caractères parmi
  // I/i/L/l/S/s/O/o/5 pour tolérer les glyphes corrompus multi-caractères
  // ("io"→10, "ii"→11, "is"→15, "il"→11 depuis le 21/08) en plus du cas 1
  // caractère déjà géré ("I"→1, "S"→5) — mesuré sans aucune régression sur
  // 2 documents réels avant d'élargir (+4 jours sur un cas, 0 changement
  // sur l'autre).
  // fix (21/08, roulement Lionel CHENEVOTOT) : le token de code accepte
  // désormais aussi les lettres MINUSCULES et l'apostrophe (ex: "PAAc1-",
  // "PA'kc2-") — sur ce document, "AA"/casse se corrompt très fortement,
  // et l'ancienne regex tout-majuscule tronquait le code au premier
  // caractère minuscule (ex: "PAAc1-" capturé "PAA" seulement, invalide),
  // au lieu de laisser normaliseCode/canonAC reconnaître le token complet.
  // Lookahead négatif AVANT le groupe de code (sur le MÊME motif Abbr+Num,
  // y compris ses glyphes confondus) : sans lui, élargir aux minuscules
  // ferait avaler le prochain "Abbr Num" comme un faux code (ex: "Sa 5 Ve
  // 5" → "Ve" capturé comme code de "Sa 5", perdant le vrai jour "Ve 5"
  // qui suit) — vérifié précisément : régresse sans ce garde-fou, aucune
  // régression avec.
  const NOT_NEXT_DAY = "(?:Je|Ve|Va|Sa|Di|Dl|Lu|Ma|Me)\\s+(?:\\d+|[IiLlSsOo5]{1,2})";
  const DAY_RE = new RegExp(
    "(Je|Ve|Va|Sa|Di|Dl|Lu|Ma|Me)\\s+(\\d+|[IiLlSsOo5]{1,2})" +
    "(?:\\s+(?!" + NOT_NEXT_DAY + ")([A-Za-z&\\\\ÀÁ4'’][A-Za-z0-9&\\\\ÀÁ4'’-]+)" +
    "(?:\\s+(?!" + NOT_NEXT_DAY + ")([A-Za-z&\\\\ÀÁ4'’][A-Za-z0-9&\\\\ÀÁ4'’-]+))?)?", "g");

  const seen = new Set();
  const jours = [];

  const processBloc = (texte, cmap) => {
    const usedCounts = {};
    let m;
    DAY_RE.lastIndex = 0;
    while ((m = DAY_RE.exec(texte)) !== null) {
      let [, abbr, numRaw, c1Raw, c2Raw] = m;
      if (abbr === "Va") abbr = "Ve";
      if (abbr === "Dl") abbr = "Di";
      const num = normaliseNum(numRaw);
      if (!/^\d+$/.test(num)) continue;
      const dayNum = parseInt(num, 10);
      if (dayNum < 1 || dayNum > 31) continue;

      const key = `${abbr}_${dayNum}`;
      const candidates = cmap[key];
      if (!candidates || candidates.length === 0) continue;

      const idx = (usedCounts[key] || 0) % candidates.length;
      usedCounts[key] = (usedCounts[key] || 0) + 1;
      const cand = candidates[idx];

      const c1 = normaliseCode(c1Raw);
      if (!c1 || DAY_ABBRS.has(c1) || !CODE_VALID.test(c1)) continue;

      const day = String(dayNum).padStart(2, "0");
      const dateJour = `${cand.yyyy}-${cand.mm}-${day}`;
      if (seen.has(dateJour)) continue;
      seen.add(dateJour);

      const eq1 = deriveCodeEquipeBulletin(c1, null);
      const sp1 = SPECIAL.has(c1) || /^F[0-9V]$/.test(c1) || /^F-[A-Z]+$/.test(c1);
      const h1 = getHoraires(eq1);
      const periodes = [{
        code_equipe: eq1, code_poste: sp1 ? null : c1,
        heure_debut: h1.heure_debut, heure_fin: h1.heure_fin, ordre: 1,
      }];

      const c2 = normaliseCode(c2Raw);
      if (c2 && !DAY_ABBRS.has(c2) && CODE_VALID.test(c2)) {
        const eq2 = deriveCodeEquipeBulletin(c2, null);
        const sp2 = SPECIAL.has(c2);
        const h2 = getHoraires(eq2);
        periodes.push({
          code_equipe: eq2, code_poste: sp2 ? null : c2,
          heure_debut: h2.heure_debut, heure_fin: h2.heure_fin, ordre: 2,
        });
      }

      jours.push({ date_jour: dateJour, periodes, source_edition_date: editionDate });
    }
  };

  processBloc(texteBloc1, cmap1);
  if (texteBloc2) processBloc(texteBloc2, cmap2);

  // ── Second passage : prises de nuit orphelines ──────────────────────────────
  // "RP PICCLX" orphelin est sur la MÊME ligne que les autres entrées du même jour.
  // Ex: "RP PICCLX Lu 2 PICOLO Je 2 PICCL- 2" → jour 2, chercher dans la même ligne.
  const LINES = text.split(/\n/);
  const DAY_NUM_RE3 = /(Je|Ve|Sa|Di|Lu|Ma|Me)\s+(\d+|[IiSs5])/g;
  const NUIT_LINE_RE = /^[ \t]*(RPP|RP|RU)\s+(PICC[A-Z0-9-]+|PICO[A-Z0-9-]+)/;

  let lineOffset = 0;
  for (const line of LINES) {
    const nuitMatch = NUIT_LINE_RE.exec(line);
    if (nuitMatch) {
      const rpCode   = nuitMatch[1];
      const nuitCode = normaliseCode(nuitMatch[2]);
      if (nuitCode) {
        // Chercher le numéro de jour le plus fréquent sur cette ligne
        const dayNums = [];
        DAY_NUM_RE3.lastIndex = 0;
        let dm3;
        while ((dm3 = DAY_NUM_RE3.exec(line)) !== null) {
          const n3 = parseInt(normaliseNum(dm3[2]), 10);
          if (n3 >= 1 && n3 <= 31) dayNums.push(n3);
        }
        // Aussi détecter les nombres isolés sur la ligne (ex: "... 2" à la fin)
        const isolatedNums = [...line.matchAll(/(?<![A-Za-z/])\b(\d{1,2})\b(?![/A-Za-z])/g)]
          .map(m => parseInt(m[1], 10)).filter(n => n >= 1 && n <= 31);
        dayNums.push(...isolatedNums);

        if (dayNums.length > 0) {
          // Prendre le numéro le plus fréquent
          const freq3 = {};
          dayNums.forEach(n => { freq3[n] = (freq3[n] || 0) + 1; });
          const dayNum3 = parseInt(Object.entries(freq3).sort((a,b) => b[1]-a[1])[0][0], 10);

          const isBloc2line = sepEnd > 0 && lineOffset > sepEnd;
          const cmap3 = isBloc2line ? cmap2 : cmap1;

          // Chercher toutes les abréviations de jours sur cette ligne pour trouver la bonne
          const lineAbbrs = [];
          DAY_NUM_RE3.lastIndex = 0;
          while ((dm3 = DAY_NUM_RE3.exec(line)) !== null) {
            const n3 = parseInt(normaliseNum(dm3[2]), 10);
            if (n3 === dayNum3) lineAbbrs.push(dm3[1]);
          }

          // Essayer chaque abbr trouvée sur la ligne
          let handled = false;
          for (const abbr3 of lineAbbrs) {
            const key3 = `${abbr3}_${dayNum3}`;
            const cands3 = cmap3[key3];
            if (!cands3) continue;
            for (const cand3 of cands3) {
              const dateJour3 = `${cand3.yyyy}-${cand3.mm}-${String(dayNum3).padStart(2,"0")}`;
              const existing3 = jours.find(j => j.date_jour === dateJour3);
              if (existing3 && !existing3.periodes.some(p => p.code_equipe === "N")) {
                const eq2 = deriveCodeEquipeBulletin(nuitCode, null);
                const h2  = getHoraires(eq2);
                existing3.periodes.push({
                  code_equipe: eq2, code_poste: nuitCode,
                  heure_debut: h2.heure_debut, heure_fin: h2.heure_fin, ordre: 2,
                });
                handled = true; break;
              } else if (!existing3 && !seen.has(dateJour3)) {
                seen.add(dateJour3);
                const eq1 = deriveCodeEquipeBulletin(rpCode, null);
                const h1  = getHoraires(eq1);
                const eq2 = deriveCodeEquipeBulletin(nuitCode, null);
                const h2  = getHoraires(eq2);
                jours.push({
                  date_jour: dateJour3,
                  periodes: [
                    { code_equipe: eq1, code_poste: null, heure_debut: h1.heure_debut, heure_fin: h1.heure_fin, ordre: 1 },
                    { code_equipe: eq2, code_poste: nuitCode, heure_debut: h2.heure_debut, heure_fin: h2.heure_fin, ordre: 2 },
                  ],
                  source_edition_date: editionDate,
                });
                handled = true; break;
              }
              if (handled) break;
            }
            if (handled) break;
          }
        }
      }
    }
    lineOffset += line.length + 1; // +1 pour le 

  }

  return { editionDate, jours, echecs: [] };
}


function BulletinImportButton({ agentCp, onImported }) {
  const [busy, setBusy] = useState(false);
  // justDone (10/08, demande par Olivier) : flash vert temporaire sur le
  // bouton lui-meme des que l'import reussit, avant de revenir a son etat
  // normal — distinct du badge detaille ci-dessous (result), qui lui reste
  // affiche (il porte une vraie info : nb de jours importes/ignores).
  const [justDone, setJustDone] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy(true); setResult(null); setJustDone(false);
    const reader = new FileReader();
    reader.onload = async () => {
      let ok = false;
      try {
        const b64 = reader.result.split(",")[1];
        let text = "";
        if (file.type === "application/pdf") {
          text = await extraireTextePdfNatif(b64);
          if (!text || text.replace(/\s/g, "").length < 30) {
            // PDF scanné sans texte natif -> fallback OCR page par page (rendu
            // client pdfjs-dist, voir handleCpsImport pour le detail de la
            // regression pdfjs-dist 6.x corrigee le 04/08 en figeant sur 4.0.379)
            // fix (23/08, cas réel "Roulement 2026" — page unique scannée à
            // résolution native déjà élevée, ~1740x2508) : même avec
            // computeOcrScale plafonnant la résolution de rendu, l'export en
            // PNG (sans perte) d'un contenu photographié/scanné — donc bruité,
            // pas du texte vectoriel propre — restait trop volumineux pour
            // OCR.space (rejeté en HTTP 413, "payload too large", confirmé en
            // conditions réelles). Le JPEG (avec perte, conçu justement pour ce
            // type de bruit photographique) réduit le poids de plusieurs
            // dizaines de % à qualité équivalente pour l'OCR — canvas rempli
            // en blanc avant le rendu (page.render ne peint que le contenu, un
            // fond transparent JPEG deviendrait noir sans ce fillRect).
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
            const raw = atob(b64); const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
            const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
            const texts = [];
            for (let n = 1; n <= pdf.numPages; n++) {
              const page = await pdf.getPage(n);
              const viewport = page.getViewport({ scale: computeOcrScale(page) });
              const canvas = document.createElement("canvas");
              canvas.width = viewport.width; canvas.height = viewport.height;
              const ctx2d = canvas.getContext("2d");
              ctx2d.fillStyle = "#fff"; ctx2d.fillRect(0, 0, canvas.width, canvas.height);
              await page.render({ canvasContext: ctx2d, viewport }).promise;
              const pageB64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
              texts.push(await ocrImageViaOcrSpace(pageB64, "image/jpeg"));
            }
            text = texts.join("\n");
          }
        } else {
          text = await ocrImageViaOcrSpace(b64, file.type || "image/jpeg");
        }
        if (!text) throw new Error("Aucun texte extrait du document");

        // Détection auto : déroulé prévisionnel (grille annuelle) ou bulletin de commande
        const isDeroule = /D.+roul.+Pr.+visionnel/i.test(text) || /Affectations de l.agent/i.test(text);
        let entries, sourceType, echecs;

        if (isDeroule) {
          const res = parseDeroulePrevisionnel(text);
          echecs = res.echecs;
          // Pour le déroulé : entries contient des objets {date_jour, periodes[], source_edition_date}
          entries = res.jours;
          sourceType = "previsionnel";
          if (entries.length === 0) throw new Error("Aucun jour reconnu dans le déroulé — vérifie le format du document");
        } else {
          const res = parseBulletinCommande(text);
          echecs = res.echecs;
          entries = res.jours;
          sourceType = "bulletin";
          if (entries.length === 0) throw new Error("Aucun jour reconnu — vérifie le format du document");
        }

        const resp = await api.planning.importBulletin(agentCp, entries, sourceType);
        const allCodes = entries.flatMap(e => e.periodes ? e.periodes.map(p => p.code_poste) : [e.code_poste]);
        const postesLabels = [...new Set(allCodes.map(c => getPosteLabelFromCode(c)).filter(Boolean))];
        setResult({ nb: resp?.nb_appliques || 0, ignores: resp?.ignores || [], echecs, postesLabels });
        if (typeof onImported === "function") onImported();
        ok = true;
      } catch (err) {
        setResult({ error: err.message });
      }
      setBusy(false);
      if (ok) { setJustDone(true); setTimeout(() => setJustDone(false), 2500); }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignSelf: "flex-start", width: "fit-content" }}>
      <label style={{ cursor: "pointer", alignSelf: "flex-start" }}>
        <div style={{ background: busy ? "#dc2626" : justDone ? "#16a34a" : "#0f4c81", color: "#fff", borderRadius: 10, padding: "8px 12px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, transition: "background .3s" }}>
          {busy ? "⏳ Analyse…" : justDone ? "✅ Importé" : "📥 Importer bulletin de commande / roulement"}
        </div>
        <input type="file" accept=".pdf,image/*" onChange={handleFile} style={{ display: "none" }} disabled={busy} />
      </label>
      {result?.nb !== undefined && !result.error && <span style={{ fontSize: 10, background: "#f0fdf4", color: "#16a34a", borderRadius: 8, padding: "4px 10px", fontWeight: 700 }}>
        ✅ {result.nb} jour(s) importé(s){result.ignores?.length ? ` · ${result.ignores.length} ignoré(s) (déjà à jour)` : ""}{result.echecs?.length ? ` · ${result.echecs.length} jour(s) à vérifier manuellement (${[...new Set(result.echecs.map(e=>e.date).filter(Boolean))].join(", ")})` : ""}{result.postesLabels?.length ? ` · Postes : ${result.postesLabels.join(", ")}` : ""}
      </span>}
      {result?.error && <span style={{ fontSize: 10, background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "4px 10px", fontWeight: 700 }}>❌ {result.error}</span>}
    </div>
  );
}

const _todayDate=new Date();
const TODAY=`${_todayDate.getFullYear()}-${String(_todayDate.getMonth()+1).padStart(2,"0")}-${String(_todayDate.getDate()).padStart(2,"0")}`;

const DAYS_L=["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
const DAYS_S=["Di","Lu","Ma","Me","Je","Ve","Sa"];
export const MOIS_L=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
// Boutons précédent/suivant à côté d'un titre de mois (Mon planning, CPS Officiel,
// Planning Prévisionnel) -- 19/08, Olivier : "on les voit presque pas" (texte seul
// sans fond, ni bordure). Vraie puce cliquable avec fond/bordure, plutôt qu'un
// simple caractère coloré sur fond transparent.
const NAV_ARROW_STYLE={border:"1.5px solid var(--border)",background:"var(--bg-card)",color:"var(--text-primary)",borderRadius:8,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18,fontWeight:700,flexShrink:0,padding:0,lineHeight:1};

function getWeekDates(offset=0){
  const d=new Date();
  const _dow=d.getDay(); d.setDate(d.getDate()+(_dow===0?-6:1-_dow)+(offset*7)); // lundi (gère le cas dimanche=0)
  return Array.from({length:7},(_,i)=>{
    const day=new Date(d);
    day.setDate(d.getDate()+i);
    const y=day.getFullYear(),m=String(day.getMonth()+1).padStart(2,"0"),dd=String(day.getDate()).padStart(2,"0");
    return `${y}-${m}-${dd}`;
  });
}


function dKey(y,m,d){return`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}

// Archive cleanup : supprimer entrées > 3 ans
function cleanOldEntries(schedule){
  const cutoff=new Date();cutoff.setFullYear(cutoff.getFullYear()-3);
  const cutStr=cutoff.toISOString().slice(0,10);
  return Object.fromEntries(Object.entries(schedule).filter(([k])=>{
    const date=k.split("-").slice(1).join("-");
    return date>=cutStr;
  }));
}

// Calcul fêtes récupérées
function computeFetes(schedule, agentId, year) {
  const fetes = [];
  Object.entries(schedule).forEach(([k,v])=>{
    if (!k.startsWith(agentId+"-")) return;
    const date = k.slice(agentId.length+1);
    if (!date.startsWith(year)) return;
    const code = v?.equipe||v?.jsCode;
    if (CODES_FETES[code]) {
      fetes.push({ date, code, label:CODES_FETES[code], paye:v?.fetePaye||false });
    }
    // Aussi : si agent travaille ou RP ce jour = potentiellement récup fête
    // Logique simplifiée : on liste jours fête détectés
  });
  return fetes;
}


// ─── AGENTS ──────────────────────────────────────────────────────────────────
const AGENTS_INIT = [
  {id:"P01",nom:"BELLISSENT",      prenom:"Christophe",grade:"CP6NIV2",poste:"CCL",          fam:"PRCI"},
  {id:"P02",nom:"CHAHMI",          prenom:"Rochdi",    grade:"CP6NIV2",poste:"CCL",          fam:"PRCI"},
  {id:"P03",immatriculation:"6810186B",nom:"BEFFARAL",        prenom:"Olivier",   grade:"CP6NIV2",poste:"CCL",          fam:"PRCI"},
  {id:"P04",nom:"COIRRE",          prenom:"Yannick",   grade:"CP6NIV1",poste:"CCL",          fam:"PRCI"},
  {id:"P05",nom:"EL ADRAOUI",      prenom:"Mounir",    grade:"CO6",    poste:"CCL",          fam:"PRCI"},
  {id:"P06",nom:"HUTIN",           prenom:"Thomas",    grade:"CP5NIV2",poste:"Adj CCL",      fam:"PRCI"},
  {id:"P07",nom:"FAROUIL",         prenom:"Cameron",   grade:"CO5",    poste:"Adj CCL",      fam:"PRCI"},
  {id:"P08",nom:"MILLERAND",       prenom:"Thomas",    grade:"CP5NIV2",poste:"Adj CCL",      fam:"PRCI"},
  {id:"P09",nom:"LOGEAIS",         prenom:"Leslie",    grade:"CP5NIV2",poste:"Adj CCL",      fam:"PRCI"},
  {id:"P10",nom:"LAFRANCE",        prenom:"Cyril",     grade:"CP6NIV1",poste:"Adj CCL",      fam:"PRCI"},
  {id:"P11",nom:"DUPUY",           prenom:"Victorien", grade:"CP6NIV1",poste:"Adj CCL",      fam:"PRCI"},
  {id:"P12",nom:"BOLZER",          prenom:"Charles",   grade:"CO6",    poste:"Adj CCL",      fam:"PRCI"},
  {id:"P13",nom:"MIGNOT",          prenom:"Olivier",   grade:"CO5",    poste:"Adj CCL",      fam:"PRCI"},
  {id:"P14",nom:"MALY",            prenom:"Christophe",grade:"CP5NIV1",poste:"AC LC",        fam:"PRCI"},
  {id:"P15",nom:"BENNEQUIN",       prenom:"Benjamin",  grade:"CO5",    poste:"AC LC",        fam:"PRCI"},
  {id:"P16",nom:"FAIAD",           prenom:"Zoé",       grade:"CO5",    poste:"AC LC",        fam:"PRCI"},
  {id:"P17",nom:"DRAME",           prenom:"Ibrahima",  grade:"CO5",    poste:"AC LC",        fam:"PRCI"},
  {id:"P18",nom:"RINDER-BOYER",    prenom:"Jérôme",    grade:"CO5",    poste:"AC LC",        fam:"PRCI"},
  {id:"P19",nom:"AKSSIRIOUN",      prenom:"Mohamed",   grade:"CP5NIV2",poste:"AC LC",        fam:"PRCI"},
  {id:"P20",nom:"ZANFI",           prenom:"Yassine",   grade:"CP5NIV1",poste:"AC LNE",       fam:"PRCI"},
  {id:"P21",nom:"CHOUAIB",         prenom:"Wassim",    grade:"CO5",    poste:"AC LNE",       fam:"PRCI"},
  {id:"P22",nom:"AUDREN",          prenom:"Yvon",      grade:"CO5",    poste:"AC LNE",       fam:"PRCI"},
  {id:"P23",nom:"BATY",            prenom:"Audrey",    grade:"CO5",    poste:"AC LNE",       fam:"PRCI"},
  {id:"P24",nom:"CORDEAU",         prenom:"Maxime",    grade:"CO5",    poste:"AC LNE",       fam:"PRCI"},
  {id:"P25",nom:"MOUAOUED",        prenom:"Abdelkhalid",grade:"CP5NIV1",poste:"AC LNE",      fam:"PRCI"},
  {id:"P26",nom:"MENDY",           prenom:"Alexandre", grade:"CO5",    poste:"AC LNO",       fam:"PRCI"},
  {id:"P27",nom:"JAN",             prenom:"Kevin",     grade:"CO5",    poste:"AC LNO",       fam:"PRCI"},
  {id:"P28",nom:"OUBRAHAM",        prenom:"Adel",      grade:"CO5",    poste:"AC LNO",       fam:"PRCI"},
  {id:"P29",nom:"MASUY",           prenom:"Thomas",    grade:"CO5",    poste:"AC LNO",       fam:"PRCI"},
  {id:"P30",nom:"SOUNALATH",       prenom:"Vythoune",  grade:"CO5",    poste:"AC LNO",       fam:"PRCI"},
  {id:"P31",nom:"CAILLET",         prenom:"Maxime",    grade:"CP5NIV1",poste:"AC LNO",       fam:"PRCI"},
  {id:"P32",nom:"BOUHEND",         prenom:"Ryad",      grade:"CO5",    poste:"AC VGD",       fam:"PRCI"},
  {id:"P33",nom:"COSAQUE",         prenom:"Patrick",   grade:"CP4NIV2",poste:"AC VGD",       fam:"PRCI"},
  {id:"P34",nom:"LUCAS",           prenom:"Samuel",    grade:"CP4NIV1",poste:"AC VGD",       fam:"PRCI"},
  {id:"P35",nom:"BAILLON",         prenom:"Guillaume", grade:"CP7NIV1",poste:"DPX PRCI",     fam:"PRCI"},
  {id:"P36",nom:"CAMPOY",          prenom:"Nicolas",   grade:"CP6NIV1",poste:"Adj DPX",      fam:"PRCI"},
  {id:"P37",nom:"HAIDER",          prenom:"Zesheen",   grade:"CP6NIV1",poste:"SD",           fam:"PRCI"},
  {id:"P38",nom:"VICENTE CARREIRA",prenom:"Lucile",    grade:"CP5NIV2",poste:"Pauseur PA1",  fam:"PRCI"},
  {id:"P39",nom:"AUDREN",          prenom:"Gildas",    grade:"CP4NIV2",poste:"Pauseur PA3",  fam:"PRCI"},
  {id:"P40",nom:"BENDIKHA",        prenom:"Sofiane",   grade:"CP5NIV1",poste:"Pauseur PA2",  fam:"PRCI"},
  {id:"P41",nom:"GUEGAIN",         prenom:"Magalie",   grade:"CP5NIV1",poste:"Pauseur PA2",  fam:"PRCI"},
  {id:"P42",nom:"BELOTTI",         prenom:"Florent",   grade:"CP6NIV1",poste:"AFO PRCI",     fam:"PRCI"},
  {id:"P43",nom:"GUAY",            prenom:"Sébastien", grade:"CP6NIV2",poste:"AFO PRCI",     fam:"PRCI"},
  {id:"P44",nom:"KINET",           prenom:"Julien",    grade:"CP5NIV2",poste:"CAF",          fam:"PRCI"},
  {id:"P45",nom:"ILIC-HERBIVO",    prenom:"Théo",      grade:"CP5NIV2",poste:"PPRCI",        fam:"PRCI"},
  {id:"P46",nom:"DAVOST",          prenom:"Antoine",   grade:"CO5",    poste:"Disponible",   fam:"PRCI"},
  {id:"P47",nom:"TOUNKARA",        prenom:"El-Haj",    grade:"CO5",    poste:"AC LNO",       fam:"PRCI"},
  {id:"P48",nom:"METELSKI",        prenom:"Kevin",     grade:"CP5NIV2",poste:"SD",           fam:"PRCI"},
  {id:"P49",nom:"BECHTOLD",        prenom:"Romain",    grade:"CO5",    poste:"AC LC",        fam:"PRCI"},
  {id:"P50",nom:"BOUHADJEB",       prenom:"Mohammed",  grade:"CP5NIV2",poste:"AC LNE",       fam:"PRCI"},
  {id:"P51",nom:"AUDREN",          prenom:"Yvon",      grade:"CO5",    poste:"AC LNE",       fam:"PRCI"},
  {id:"P52",nom:"LE MOISY",        prenom:"Tom",       grade:"CP5NIV1",poste:"AC LNO",       fam:"PRCI"},
  {id:"P53",nom:"KRAFFT",          prenom:"Eric",      grade:"CP6NIV1",poste:"CCL",          fam:"PRCI"},
  {id:"R01",nom:"HUMEZ",           prenom:"Cindy",     grade:"CO5",    poste:"AC PAR",       fam:"PAR"},
  {id:"R02",nom:"RACAMIER",        prenom:"Alexandre", grade:"CO5",    poste:"AC PAR",       fam:"PAR"},
  {id:"R03",nom:"MAILLET",         prenom:"Antoine",   grade:"CO5",    poste:"AC PAR",       fam:"PAR"},
  {id:"R04",nom:"IMART",           prenom:"Pascal",    grade:"CP6NIV2",poste:"AC PAR",       fam:"PAR"},
  {id:"R05",nom:"MAGRINO",         prenom:"Enzo",      grade:"CO5",    poste:"AC PAR",       fam:"PAR"},
  {id:"R06",nom:"VALES-TOLEDANO",  prenom:"Ava",       grade:"CO5",    poste:"AC PAR",       fam:"PAR"},
  {id:"R07",nom:"BARBASTE",        prenom:"Thomas",    grade:"CO5",    poste:"AC PAR",       fam:"PAR"},
  {id:"R08",nom:"LE MOISY",        prenom:"Tom",       grade:"CP5NIV1",poste:"AC PAR",       fam:"PAR"},
  {id:"R09",nom:"PASTANT",         prenom:"Maxime",    grade:"CP5NIV2",poste:"AC PAR",       fam:"PAR"},
  {id:"R10",nom:"WAVELET",         prenom:"François",  grade:"CP5NIV2",poste:"Aide AC PAR",  fam:"PAR"},
  {id:"R11",nom:"CHENEVOTOT",      prenom:"Lionel",    grade:"CP5NIV1",poste:"Aide AC PAR",  fam:"PAR"},
  {id:"R12",nom:"USSON",           prenom:"Antoine",   grade:"CP5NIV1",poste:"Aide AC PAR",  fam:"PAR"},
  {id:"R13",nom:"SCHRAMM",         prenom:"Camille",   grade:"CP5NIV1",poste:"Aide AC PAR",  fam:"PAR"},
  {id:"R14",nom:"ILIC-HERBIVO",    prenom:"Théo",      grade:"CP5NIV2",poste:"CT AC Travaux",fam:"PAR"},
  {id:"R15",nom:"MERCIER",         prenom:"Yoann",     grade:"CP6NIV1",poste:"CT AC Travaux",fam:"PAR"},
  {id:"R16",nom:"LAMBERT",         prenom:"Olivier",   grade:"CP6NIV1",poste:"DPX PAR",      fam:"PAR"},
  {id:"R17",nom:"MILLES",          prenom:"Valérie",   grade:"CP5NIV3",poste:"ASMTE PAR",    fam:"PAR"},
  {id:"R18",nom:"AUREILLE",        prenom:"Baptiste",  grade:"CP5NIV2",poste:"AFO PAR",      fam:"PAR"},
  {id:"R19",nom:"HUON",            prenom:"Grégoire",  grade:"CP5NIV1",poste:"AC PAR",       fam:"PAR"},
  {id:"R20",nom:"MOREAU",          prenom:"Maxence",   grade:"CP5NIV2",poste:"Aide AC PAR",  fam:"PAR"},
  {id:"R21",nom:"MICHEL",          prenom:"François",  grade:"CP5NIV2",poste:"AC PAR",       fam:"PAR"},
  {id:"R22",nom:"BODIN",           prenom:"Julien",    grade:"CP6NIV1",poste:"DPX PAR",      fam:"PAR"},
  {id:"R23",nom:"SAURY",           prenom:"Stéphane",  grade:"CP5NIV2",poste:"AC PAR",       fam:"PAR"},
  // Nouveaux agents détectés feuilles 30/05 – 01/06/2026
  {id:"P54",nom:"LEGOGUELIN",       prenom:"Antoine",   grade:"CP5NIV2",poste:"AC LC",         fam:"PRCI"},
].map(a=>({...a,famille:a.fam||a.famille,fam:a.fam||a.famille,initials:a.prenom[0]+(a.nom.replace(/[\s-]/g,"")[0]||"")}));

// ─── COMPOSANTS DE BASE ───────────────────────────────────────────────────────
function EqBadge({code,small,showHours}){
  const e=EQ[code];if(!e)return null;
  const p=POSTES_JOURNEE.find(x=>x.jsCode===code);
  return(<span style={{display:"inline-flex",alignItems:"center",gap:4,background:e.color,color:e.textColor,borderRadius:20,padding:small?"2px 8px":"4px 12px",fontSize:small?11:12,fontWeight:700,whiteSpace:"nowrap"}}>
    <span style={{width:6,height:6,borderRadius:"50%",background:e.dot,flexShrink:0}}/>
    {p?`${p.jsCode} · ${p.label}`:e.label}
    {showHours&&e.heures&&<span style={{fontSize:10,opacity:.8,marginLeft:2}}>{e.heures}</span>}
  </span>);
}
function Av({initials,size=34,famille,color}){
  const c=color||FAMILLES[famille]?.color||"#1e293b";
  return(<div style={{width:size,height:size,borderRadius:"50%",background:c,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.33,fontWeight:800,flexShrink:0}}>{initials}</div>);
}
function Toggle({value,onChange,color="#10b981"}){
  return(<button onClick={()=>onChange(!value)} style={{width:44,height:24,borderRadius:12,border:"none",cursor:"pointer",position:"relative",background:value?color:"#cbd5e1",transition:"background .2s",flexShrink:0}}>
    <span style={{position:"absolute",top:3,left:value?22:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
  </button>);
}

// ─── PIN MODAL ────────────────────────────────────────────────────────────────
function PinModal({agent,onSuccess,onClose,mode="verify",currentPin}){
  // mode: "verify" = déverrouiller | "set" = créer | "change" = modifier (vérifie ancien puis nouveau) | "reset" = admin reset sans vérif
  const [digits,setDigits]=useState(["","","",""]);
  const [confirm,setConfirm]=useState(["","","",""]);
  const initStep = mode==="set"||mode==="reset" ? "enter" : mode==="change" ? "old" : "verify";
  const [step,setStep]=useState(initStep);
  const [error,setError]=useState("");
  const p0=useRef(),p1=useRef(),p2=useRef(),p3=useRef();
  const refs=[p0,p1,p2,p3];
  useEffect(()=>{refs[0].current?.focus();},[step]);

  const handleDigit=(i,v,arr,setArr)=>{
    const digit=v.replace(/\D/g,'').slice(-1);
    const next=[...arr];next[i]=digit;setArr(next);
    if(digit&&i<3) setTimeout(()=>refs[i+1].current?.focus(),10);
    if(!digit&&i>0) setTimeout(()=>refs[i-1].current?.focus(),10);
  };
  const pinStr=digits.join("");const confStr=confirm.join("");

  const submit=()=>{
    setError("");
    if(step==="verify"){
      if(pinStr===currentPin){onSuccess();onClose();}
      else{setError("Code incorrect");setDigits(["","","",""]);setTimeout(()=>refs[0].current?.focus(),50);}
    } else if(step==="old"){
      // Vérif ancien PIN avant modification
      if(pinStr===currentPin){setStep("enter");setDigits(["","","",""]);setTimeout(()=>refs[0].current?.focus(),50);}
      else{setError("Code actuel incorrect");setDigits(["","","",""]);setTimeout(()=>refs[0].current?.focus(),50);}
    } else if(step==="enter"){
      if(pinStr.length<4){setError("4 chiffres requis");return;}
      setStep("confirm");setConfirm(["","","",""]);setTimeout(()=>refs[0].current?.focus(),50);
    } else {
      // confirm
      if(confStr!==pinStr){setError("Codes différents");setConfirm(["","","",""]);setStep("enter");setDigits(["","","",""]);setTimeout(()=>refs[0].current?.focus(),50);}
      else{onSuccess(pinStr);onClose();}
    }
  };

  const active=step==="confirm"?confirm:digits;
  const setActive=step==="confirm"?setConfirm:setDigits;
  const fam=FAMILLES[agent?.famille];

  const titles={
    verify:"Déverrouiller",
    set:"Créer mon code",
    old:"Code actuel",
    enter: mode==="change"||mode==="reset"?"Nouveau code":"Créer mon code",
    confirm:"Confirmer le code",
  };
  const subtitles={
    verify:"Entre ton code à 4 chiffres",
    set:"Choisis un code à 4 chiffres pour protéger ton planning personnel",
    old:"Entre ton code actuel pour le modifier",
    enter:"Choisis un nouveau code à 4 chiffres",
    confirm:"Répète le nouveau code pour confirmer",
  };
  const btnLabels={verify:"Déverrouiller",old:"Vérifier",enter:"Suivant",confirm:"Confirmer"};

  const headerBg = mode==="reset"
    ? "linear-gradient(135deg,#7c3aed,#4c1d95)"
    : `linear-gradient(135deg,${fam?.color||"#1e293b"},#334155)`;

  return(<div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.7)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(6px)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:380,boxShadow:"0 24px 60px rgba(0,0,0,.3)",overflow:"hidden"}}>
      <div style={{background:headerBg,padding:"20px 24px",textAlign:"center"}}>
        <div style={{fontSize:28,marginBottom:6}}>{mode==="reset"?"👑":mode==="change"?"🔑":"🔐"}</div>
        <div style={{color:"#fff",fontSize:15,fontWeight:700}}>
          {mode==="reset"?"Réinitialisation Admin":titles[step]}
        </div>
        {agent&&<div style={{color:"rgba(255,255,255,.6)",fontSize:12,marginTop:2}}>{agent.prenom} {agent.nom}</div>}
        {mode==="reset"&&<div style={{color:"rgba(255,255,255,.5)",fontSize:11,marginTop:4}}>Action administrateur — crée un nouveau code pour cet agent</div>}
      </div>

      {/* Indicateur d'étape pour "change" */}
      {mode==="change"&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"10px 0",background:"#f8fafc",borderBottom:"1px solid #e2e8f0"}}>
        {["old","enter","confirm"].map((s,i)=>(
          <div key={s} style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:step===s||((step==="enter"||step==="confirm")&&s==="old")?fam?.color||"#1e293b":"#e2e8f0",color:step===s||((step==="enter"||step==="confirm")&&s==="old")?"#fff":"#94a3b8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>{i+1}</div>
            {i<2&&<div style={{width:20,height:2,background:"#e2e8f0"}}/>}
          </div>
        ))}
        <div style={{fontSize:10,color:"#94a3b8",marginLeft:4}}>{step==="old"?"Ancien code":step==="enter"?"Nouveau code":"Confirmation"}</div>
      </div>}

      <div style={{padding:"24px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:18}}>
        <div style={{fontSize:13,color:"#64748b",textAlign:"center"}}>{subtitles[step]}</div>
        <div style={{display:"flex",gap:12,position:"relative"}} onClick={()=>p0.current?.focus()}>
          <input ref={p0} type="tel" inputMode="numeric" maxLength={4}
            value={active.join("")}
            onChange={e=>{
              const val=e.target.value.replace(/\D/g,"").slice(0,4);
              const next=["","","",""];
              val.split("").forEach((d,i)=>{next[i]=d;});
              setActive(next);
              if(val.length===4) setTimeout(()=>submit(),100);
            }}
            onKeyDown={e=>{if(e.key==="Enter"&&active.every(d=>d))submit();}}
            style={{position:"absolute",opacity:0,width:"100%",height:"100%",top:0,left:0,zIndex:1,fontSize:16}}
            autoComplete="off"
          />
          {[0,1,2,3].map(i=>(<div key={i} style={{width:54,height:62,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:800,border:`2px solid ${error?"#ef4444":active[i]?"#3b82f6":"#e2e8f0"}`,borderRadius:12,background:active[i]?"#f0f9ff":"#fff",transition:"all .15s",cursor:"pointer"}}>
            {active[i]?"●":""}
          </div>))}
        </div>
        <button onClick={submit} disabled={active.some(d=>!d)} style={{width:"100%",background:active.every(d=>d)?fam?.color||"#1e293b":"#e2e8f0",color:active.every(d=>d)?"#fff":"#94a3b8",border:"none",borderRadius:12,padding:"13px 0",cursor:active.every(d=>d)?"pointer":"not-allowed",fontSize:14,fontWeight:700,transition:"all .15s"}}>
          {btnLabels[step]||"Confirmer"}
        </button>
        <button onClick={onClose} style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:13}}>Annuler</button>
      </div>
    </div>
  </div>);
}

// ─── COULEURS PÉRIODES VUE GLOBALE ───────────────────────────────────────────
const PERIOD_COLORS = {
  M:     { header:"#854F0B", border:"#FAC775", bg:"#FAEEDA", badge:"#EF9F27" },
  J:     { header:"#0C447C", border:"#85B7EB", bg:"#E6F1FB", badge:"#378ADD" },
  AM:    { header:"#993C1D", border:"#F0997B", bg:"#FAECE7", badge:"#D85A30" },
  N:     { header:"#1e1b4b", border:"#c7d2fe", bg:"#eef2ff", badge:"#6366f1" },
  DIVERS:{ header:"#374151", border:"#e5e7eb", bg:"#f9fafb", badge:"#6b7280" },
};

// ─── VUE GLOBALE ─────────────────────────────────────────────────────────────
function buildSections(schedule, dateKey, filterF, agents, isPrevisionnel){
  const sections=[];
  const periodes=[
    {id:"M",  label:"🌅 Matinée",  jsKey:"M",  equipe:"M" },
    {id:"J",  label:"☀️ Journée",  jsKey:"J",  equipe:"J" },
    {id:"AM", label:"🌆 Soirée",   jsKey:"AM", equipe:"AM"},
    {id:"N",  label:"🌙 Nuit",     jsKey:"N",  equipe:"N" },
  ];

  periodes.forEach(p=>{
    const pc=PERIOD_COLORS[p.id];const rows=[];

    // PRCI 3x8 (CCL,ADJ,LNE,LNO,VGD,LC dans l'ordre)
    if(filterF!=="PAR"){
      POSTES_PRCI_3x8.forEach(poste=>{
        const jsCode=poste[p.jsKey];if(!jsCode)return;
        const ags=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&(en.jsCode===jsCode||en.poste===poste.label)&&!EQ[en.equipe]?.prive;});
        const dowDk=new Date(dateKey).getDay(); // 0=dim, 6=sam
        const isLneFusion=(p.id==="N")||(p.id==="AM"&&dowDk===6)||(p.id==="M"&&dowDk===0);
        const lneLabel=(isLneFusion&&poste.code==="LNE")?"AC LNE/VGD":poste.label;
        rows.push({poste:{...poste,label:`${jsCode} · ${lneLabel}`},jsCode,agents:ags,famille:"PRCI",isJournee:false,maxSlots:isPrevisionnel?Math.max(ags.length,1):1});
      });
    }

    // Journée PRCI principaux uniquement (PA1J,PA2J,PA3J)
    if(p.id==="J"&&filterF!=="PAR"){
      POSTES_JOURNEE.filter(x=>x.famille==="PRCI"&&x.principal).forEach(poste=>{
        const ags=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&(en.jsCode===poste.jsCode||en.poste===poste.label)&&["J","JF"].includes(en.equipe);});
        rows.push({poste,jsCode:poste.jsCode,agents:ags,famille:"PRCI",isJournee:true,maxSlots:poste.maxSlots,allowFormation:poste.allowFormation});
      });
    }

    // PAR 3x8 (AC PAR, Aide AC PAR, CT AC Travaux)
    if(filterF!=="PRCI"){
      POSTES_PAR_3x8.forEach(poste=>{
        const jsCode=poste[p.jsKey];if(!jsCode)return;
        const ags=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&(en.jsCode===jsCode||en.poste===poste.label)&&!EQ[en.equipe]?.prive;});
        rows.push({poste:{...poste,label:`${jsCode} · ${poste.label}`},jsCode,agents:ags,famille:"PAR",isJournee:false,maxSlots:isPrevisionnel?Math.max(ags.length,1):1});
      });
    }

    // Journée PAR principaux (PAPAUJ, PAASMJ)
    if(p.id==="J"&&filterF!=="PRCI"){
      POSTES_JOURNEE.filter(x=>x.famille==="PAR"&&x.principal).forEach(poste=>{
        const ags=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&(en.jsCode===poste.jsCode||en.poste===poste.label)&&["J","JF"].includes(en.equipe);});
        rows.push({poste,jsCode:poste.jsCode,agents:ags,famille:"PAR",isJournee:true,maxSlots:poste.maxSlots,allowFormation:poste.allowFormation});
      });
    }

    if(rows.length)sections.push({...p,pc,rows});
  });

  // Section DIVERS (postes non principaux + dispos)
  const diversRows=[];
  const pcD=PERIOD_COLORS.DIVERS;

  // jsCode des postes qui sont eux-memes des formations (regroupes dans le pave Formation)
  const jsCodesFormationPostes=new Set(["K-PAR","K-PRCI","F-PRCI","AFO PAR","AFOPRCI","F-PAR"]);
  const jsCodesJourneeSpecialePostes=new Set(["PPRCI","PPAR"]);
  // fix (23/08, cas reel CAILLET Maxime, 24/08) : "DISPO" existe DEUX fois dans
  // POSTES_JOURNEE (une entree litterale famille:"PRCI", non-principal, en plus
  // de la construction dediee "Disponibles" juste plus bas) -- sans cette
  // exclusion, un agent DISPO apparaissait deux fois : une fois dans la ligne
  // "🟩 Disponibles" (le bon endroit), une fois de plus via cette boucle
  // generique "postes non principaux PRCI" (etiquette "DISPO · DISPO [PRCI]",
  // doublon). La ligne "Disponibles" ci-dessous reste la SEULE source pour ce
  // code, quelle que soit la vraie famille de l'agent concerne.
  const jsCodesDispoSpecial=new Set(["DISPO"]);
  // Postes journée non principaux PRCI (hors postes-formation)
  if(filterF!=="PAR"){
    POSTES_JOURNEE.filter(x=>x.famille==="PRCI"&&!x.principal&&!jsCodesFormationPostes.has(x.jsCode)&&!jsCodesJourneeSpecialePostes.has(x.jsCode)&&!jsCodesDispoSpecial.has(x.jsCode)).forEach(poste=>{
      const ags=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&(en.jsCode===poste.jsCode||en.poste===poste.label);});
      if(ags.length>0)diversRows.push({poste,jsCode:poste.jsCode,agents:ags,famille:"PRCI",isJournee:true,maxSlots:poste.maxSlots||99});
    });
  }
  // Postes journée non principaux PAR (hors postes-formation)
  if(filterF!=="PRCI"){
    POSTES_JOURNEE.filter(x=>x.famille==="PAR"&&!x.principal&&!jsCodesFormationPostes.has(x.jsCode)).forEach(poste=>{
      const ags=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&(en.jsCode===poste.jsCode||en.poste===poste.label);});
      if(ags.length>0)diversRows.push({poste,jsCode:poste.jsCode,agents:ags,famille:"PAR",isJournee:true,maxSlots:poste.maxSlots||99});
    });
  }
  // Disponibles
  // 23/08 (suite) : la ligne ne reconnaissait que le DISPO REEL d'un import
  // CPS (equipe==="DISPO", ecrit par handleCpsImport) -- un DISPO saisi
  // directement dans le perso (equipe:"J", jsCode:"DISPO") n'y apparaissait
  // jamais, y compris dans le Previsionnel (qui reutilise le perso des
  // agents ayant partage_previsionnel=1). Etendu a jsCode==="DISPO" en plus
  // -- sans risque de doublon : un import CPS reel pose TOUJOURS les deux
  // (equipe ET jsCode a "DISPO" a la fois, voir l'override plus haut dans
  // handleCpsImport), donc le OR ne fait que matcher deux fois le meme
  // agent au sein du meme .filter(), jamais une deuxieme ligne.
  const dispos=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&(en.equipe==="DISPO"||en.jsCode==="DISPO");});
  if(dispos.length>0){
    diversRows.push({poste:{jsCode:"DISPO",label:"Disponibles",subtitle:""},jsCode:"DISPO",agents:dispos,famille:null,isDispo:true,maxSlots:99});
  }
  // Renfort samedi (RFT SAM) - poste occasionnel, affiche uniquement si detecte
  const renfortsSamedi=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&en.jsCode==="RFT SAM";});
  if(renfortsSamedi.length>0){
    diversRows.push({poste:{jsCode:"RFT SAM",label:"Renfort samedi",subtitle:""},jsCode:"RFT SAM",agents:renfortsSamedi,famille:null,maxSlots:99});
  }
  // Journee equipe (JEQ, 23/08, demande par Olivier : "et pour journee
  // d'equipe aussi") -- meme raisonnement que DISPO ci-dessus : un JEQ saisi
  // dans le perso (equipe:"J", jsCode:"JEQ") n'apparaissait nulle part,
  // POSTES_JOURNEE l'excluant deliberement (comme AY) pour ne jamais
  // apparaitre comme poste UO fixe dans l'Annuaire (POSTES_JOURNEE alimente
  // aussi ce selecteur, cf. ligne ~10420). Ligne dediee ici, en verifiant
  // directement jsCode plutot que de l'ajouter a POSTES_JOURNEE -- meme
  // principe que RFT SAM juste au-dessus. Contrairement a AY (qui doit
  // "rester a 100% dans le perso", jamais touche ici), JEQ doit desormais
  // apparaitre dans le Previsionnel comme n'importe quel autre poste
  // generique.
  const enJourneeEquipe=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&en.jsCode==="JEQ";});
  if(enJourneeEquipe.length>0){
    diversRows.push({poste:{jsCode:"JEQ",label:"Journée équipe",subtitle:""},jsCode:"JEQ",agents:enJourneeEquipe,famille:null,maxSlots:99});
  }
  // Formation — pave unique : badge generique FOR + tous les postes-formation (K-PAR, K-PRCI, F-PRCI...)
  const enFormation=agents.filter(a=>{
    const en=schedule[`${a.id}-${dateKey}`];
    return en&&(en.equipe==="FOR"||jsCodesFormationPostes.has(en.jsCode)||(en.formation&&!en.equipe));
  });
  if(enFormation.length>0){
    // famille:"FOR" (pas null) -- 18/08, bug reel signale par Olivier : le
    // bouton 🔄/Message libre sur cette ligne synthetique (agents en
    // formation, jamais un vrai poste PRCI/PAR) envoyait famille:null au
    // backend, qui la refuse (validation "js_code, date_jour, famille et
    // type sont requis"). "FOR" est deja la convention utilisee ailleurs
    // dans ce fichier pour cette meme categorie synthetique (ligne ~2718).
    diversRows.push({poste:{jsCode:"FOR",label:"Formation",subtitle:""},jsCode:"FOR",agents:enFormation,famille:"FOR",isFormation:true,maxSlots:99});
  }
  // Journee speciale (PPRCI/PPAR) - regroupes ensemble, plusieurs agents possibles
  const enJourneeSpeciale=agents.filter(a=>{
    const en=schedule[`${a.id}-${dateKey}`];
    return en&&jsCodesJourneeSpecialePostes.has(en.jsCode);
  });
  if(enJourneeSpeciale.length>0){
    diversRows.push({poste:{jsCode:"JOURNEE_SPECIALE",label:"Journee speciale",subtitle:""},jsCode:"JOURNEE_SPECIALE",agents:enJourneeSpeciale,famille:null,isJourneeSpeciale:true,maxSlots:99});
  }
  // VM (visite medicale)
  const enVM=agents.filter(a=>{
    const en=schedule[`${a.id}-${dateKey}`];
    return en&&en.equipe==="VM";
  });
  if(enVM.length>0){
    diversRows.push({poste:{jsCode:"VM",label:"VM",subtitle:""},jsCode:"VM",agents:enVM,famille:null,isVM:true,maxSlots:99});
  }

  if(diversRows.length>0){
    sections.push({id:"DIVERS",label:"🗂 Divers",equipe:"J",pc:pcD,rows:diversRows});
  }

  return sections;
}

// editAlea (18/08, Olivier : "lorqu'on ecrit un message libre, nimporte ou,
// il serait bien de bouton l'ouvrir pour le modifier. sans effacer et
// refaire" puis "dans erreur cps il faut mettre le boutons pour modifier
// aussi") : optionnel, l'alea existant à modifier (message, échange OU
// erreur CPS) — quand fourni, saute l'écran de choix de type et pré-remplit
// motif + agents déjà sélectionnés ; la validation appelle update() au lieu
// de create().
function AleaPopup({agents,jsCode,dateKey,famille,nomOfficiel,currentAgent,onClose,onSaved,editAlea}){
  const [type,setType]=useState(editAlea?editAlea.type:null); // "echange" | "erreur_cps" | "non_tenu" | "message"
  const [agentsChoisis,setAgentsChoisis]=useState(()=>editAlea?.agents_concernes ? agents.filter(a=>editAlea.agents_concernes.includes(a.id)) : []);
  const [motif,setMotif]=useState(editAlea?.motif||"");
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState("");

  const toggleAgent=(ag)=>{
    setAgentsChoisis(prev=>prev.find(a=>a.id===ag.id)?prev.filter(a=>a.id!==ag.id):[...prev,ag]);
  };

  const valider=async()=>{
    setBusy(true);
    try{
      if(editAlea){
        const data={motif:motif||null};
        if(editAlea.type==="echange"||editAlea.type==="erreur_cps") data.agents_concernes=agentsChoisis.map(a=>a.id);
        await api.cpsAleas.update(editAlea.id,data);
      }else{
        await api.cpsAleas.create({
          js_code:jsCode,
          date_jour:dateKey,
          famille,
          type,
          agents_concernes: (type==="non_tenu"||type==="message") ? [] : agentsChoisis.map(a=>a.id),
          motif: motif||null,
        });
      }
      onSaved&&onSaved();
      onClose();
    }catch(err){
      alert("Erreur : "+(err.message||"impossible d'enregistrer"));
    }
    setBusy(false);
  };

  const agentsFiltres=agents.filter(a=>`${a.prenom} ${a.nom}`.toLowerCase().includes(search.toLowerCase()));

  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:20,maxWidth:420,width:"100%",maxHeight:"85vh",overflowY:"auto"}}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{editAlea?(editAlea.type==="echange"?"Modifier l'échange":editAlea.type==="erreur_cps"?"Modifier l'erreur CPS":"Modifier le message"):"Ajustement du poste"}</div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>{nomOfficiel} — {jsCode}</div>

      {!editAlea&&!type&&(<div style={{display:"flex",flexDirection:"column",gap:8}}>
        <button onClick={()=>setType("echange")} style={{padding:"12px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,textAlign:"left",background:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>
          🔄 Échange / Combiné<div style={{fontSize:11,color:"#94a3b8",fontWeight:400,marginTop:2}}>Un ou plusieurs agents assurent ce poste</div>
        </button>
        <button onClick={()=>setType("erreur_cps")} style={{padding:"12px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,textAlign:"left",background:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>
          ⚠️ Erreur CPS<div style={{fontSize:11,color:"#94a3b8",fontWeight:400,marginTop:2}}>Le document officiel comporte une erreur</div>
        </button>
        <button onClick={()=>{setType("non_tenu");}} style={{padding:"12px 14px",border:"1.5px solid #fdba74",borderRadius:10,textAlign:"left",background:"#fff7ed",cursor:"pointer",fontSize:13,fontWeight:600,color:"#c2410c"}}>
          🚫 Poste non tenu<div style={{fontSize:11,color:"#c2410c",fontWeight:400,marginTop:2,opacity:.8}}>Personne n'assure ce poste</div>
        </button>
        <button onClick={()=>{setType("message");}} style={{padding:"12px 14px",border:"1.5px solid #93c5fd",borderRadius:10,textAlign:"left",background:"#eff6ff",cursor:"pointer",fontSize:13,fontWeight:600,color:"#1d4ed8"}}>
          📢 Message libre<div style={{fontSize:11,color:"#1d4ed8",fontWeight:400,marginTop:2,opacity:.8}}>Laisser une info visible par tous sur ce poste</div>
        </button>
      </div>)}

      {/* Exclut aussi "message" (18/08, Olivier : "ca renplis en meme temps
          le recherche d'agent") — cette condition n'excluait avant que
          "non_tenu", donc pour type==="message" ce bloc (recherche d'agent
          + textarea "Motif") s'affichait EN PLUS du vrai formulaire message
          juste en dessous, dupliquant textarea et faisant apparaitre un
          champ de recherche d'agent superflu et deroutant. */}
      {type&&type!=="non_tenu"&&type!=="message"&&(<div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div style={{fontSize:12,fontWeight:700,color:"#475569"}}>{type==="echange"?"Agent(s) qui assure(nt) le poste":"Préciser l'erreur"}</div>
        <input placeholder="Rechercher un agent…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}/>
        {search.trim().length>0?(<div style={{display:"flex",flexWrap:"wrap",gap:6,maxHeight:140,overflowY:"auto"}}>
          {agentsFiltres.slice(0,8).map(a=>{
            const selected=agentsChoisis.find(x=>x.id===a.id);
            return(<button key={a.id} onClick={()=>toggleAgent(a)}
              style={{padding:"5px 10px",borderRadius:8,border:`1.5px solid ${selected?"#0C447C":"#e2e8f0"}`,
              background:selected?"#0C447C":"#fff",color:selected?"#fff":"#475569",fontSize:12,cursor:"pointer"}}>
              {a.prenom} {a.nom}
            </button>);
          })}
        </div>):(<div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic",padding:"4px 2px"}}>Tapez un nom pour rechercher un agent...</div>)}
        <textarea placeholder="Motif (optionnel)" value={motif} onChange={e=>setMotif(e.target.value)}
          style={{padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,minHeight:60,resize:"vertical"}}/>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button onClick={()=>editAlea?onClose():setType(null)} style={{flex:1,padding:"10px 0",border:"1.5px solid #e2e8f0",borderRadius:9,background:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>{editAlea?"Annuler":"Retour"}</button>
          <button onClick={valider} disabled={busy||agentsChoisis.length===0}
            style={{flex:2,padding:"10px 0",border:"none",borderRadius:9,cursor:busy?"wait":"pointer",fontSize:13,fontWeight:700,
            background:agentsChoisis.length===0?"#e2e8f0":"#0C447C",color:agentsChoisis.length===0?"#94a3b8":"#fff"}}>
            {busy?"…":(editAlea?"Enregistrer":"Valider")}
          </button>
        </div>
      </div>)}

      {type==="non_tenu"&&(<div style={{display:"flex",flexDirection:"column",gap:10}}>
        <textarea placeholder="Motif (optionnel)" value={motif} onChange={e=>setMotif(e.target.value)}
          style={{padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,minHeight:60,resize:"vertical"}}/>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button onClick={()=>setType(null)} style={{flex:1,padding:"10px 0",border:"1.5px solid #e2e8f0",borderRadius:9,background:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>Retour</button>
          <button onClick={valider} disabled={busy}
            style={{flex:2,padding:"10px 0",border:"none",borderRadius:9,cursor:busy?"wait":"pointer",fontSize:13,fontWeight:700,background:"#ea580c",color:"#fff"}}>
            {busy?"…":"Confirmer poste non tenu"}
          </button>
        </div>
      </div>)}

      {type==="message"&&(<div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div style={{fontSize:12,fontWeight:700,color:"#1d4ed8"}}>📢 Message libre</div>
        <textarea placeholder="Ton message, visible par tous les agents…" value={motif} onChange={e=>setMotif(e.target.value)} autoFocus
          style={{padding:"8px 10px",border:"1.5px solid #93c5fd",borderRadius:8,fontSize:13,minHeight:80,resize:"vertical"}}/>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button onClick={()=>editAlea?onClose():setType(null)} style={{flex:1,padding:"10px 0",border:"1.5px solid #e2e8f0",borderRadius:9,background:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>{editAlea?"Annuler":"Retour"}</button>
          <button onClick={valider} disabled={busy||!motif.trim()}
            style={{flex:2,padding:"10px 0",border:"none",borderRadius:9,cursor:busy?"wait":"pointer",fontSize:13,fontWeight:700,
            background:!motif.trim()?"#e2e8f0":"#1d4ed8",color:!motif.trim()?"#94a3b8":"#fff"}}>
            {busy?"…":(editAlea?"Enregistrer":"Publier le message")}
          </button>
        </div>
      </div>)}

      <button onClick={onClose} style={{marginTop:14,width:"100%",padding:"8px 0",border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:12}}>Annuler</button>
    </div>
  </div>);
}
function annulerAlea(aleaId, setCpsAleas){
  if(!window.confirm("Voulez-vous supprimer cet ajustement et revenir au planning officiel ?")) return;
  api.cpsAleas.remove(aleaId).then(()=>{
    setCpsAleas(prev=>prev.filter(a=>a.id!==aleaId));
  }).catch(err=>alert("Erreur : "+(err.message||"impossible de supprimer")));
}
function findAlea(cpsAleas, jsCode, dateKey, famille){
  if(!cpsAleas||!cpsAleas.length) return null;
  return cpsAleas.find(a=>a.js_code===jsCode && String(a.date_jour).slice(0,10)===dateKey && a.famille===famille) || null;
}
function PrevisionnelSignalementPopup({agents,agentTitulaireId,dateKey,nomTitulaire,currentAgent,onClose,onSaved}){
  const [agentsChoisis,setAgentsChoisis]=useState([]);
  const [motif,setMotif]=useState("");
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState("");

  const toggleAgent=(ag)=>{
    setAgentsChoisis(prev=>{
      if(prev.find(a=>a.id===ag.id)) return prev.filter(a=>a.id!==ag.id);
      if(prev.length>=4) return prev;
      return [...prev,ag];
    });
  };

  const valider=async()=>{
    setBusy(true);
    try{
      await api.previsionnelSignalements.create({
        agent_titulaire_cp: agentTitulaireId,
        date_jour: dateKey,
        agents_remplacants: agentsChoisis.map(a=>({cp:a.id,nom:a.nom,prenom:a.prenom})),
        motif: motif||null,
      });
      onSaved&&onSaved();
      onClose();
    }catch(err){
      alert("Erreur : "+(err.message||"impossible d'enregistrer"));
    }
    setBusy(false);
  };

  const agentsFiltres=agents.filter(a=>a.id!==agentTitulaireId&&`${a.prenom} ${a.nom}`.toLowerCase().includes(search.toLowerCase()));

  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:20,maxWidth:420,width:"100%",maxHeight:"85vh",overflowY:"auto"}}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:4,color:"#6d28d9"}}>📅 Signaler un changement</div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>{nomTitulaire} — {dateKey}</div>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div style={{fontSize:12,fontWeight:700,color:"#475569"}}>Qui assure reellement ce poste ? (max 4)</div>
        <input placeholder="Rechercher un agent…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}/>
        {search.trim().length>0?(<div style={{display:"flex",flexWrap:"wrap",gap:6,maxHeight:140,overflowY:"auto"}}>
          {agentsFiltres.slice(0,8).map(a=>{
            const selected=agentsChoisis.find(x=>x.id===a.id);
            const disabled=!selected&&agentsChoisis.length>=4;
            return(<button key={a.id} onClick={()=>!disabled&&toggleAgent(a)} disabled={disabled}
              style={{padding:"5px 10px",borderRadius:8,border:`1.5px solid ${selected?"#7c3aed":"#e2e8f0"}`,
              background:selected?"#7c3aed":disabled?"#f8fafc":"#fff",color:selected?"#fff":disabled?"#cbd5e1":"#475569",fontSize:12,cursor:disabled?"not-allowed":"pointer"}}>
              {a.prenom} {a.nom}
            </button>);
          })}
        </div>):(<div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic",padding:"4px 2px"}}>Tapez un nom pour rechercher un agent...</div>)}
        {agentsChoisis.length>=4&&<div style={{fontSize:11,color:"#a16207"}}>Maximum 4 agents atteint</div>}
        <textarea placeholder="Motif (optionnel)" value={motif} onChange={e=>setMotif(e.target.value)}
          style={{padding:"8px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,minHeight:60,resize:"vertical"}}/>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button onClick={onClose} style={{flex:1,padding:"10px 0",border:"1.5px solid #e2e8f0",borderRadius:9,background:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>Annuler</button>
          <button onClick={valider} disabled={busy||agentsChoisis.length===0}
            style={{flex:2,padding:"10px 0",border:"none",borderRadius:9,cursor:busy?"wait":"pointer",fontSize:13,fontWeight:700,
            background:agentsChoisis.length===0?"#e2e8f0":"#7c3aed",color:agentsChoisis.length===0?"#94a3b8":"#fff"}}>
            {busy?"…":"Valider"}
          </button>
        </div>
      </div>
    </div>
  </div>);
}
function annulerPrevisionnelSignalement(id, setPrevisionnelSignalements){
  if(!window.confirm("Voulez-vous annuler ce signalement ?")) return;
  api.previsionnelSignalements.remove(id).then(()=>{
    setPrevisionnelSignalements(prev=>prev.filter(s=>s.id!==id));
  }).catch(err=>alert("Erreur : "+(err.message||"impossible d'annuler")));
}
function findPrevisionnelSignalement(previsionnelSignalements, agentId, dateKey){
  if(!previsionnelSignalements||!previsionnelSignalements.length) return null;
  return previsionnelSignalements.find(s=>s.agent_titulaire_cp===agentId && String(s.date_jour).slice(0,10)===dateKey) || null;
}
function findJourneeSpecialeNote(notes, agentId, dateKey){
  if(!notes||!notes.length) return null;
  return notes.find(n=>n.cp_agent===agentId && String(n.date_jour).slice(0,10)===dateKey) || null;
}
function JourneeSpecialeNotePopup({agentId,agentNom,dateKey,currentMessage,onClose,onSaved}){
  const [message,setMessage]=useState(currentMessage||"");
  const [busy,setBusy]=useState(false);
  const valider=async()=>{
    if(!message.trim())return;
    setBusy(true);
    try{
      await api.journeeSpecialeNotes.save({cp_agent:agentId,date_jour:dateKey,message:message.trim()});
      onSaved();
      onClose();
    }catch(e){console.error(e);}
    setBusy(false);
  };
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:18,maxWidth:380,width:"100%",display:"flex",flexDirection:"column",gap:10}}>
      <div style={{fontSize:14,fontWeight:800,color:"#1e293b"}}>📝 Message public — {agentNom}</div>
      <div style={{fontSize:11,color:"#64748b"}}>Visible par tous dans le CPS Officiel et le Previsionnel.</div>
      <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="ex: Reunion service, visite de poste..." rows={3} style={{border:"1.5px solid #e2e8f0",borderRadius:9,padding:"8px 10px",fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit"}}/>
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={onClose} style={{flex:1,padding:"9px",background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:13}}>Annuler</button>
        <button onClick={valider} disabled={busy||!message.trim()} style={{flex:1,padding:"9px",background:message.trim()?"#1e293b":"#e2e8f0",color:message.trim()?"#fff":"#94a3b8",border:"none",borderRadius:8,cursor:message.trim()?"pointer":"not-allowed",fontWeight:700,fontSize:13}}>{busy?"...":"Enregistrer"}</button>
      </div>
    </div>
  </div>);
}

function GlobalView({agents,schedule,setSchedule,cpsAleas,setCpsAleas,weekOffset,setWeekOffset,onImport,currentAgent,onAddAgent,onRemoveAgent,isAdmin,isPrevisionnel,previsionnelSignalements,setPrevisionnelSignalements,journeeSpecialeNotes,setJourneeSpecialeNotes}){
  const [dayIdx,setDayIdx]=useState(()=>{const d=new Date().getDay();return d===0?6:d-1;});
  const goToDay=(delta)=>{
    let newIdx=dayIdx+delta;
    if(newIdx>6){setWeekOffset(w=>w+1);setDayIdx(0);}
    else if(newIdx<0){setWeekOffset(w=>w-1);setDayIdx(6);}
    else{setDayIdx(newIdx);}
  };
  const goToToday=()=>{
    setWeekOffset(0);
    const d=new Date().getDay();
    setDayIdx(d===0?6:d-1);
  };
  const jumpToDate=(dateStr)=>{
    const target=new Date(dateStr+"T12:00:00");
    const targetDow=target.getDay();
    const targetMondayOffset=targetDow===0?-6:1-targetDow;
    const targetMonday=new Date(target); targetMonday.setDate(target.getDate()+targetMondayOffset); targetMonday.setHours(12,0,0,0);
    const today=new Date();
    const todayDow=today.getDay();
    const todayMondayOffset=todayDow===0?-6:1-todayDow;
    const currentMonday=new Date(today); currentMonday.setDate(today.getDate()+todayMondayOffset); currentMonday.setHours(12,0,0,0);
    const diffWeeks=Math.round((targetMonday-currentMonday)/(7*24*60*60*1000));
    setWeekOffset(diffWeeks);
    setDayIdx(targetDow===0?6:targetDow-1);
  };
  const swipeDay=useSwipeHandlers(()=>goToDay(1),()=>goToDay(-1));
  const dateJumpRef=useRef();
  const [aleaTarget,setAleaTarget]=useState(null);
  const [previsionnelTarget,setPrevisionnelTarget]=useState(null);
  const [journeeSpecialeNoteTarget,setJourneeSpecialeNoteTarget]=useState(null);
  const [filterF,setFilterF]=useState("ALL");
  const [search,setSearch]=useState("");
  const [uploading,setUploading]=useState(false);
  const [cpsResult,setCpsResult]=useState(null);
  useEffect(()=>{
    if(!cpsResult) return;
    const t=setTimeout(()=>setCpsResult(null),4000);
    return ()=>clearTimeout(t);
  },[cpsResult]);
  const [dernierImport,setDernierImport]=useState(null);
  const chargerDernierImport=()=>{
    if(isPrevisionnel) return;
    api.cps.getLastImport().then(setDernierImport).catch(()=>{});
  };
  useEffect(()=>{
    chargerDernierImport();
    if(isPrevisionnel) return;
    const interval=setInterval(chargerDernierImport,45000);
    return ()=>clearInterval(interval);
  },[isPrevisionnel]); // eslint-disable-line
  // Import en attente de confirmation (extrait par l'OCR mais pas encore enregistré)
  const [pendingImport,setPendingImport]=useState(null);
  const [savingImport,setSavingImport]=useState(false);
  // Historique des imports (90 derniers jours) — panneau replié par defaut
  const [showHistory,setShowHistory]=useState(false);
  const [history,setHistory]=useState([]);
  const [undoing,setUndoing]=useState(false);
  const chargerHistory=()=>{
    if(isPrevisionnel) return;
    api.cps.getHistory().then(setHistory).catch(()=>{});
  };
  useEffect(()=>{
    if(!showHistory) return;
    chargerHistory();
  },[showHistory]); // eslint-disable-line
  const annulerDernierImport=async()=>{
    if(!window.confirm("Annuler le tout dernier import CPS ? Le planning officiel reviendra à son état précédent."))return;
    setUndoing(true);
    try{
      await api.cps.undoLastImport();
      chargerHistory();
      chargerDernierImport();
      const entries=await api.cps.getSchedule();
      // 04/08 : api.cps.getSchedule() sans from/to renvoie toujours l'instantane
      // COMPLET du planning officiel - remplacement direct plutot qu'une fusion
      // additive (meme bug/meme correctif que reconcileSchedule pour le planning
      // perso : une fusion ne peut jamais faire disparaitre une entree annulee
      // cote serveur, ici precisement apres une annulation d'import).
      if(entries) setSchedule(entries);
    }catch(err){
      alert("Erreur lors de l'annulation : "+err.message);
    }
    setUndoing(false);
  };
  const weekDates=useMemo(()=>getWeekDates(weekOffset),[weekOffset]);
  const dateKey=weekDates[dayIdx];
  // Boutons ‹ › à côté du mois (19/08, demandé par Olivier -- absents jusque-là,
  // seule la navigation jour par jour existait ici, via swipe ou les pastilles de
  // jour). Saute d'un mois entier (même jour du mois suivant/précédent) via
  // jumpToDate, qui recalcule déjà correctement weekOffset/dayIdx.
  const changerMoisNav=(delta)=>{
    const [y,m,d]=dateKey.split("-").map(Number);
    const target=new Date(y,m-1+delta,d,12,0,0);
    const ts=`${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,"0")}-${String(target.getDate()).padStart(2,"0")}`;
    jumpToDate(ts);
  };
  const sections=useMemo(()=>buildSections(schedule,dateKey,filterF,agents,isPrevisionnel),[schedule,dateKey,filterF,agents,isPrevisionnel]);

    const handleCpsImport=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    setUploading(true);
    setCpsResult(null);
    const reader=new FileReader();
    reader.onload=async()=>{
      const b64=reader.result.split(",")[1];
      try{
        // OCR d'une image base64 via OCR.space (moteur 2 avec repli auto sur le
        // moteur 1 en cas de timeout — voir ocrImageViaOcrSpace)
        const ocrPage=ocrImageViaOcrSpace;

        let text="";
        if(file.type==="application/pdf"){
          // Texte natif d'abord (14/08, meme principe deja eprouve pour
          // BulletinImportButton/extraireTextePdfNatif) : les feuilles de
          // presence "FEUILLE DE PRESENCE JOURNALIERE" recues par Olivier sont
          // des PDF natifs (texte selectionnable), pas des scans — l'ancien
          // pipeline forcait pourtant systematiquement rendu canvas haute
          // resolution (scale 3.0) + OCR.space page par page, meme pour ces
          // documents-la. Sur un import multi-jours (une feuille = plusieurs
          // pages, une par jour), ca representait autant d'allers-retours OCR
          // sequentiels (jusqu'a 45s chacun en cas de repli moteur 1) — cause
          // tres probable des echecs/blocages signales par Olivier (ordi et
          // tel) sur un import PRCI 10 pages / PAR 6 pages. Le texte natif est
          // instantane, sans le moindre artefact d'OCR, et se lit
          // parfaitement sur ces documents (verifie : cheque page produit un
          // texte propre et complet). Seuil identique a BulletinImportButton
          // (30 caracteres hors espaces) pour bien distinguer un vrai PDF
          // natif d'un PDF scanne sans aucune couche texte, qui doit toujours
          // repasser par l'OCR ci-dessous.
          const nativeText=await extraireTextePdfNatif(b64);
          if(nativeText && nativeText.replace(/\s/g,"").length>=30){
            text=nativeText;
          }else{
            // Rendu client page par page (pdfjs-dist) puis OCR de chaque image PNG
            // haute resolution. Envoyer le PDF brut directement a OCR.space (essaye
            // le 04/08) evite bien la page blanche mais degrade la qualite du texte
            // (horaires mal formates, isTable moins efficace sur le PDF entier) au
            // point de faire echouer la reconnaissance d'agents ensuite - constate
            // par Olivier juste apres ce changement. La vraie cause de la page
            // blanche etait une regression de pdfjs-dist 6.x (rendu completement
            // vide sur ces PDF scannes, meme avec fond blanc explicite et delai
            // avant rendu) : figee sur la version 4.0.379, confirmee correcte.
            const pdfjsLib=await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/build/pdf.worker.mjs",import.meta.url).toString();
            const pdfData=atob(b64);
            const pdfBytes=new Uint8Array(pdfData.length);
            for(let i=0;i<pdfData.length;i++) pdfBytes[i]=pdfData.charCodeAt(i);
            const pdf=await pdfjsLib.getDocument({data:pdfBytes}).promise;
            const numPages=pdf.numPages;
            const texts=[];
            for(let pageNum=1;pageNum<=numPages;pageNum++){
              const page=await pdf.getPage(pageNum);
              const scale=computeOcrScale(page); // 3.0 par défaut, plafonné si la page native est déjà grande
              const viewport=page.getViewport({scale});
              const canvas=document.createElement("canvas");
              canvas.width=viewport.width;
              canvas.height=viewport.height;
              const ctx=canvas.getContext("2d");
              ctx.fillStyle="#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
              await page.render({canvasContext:ctx,viewport}).promise;
              const pageB64=canvas.toDataURL("image/jpeg",0.85).split(",")[1];
              const pageText=await ocrPage(pageB64,"image/jpeg");
              texts.push(pageText);
            }
            text=texts.join("\n");
          }
        }else{
          // Image directe
          text=await ocrPage(b64,file.type||"image/jpeg");
        }
        console.log("TEXTE:",text);
        // Fix OCR : espace parasite a l'interieur d'un code JS (ex: "PIL CLX" -> "PILCLX")
        // — inoffensif sur du texte natif (ne matche que le defaut OCR exact).
        text=text.replace(/\b(PI|PA)([A-Z]{2,4}) ([A-Z0-9]{1,3}[-OXJ%]?)\b/g,"$1$2$3");
        if(!text) throw new Error("Aucun texte extrait du document");

        // Regex date tolerante (14/08) : certaines pages de ces feuilles de
        // presence natives perdent le ":" ("DU   14/0812026" au lieu de
        // "DU:   14/08/2026") et/ou un "/" se lit comme un "1" — meme defaut
        // d'extraction deja tolere par parseBulletinCommande plus haut dans ce
        // fichier, jamais aligne ici. Verifie sur les 2 PDF reels d'Olivier :
        // l'ancienne regex stricte manquait 2 marqueurs "DU" sur 10 (PRCI) et
        // 2 sur 5 (PAR) — les jours concernes se faisaient alors silencieusement
        // rattacher a la date du marqueur precedent (dateForIndex ci-dessous),
        // au lieu d'echouer proprement.
        const dateMatch=text.match(/DU\s*:?\s*(\d{2})[\/1](\d{2})[\/1](\d{4})/);
        const dateStr=dateMatch?`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`:new Date().toISOString().slice(0,10);
        // Decouper le texte en blocs par page : chaque page a son propre "DU : JJ/MM/AAAA"
        // qui s'applique a toutes les lignes suivantes jusqu'a la prochaine occurrence.
        const dateBlockRe=/DU\s*:?\s*(\d{2})[\/1](\d{2})[\/1](\d{4})/g;
        const dateMarkers=[];
        let dm;
        while((dm=dateBlockRe.exec(text))!==null){
          dateMarkers.push({index:dm.index, date:`${dm[3]}-${dm[2]}-${dm[1]}`});
        }
        const dateForIndex=(charIndex)=>{
          let result=dateStr;
          for(const marker of dateMarkers){
            if(marker.index<=charIndex) result=marker.date;
            else break;
          }
          return result;
        };
        const rawLinesRaw=text.split(/\n/);
        // Associer chaque ligne brute (non trimmee) a sa position absolue dans le texte,
        // pour en deduire la date "DU :" correcte AVANT toute fusion.
        let cursor=0;
        const rawLinesWithPos=rawLinesRaw.map(l=>{
          const startPos=cursor;
          cursor+=l.length+1; // +1 pour le \n consomme par split
          return {text:l.trim(), pos:startPos};
        }).filter(o=>o.text.length>0);
        // Filtrer le texte de pied de page / en-tete connu AVANT la fusion (15/08) : ces
        // lignes ("SOCIETE NATIONALE DES CHEMINS DE FER FRANCAIS", legende des prefixes,
        // en-tete "FEUILLE DE PRESENCE JOURNALIERE"/"JOURNEE DE SERVICE COUVERTE PAR"/
        // "Nom Prenom Grade Cde Observ.") ne commencent jamais par un jsCode ni un horaire
        // complet, donc se recollaient en cascade a la ligne precedente sur les PDF qui
        // regroupent plusieurs jours/pages en un seul fichier — engloutissant au passage
        // la toute premiere ligne de donnees reelles de la page suivante (ex: un agent
        // entier disparu, noye dans un bloc geant melangeant plusieurs rangees de tableau
        // differentes). Les retirer avant la fusion les empeche de servir de pont.
        const boilerplateRe=/SOCIETE NATIONALE DES CHEMINS DE FER|FEUILLE DE PRESENCE JOURNALIERE|JOURNEE DE SERVICE COUVERTE PAR|U\.?O\.?P\.?\s*:|Nom Pr[ée]nom|Grade Cde Observ|Cde Observ\.?$|(signification.*(pr[ée]fixes|accol[ée]s))|(accol[ée]s.*signification)|^Page\s*:?\s*\d+/i;
        const rawLinesFiltered=rawLinesWithPos.filter(o=>!boilerplateRe.test(o.text));
        const rawLines=rawLinesFiltered.map(o=>o.text);
        // Fusionner les lignes : si une ligne ne contient pas de debut d'horaire (HH:MM en debut/proche du debut)
        // et ne commence pas par un jsCode connu, on la rattache a la ligne precedente (cas OCR qui scinde
        // le jsCode+debut d'horaire d'un cote et la fin d'horaire+nom de l'autre cote)
        const jsCodeStartRe=/^[#*€|]?\s*(PA[A-Z0-9]+-?|PI[A-Z0-9]+-?|SD%|F-PRCI|AFOPRCI|CAF|PPRCI|PPAR|VM|AFO PAR|K-PAR|F-PAR|K-PRCI|A-PRCI|RFT SAM|RET SAM|DISPO)\b/;
        // Le marqueur de date "DU : JJ/MM/AAAA" signale toujours une transition de page/jour
        // reelle — jamais rattache a la ligne precedente, meme s'il ne matche ni jsCode ni
        // horaire complet (evite qu'il serve lui aussi de pont entre deux rangees).
        const dateMarkerLineRe=/DU\s*:?\s*\d{2}[\/1]\d{2}[\/1]\d{4}/;
        const lines=[];
        const lineDates=[];
        rawLinesFiltered.forEach(o=>{
          const line=o.text;
          const hasFullHoraire=/\d{2}:\d{2}\s*[-.]\s*\d{2}:\d{2}/.test(line);
          const startsNewBlock=jsCodeStartRe.test(line)||hasFullHoraire||dateMarkerLineRe.test(line);
          if(startsNewBlock||lines.length===0){
            lines.push(line);
            lineDates.push(dateForIndex(o.pos));
          }else{
            lines[lines.length-1]=lines[lines.length-1]+" "+line;
          }
        });
        let nb=0,ec=0;
        const updates=[];
        lines.forEach((line,lineIdx)=>{
          const lineDateStr=lineDates[lineIdx]||dateStr;
          // fix extraction (17/08) : sur certaines pages, pdfjs extrait un "." (code 46)
          // a la place du "-" separateur entre les deux heures de l'horaire principal
          // (ex: "06:15 . 14:17" au lieu de "06:15 - 14:17") - probablement un artefact
          // de police/kerning propre a cette page du document source (l'horaire de la
          // pause juste a cote, sur la meme ligne, garde lui un vrai "-"). Sans ca, la
          // ligne entiere etait ignoree (horaireMatch null) et la case restait "Vacant"
          // ou gardait une ancienne donnee perimee. Accepter aussi "." est sans risque :
          // aucune autre donnee du tableau ne prend la forme "HH:MM . HH:MM".
          const horaireMatch=line.match(/(\d{2}):(\d{2})\s*[-.]\s*(\d{2}):(\d{2})/);
          if(!horaireMatch) return;
          // fix extraction (17/08) : le regex de code JS n'etait pas ancre au debut de
          // la ligne — quand le vrai code etait trop corrompu pour matcher (glyphe illisible),
          // .match() cherchait alors n'importe ou dans le reste de la ligne et retombait sur
          // le premier fragment PA.../PI... suivant : souvent le mot "PAR" du libelle de
          // famille ("AC PAR"/"ASMTE PAR" en fin de ligne), ou meme le nom de l'agent s'il
          // commence par PA (ex: "PASTANT", "PATRICK") — un code totalement invente etait
          // alors ecrit en base a la place de la vraie donnee. Le code JS est toujours le
          // tout premier token de la ligne assemblee (regle de detection de nouveau bloc,
          // voir jsCodeStartRe plus haut) — ancrer au debut elimine ce faux-positif ; si le
          // vrai code reste illisible, jsCode redevient null (fallback sur l'ancienne valeur)
          // plutot que d'ecrire une donnee activement fausse.
          // fix extraction (17/08) : "Pl" (P + L minuscule) au tres debut de ligne est une
          // confusion glyphe connue de "PI" (I majuscule lu comme l minuscule) — normalise
          // uniquement pour la detection du code, jamais pour le reste de la ligne (nom,
          // horaire...).
          const lineForJs=line.replace(/^(\s*)Pl(?=[A-Z])/,"$1PI");
          const jsCodeMatch=lineForJs.match(/^[#*€|]?\s*(PA[A-Z0-9]+-|PA[A-Z0-9]+\b|PI[A-Z0-9]+-|PI[A-Z0-9]+\b|SD%|50%|F-PRCI|AFOPRCI|CAF|PPRCI|PPAR|VM|AFO PAR|K-PAR|F-PAR|K-PRCI|A-PRCI|RFT SAM|RET SAM|DISPO)/);
          let jsCode=jsCodeMatch?jsCodeMatch[1]:null;
          if(jsCode==="50%") jsCode="SD%"; // fix OCR : S/D lus comme 5/0
          // fix extraction (17/08) : sur certaines occurrences, pdfjs ne separe pas le
          // code JS et le debut de l'horaire par un espace dans son propre texte source
          // (ex: "PICCLX22:15" au lieu de "PICCLX" + "22:15") - le regex de code JS,
          // gourmand sur [A-Z0-9]+, avale alors les 1-2 premiers chiffres de l'heure
          // ("PICCLX22" au lieu de "PICCLX"). Aucun vrai code JS ne se termine par un
          // chiffre nu (toujours -/O/X/J ou un suffixe fixe) - retirer ces chiffres
          // parasites est donc sans risque de casser un cas legitime. Bug confirme via
          // l'agent BELOTTI Florent (PICCLX), reste invisible/vacant dans le calendrier
          // sans ce correctif malgre une extraction et un matching par ailleurs corrects.
          if(jsCode&&/^(PA|PI)[A-Z]+\d{1,2}$/.test(jsCode)) jsCode=jsCode.replace(/\d{1,2}$/,"");
          if(jsCode&&/PA[A-Z]+1[0]$/.test(jsCode)) jsCode=jsCode.slice(0,-1)+"O";
          if(jsCode&&/OR$/.test(jsCode)) jsCode=jsCode.slice(0,-1); // fix OCR : R parasite apres O
          if(jsCode&&/XR$/.test(jsCode)) jsCode=jsCode.slice(0,-1); // fix OCR : R parasite apres X
          if(jsCode&&/PIADIX$/.test(jsCode)) jsCode="PIADJX"; // fix OCR : I lu au lieu de J
          if(jsCode&&/PIADAX$/.test(jsCode)) jsCode="PIADJX"; // fix OCR : A lu au lieu de J
          if(jsCode==="PICCL"&&/2[12]:\d{2}\s*-\s*0[0-6]:\d{2}/.test(line)) jsCode="PICCLX"; // fix OCR : X final manquant (detecte via horaire de nuit)
          if(jsCode&&/^PAACIX$/.test(jsCode)) jsCode="PAAC1X"; // fix OCR : I lu au lieu de 1
          if(jsCode&&/^PAACIO$/.test(jsCode)) jsCode="PAAC1O"; // fix OCR : I lu au lieu de 1
          if(jsCode&&/^PAACI-$/.test(jsCode)) jsCode="PAAC1-"; // fix OCR : I lu au lieu de 1
          if(jsCode&&/^PIPAZJ$/.test(jsCode)) jsCode="PIPA2J"; // fix OCR : Z lu au lieu de 2
          if(jsCode&&/^PAACZX$/.test(jsCode)) jsCode="PAAC2X"; // fix OCR : Z lu au lieu de 2
          if(jsCode&&/^PAACZO$/.test(jsCode)) jsCode="PAAC2O"; // fix OCR : Z lu au lieu de 2
          if(jsCode&&/^PAAC20$/.test(jsCode)) jsCode="PAAC2O"; // fix OCR : 0 chiffre lu au lieu de O lettre
          if(jsCode==="RET SAM") jsCode="RFT SAM"; // fix OCR : E lu au lieu de F
          if(jsCode==="PICOLO") jsCode="PICCLO"; // fix extraction (17/08) : un des deux "C" de "PICCLO" disparait a l'extraction sur certaines pages (glyphes "CL" trop rapproches)
          // fix extraction (18/08) : sur certaines pages, l'annotation "Fé" (jour
          // ferie, a cote d'un horaire de soiree decale — ex: "PIVGDO Fé 16:15 -
          // 23:52") se colle au code SANS espace dans le flux de texte du build
          // navigateur reel de pdfjs (jamais reproduit avec le build Node legacy
          // utilise pour les diagnostics hors-ligne) — l'accent "é" disparait au
          // passage, ne laissant qu'un "F" isole colle en bout de code ("PIVGDOF"
          // au lieu de "PIVGDO"). Code corrompu confirme en base apres un import
          // reel (agent LUCAS Samuel, 25/05/2026, feuille de presence PRCI 44) :
          // ne correspond a aucun poste connu, la case restait "Vacant" malgre
          // un agent bien present. Aucun vrai code ne se termine par un "F" seul,
          // retrait sans risque.
          if(/^(PA|PI)[A-Z]+F$/.test(jsCode)) jsCode=jsCode.slice(0,-1);
          if(jsCode==="PILND-") jsCode="PILNO-"; // fix OCR : D lu au lieu de O
          if(jsCode==="PIAOJX") jsCode="PIADJX"; // fix OCR : O lu au lieu de D
          // fix extraction (17/08) : un nom de famille en 2 mots (ex: "VICENTE CARREIRA",
          // "EL ADRAOUI", "LE MOISY") peut etre extrait par pdfjs comme un seul mot colle
          // sans espace ("VICENTECARREIRA") - la comparaison stricte ne matchait alors
          // plus jamais aucun candidat pour ces agents (0 candidat -> ligne ignoree),
          // laissant une ancienne donnee perimee en base indefiniment quel que soit le
          // contenu de la ligne par ailleurs. Comparaison insensible aux espaces = sans
          // risque avec 71 agents aux noms suffisamment distincts.
          const norm=s=>s.toUpperCase().replace(/\s+/g,"");
          const ligneNorm=norm(line);
          const candidats=agents.filter(a=>ligneNorm.includes(norm(a.nom)));
          // Distance de Levenshtein simple pour tolerer les erreurs OCR sur le prenom (ex: AVON vs YVON)
          const levenshtein=(a,b)=>{
            const m=a.length,n=b.length;
            const dp=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);
            for(let j=0;j<=n;j++) dp[0][j]=j;
            for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){
              dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
            }
            return dp[m][n];
          };
          let ag;
          if(candidats.length<=1){
            ag=candidats[0];
          }else{
            // Cherche d'abord un match exact du prenom
            ag=candidats.find(a=>a.prenom&&line.toUpperCase().includes(a.prenom.toUpperCase()));
            if(!ag){
              // Sinon, cherche le candidat dont le prenom est le plus proche (tolerance erreurs OCR)
              const mots=line.toUpperCase().split(/[^A-Z]+/).filter(w=>w.length>=3);
              let meilleurCandidat=null,meilleureDistance=Infinity;
              candidats.forEach(a=>{
                if(!a.prenom) return;
                const prenomMaj=a.prenom.toUpperCase();
                mots.forEach(mot=>{
                  const dist=levenshtein(prenomMaj,mot);
                  if(dist<meilleureDistance&&dist<=2){
                    meilleureDistance=dist;
                    meilleurCandidat=a;
                  }
                });
              });
              ag=meilleurCandidat||candidats[0];
            }
          }
          if(!ag) return;
          const hDebut=parseInt(horaireMatch[1]);
          let equipe="J";
          if(hDebut>=4&&hDebut<11) equipe="M";
          else if(hDebut>=11&&hDebut<20) equipe="AM";
          else equipe="N";
          if(jsCode&&/J$/.test(jsCode)) equipe="J";
          // Detection statuts speciaux (Formation, VM) - les lignes sont deja fusionnees,
          // on ne regarde que la ligne courante pour eviter de capturer le mot-cle d'un autre agent
          if(/formation/i.test(line)) equipe="FOR";
          else if(/\bVM\b/.test(line)) equipe="VM";
          // fix (23/08) : DISPO (agent present, aucun poste vacant a couvrir) n'a pas
          // de suffixe -/O/X/J et n'apparait jamais sur la feuille avec un horaire fixe
          // de vacation (ex: "09:00 - 14:30", horaire libre) — sans ce cas explicite, la
          // classification par heure ci-dessus (hDebut) le range a tort dans M/AM/N selon
          // l'heure de debut, avec jsCode reste a null avant l'ajout de DISPO aux regex
          // ci-dessus. La ligne "Divers > Disponibles" de CPS Officiel (GlobalView) filtre
          // strictement sur equipe==="DISPO" — sans ce override, l'agent devenait invisible
          // partout (ni dans un poste fixe, faute de jsCode ; ni dans Disponibles, faute
          // du bon equipe). Cas reel confirme : CAILLET Maxime, 24/08/2026.
          if(jsCode==="DISPO") equipe="DISPO";
          const key=`${ag.id}-${lineDateStr}`;
          const existing=schedule[key];
          const horaires=`${horaireMatch[1]}h${horaireMatch[2]}–${horaireMatch[3]}h${horaireMatch[4]}`;
          if(existing&&(existing.equipe!==equipe||existing.jsCode!==jsCode)) ec++;
          const finalJsCode=jsCode||existing?.jsCode||null;
          updates.push({key,equipe,jsCode:finalJsCode,horaires,cp_agent:ag.id,date_jour:lineDateStr,famille:ag.fam||"PAR"});
          nb++;
        });
        if(updates.length===0) throw new Error("Aucun agent reconnu dans le document. Verifiez le format.");

        // On ne sauvegarde pas tout de suite : on affiche un récap et on attend
        // une confirmation explicite avant d'écraser le planning officiel partagé.
        setPendingImport({date:dateStr,nb,ecarts:ec,updates});
      }catch(err){
        alert("Erreur import CPS : "+err.message);
      }
      setUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value="";
  };

  const confirmerImport=async()=>{
    if(!pendingImport) return;
    const {date:dateStr,nb,ecarts:ec,updates}=pendingImport;
    setSavingImport(true);
    try{
      // Sauvegarder en base via API (persistance Railway) — si ça échoue, on ne
      // doit surtout pas afficher un faux succès ni mettre à jour l'affichage
      // local : l'erreur remonte au catch, qui prévient l'utilisateur sans
      // perdre l'import en attente (on peut réessayer sans refaire l'OCR).
      await api.cps.import(updates.map(u=>({
        cp_agent: u.cp_agent,
        date_jour: u.date_jour,
        equipe: u.equipe,
        js_code: u.jsCode,
        horaires: u.horaires,
        famille: u.famille,
      })));

      setSchedule(prev=>{
        const next={...prev};
        updates.forEach(u=>{next[u.key]={equipe:u.equipe,jsCode:u.jsCode,horaires:u.horaires,prive:false,impressionAt:new Date().toISOString()};});
        return next;
      });
      setCpsResult({date:dateStr,nb,ecarts:ec});
      setPendingImport(null);
      chargerDernierImport();
      if(showHistory) chargerHistory();
    }catch(err){
      alert("Erreur import CPS : "+err.message+"\n\nL'import n'a pas été enregistré, tu peux réessayer.");
    }
    setSavingImport(false);
  };
  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    {isPrevisionnel&&<div style={{display:"flex",alignItems:"center",gap:10,background:"#4338CA",borderRadius:12,padding:"12px 16px",flexWrap:"wrap"}}>
      <span style={{fontSize:20}}>📅</span>
      <div style={{display:"flex",flexDirection:"column",gap:2,flex:1,minWidth:200}}>
        <span style={{fontSize:15,fontWeight:800,color:"#fff"}}>Planning prévisionnel partagé</span>
        <span style={{fontSize:12,color:"#E0E7FF"}}>Basé sur les déclarations personnelles des agents</span>
      </div>
    </div>}
    {!isPrevisionnel&&<div style={{display:"flex",alignItems:"center",gap:10,background:"#0C447C",borderRadius:12,padding:"12px 16px",flexWrap:"wrap"}}>
      <span style={{fontSize:20}}>📋</span>
      <div style={{display:"flex",flexDirection:"column",gap:2,flex:1,minWidth:200}}>
        <span style={{fontSize:15,fontWeight:800,color:"#fff"}}>FEUILLE DE PRESENCE JOURNALIERE</span>
        <span style={{fontSize:11,color:"#BFDBFE"}}>
          {dernierImport
            ? `Dernier import : ${new Date(dernierImport.importe_le).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}${dernierImport.prenom?` par ${dernierImport.prenom} ${dernierImport.nom}`:""}`
            : "Aucun import pour l'instant"}
        </span>
      </div>
    </div>}

    {pendingImport&&<div style={{background:"#fffbeb",border:"1.5px solid #fbbf24",borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
      <div style={{fontSize:13,fontWeight:700,color:"#92400e"}}>
        ⚠️ Confirmer l'import : <strong>{pendingImport.nb} agent{pendingImport.nb>1?"s":""}</strong> détecté{pendingImport.nb>1?"s":""} pour le <strong>{new Date(pendingImport.date+"T12:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"})}</strong>
        {pendingImport.ecarts>0&&<> · {pendingImport.ecarts} écart{pendingImport.ecarts>1?"s":""} avec le planning perso déclaré</>}
      </div>
      <div style={{fontSize:11,color:"#92400e",opacity:.85}}>Ça va remplacer le planning officiel partagé pour cette date. Vérifie que c'est le bon document avant de valider.</div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>setPendingImport(null)} disabled={savingImport} style={{padding:"8px 16px",background:"#fff",color:"#92400e",border:"1.5px solid #fbbf24",borderRadius:8,cursor:savingImport?"default":"pointer",fontSize:12,fontWeight:700}}>Annuler</button>
        <button onClick={confirmerImport} disabled={savingImport} style={{padding:"8px 16px",background:savingImport?"#dc2626":"#d97706",color:"#fff",border:"none",borderRadius:8,cursor:savingImport?"default":"pointer",fontSize:12,fontWeight:700,transition:"background .3s"}}>{savingImport?"⏳ Enregistrement...":"✓ Confirmer l'import"}</button>
      </div>
    </div>}

    {/* Réorganisé le 19/08 (Olivier : "je veux tous prci par et rechercher
        sur le meme ligne sous le bandeau, avec tous prci par a gauche et
        rechercher a droite. et ensuite dans cps en 2eme ligne [...] import
        pdf a gauche et historique a droite") -- 2 lignes explicites plutôt
        qu'un seul flex qui s'enroule selon la largeur disponible : ligne 1
        (filtre + recherche, CPS Officiel ET Planning Prévisionnel puisque
        ce bloc n'est pas conditionné à isPrevisionnel) toujours affichée,
        ligne 2 (import + historique, CPS Officiel seulement) uniquement
        si !isPrevisionnel. */}
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:3,background:"#f1f5f9",borderRadius:10,padding:3}}>
          {[["ALL","Tous"],["PRCI","PRCI"],["PAR","PAR"]].map(([k,l])=>(
            <button key={k} onClick={()=>setFilterF(k)} style={{border:"none",borderRadius:8,padding:"6px 13px",cursor:"pointer",background:filterF===k?"#0C447C":"transparent",color:filterF===k?"#fff":"#475569",fontSize:12,fontWeight:filterF===k?700:600}}>{l}</button>
          ))}
        </div>
        <input placeholder="🔍 Rechercher…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{border:"1.5px solid #e2e8f0",borderRadius:10,padding:"8px 14px",fontSize:13,flex:1,minWidth:140,outline:"none"}}/>
      </div>
      {!isPrevisionnel&&<div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <label style={{cursor:uploading?"default":"pointer",flexShrink:0}}>
          <div style={{background:uploading?"#dc2626":"#0f4c81",color:"#fff",borderRadius:10,padding:"8px 12px",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:5,transition:"background .3s"}}>
            {uploading?"⏳...":"📥 Importer feuille de présence"}
          </div>
          <input type="file" accept=".pdf,image/*" onChange={handleCpsImport} style={{display:"none"}} disabled={uploading}/>
        </label>
        {cpsResult&&<span style={{fontSize:10,background:"#f0fdf4",color:"#16a34a",borderRadius:8,padding:"4px 10px",fontWeight:700}}>✅ {cpsResult.nb} agents · {cpsResult.date}</span>}
        <button onClick={()=>setShowHistory(s=>!s)} style={{marginLeft:"auto",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"8px 12px",fontSize:11,fontWeight:700,color:"#475569",background:showHistory?"#f1f5f9":"#fff",cursor:"pointer",flexShrink:0}}>🕓 Historique</button>
      </div>}
    </div>

    {!isPrevisionnel&&showHistory&&<div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
      <div style={{fontSize:12,fontWeight:700,color:"#64748b"}}>HISTORIQUE DES IMPORTS (90 derniers jours)</div>
      {history.length===0&&<div style={{fontSize:12,color:"#94a3b8"}}>Aucun import dans les 90 derniers jours.</div>}
      {history.map((h,i)=>(
        <div key={h.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderTop:i>0?"1px solid #f1f5f9":"none",fontSize:12,flexWrap:"wrap"}}>
          <span style={{color:"#1e293b",fontWeight:600}}>{new Date(h.importe_le).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
          <span style={{color:"#64748b"}}>par {h.prenom} {h.nom} · {h.nb_entrees} entrée{h.nb_entrees>1?"s":""}</span>
          {h.annule_le
            ? <span style={{color:"#dc2626",fontSize:11}}>↩️ Annulé le {new Date(h.annule_le).toLocaleDateString("fr-FR")} par {h.annule_par_prenom} {h.annule_par_nom}</span>
            : (i===0&&<button onClick={annulerDernierImport} disabled={undoing} style={{marginLeft:"auto",padding:"4px 10px",background:"#fef2f2",color:"#b91c1c",border:"1px solid #fecaca",borderRadius:6,cursor:undoing?"default":"pointer",fontSize:11,fontWeight:700}}>{undoing?"⏳...":"↩️ Annuler"}</button>)}
        </div>
      ))}
    </div>}

    {/* Nav semaine */}
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <button onClick={()=>changerMoisNav(-1)} aria-label="Mois précédent" style={NAV_ARROW_STYLE}>‹</button>
        <button onClick={()=>{try{dateJumpRef.current.showPicker();}catch(e){dateJumpRef.current&&dateJumpRef.current.click();}}} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,width:150,flexShrink:0,border:"none",background:"none",padding:"4px 0",cursor:"pointer"}}>
          <span style={{fontSize:14,fontWeight:700,color:"var(--text-primary)"}}>{MOIS_L[new Date(dateKey).getMonth()]} {new Date(dateKey).getFullYear()}</span>
          <span style={{fontSize:11,color:"var(--text-muted)"}}>▾</span>
        </button>
        <button onClick={()=>changerMoisNav(1)} aria-label="Mois suivant" style={NAV_ARROW_STYLE}>›</button>
        <button onClick={goToToday} style={{display:"flex",alignItems:"center",gap:6,border:"none",background:weekOffset===0?"#f1f5f9":"#E6F1FB",color:weekOffset===0?"#475569":"#0C447C",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:"clamp(12px,1.4vw,15px)",fontWeight:700}}>📅 Aujourd'hui</button>
      </div>
      <input ref={dateJumpRef} type="date" onChange={e=>{if(e.target.value)jumpToDate(e.target.value);}} style={{position:"absolute",width:0,height:0,opacity:0,pointerEvents:"none",border:"none"}}/>
      {/* Semaine précédente/suivante (19/08, Olivier -- sur ordi, sans écran
          tactile, aucun moyen de changer de semaine sans passer par le
          sélecteur de date natif "moche et pas pratique". Décale weekOffset
          d'une semaine en gardant le même jour de la semaine sélectionné
          (dayIdx inchangé), plutôt que de rejouer goToDay 7 fois.
          Masqués sur téléphone (19/08, suite immédiate -- "les boutons pour
          changer se semaines sont genant sur le tel") : le swipe tactile
          (goToDay via swipeDay, déjà en place) reste le moyen de navigation
          sur mobile, ces flèches redeviennent superflues et gênent — classe
          dédiée + display:none sous le même breakpoint mobile déjà utilisé
          ailleurs (theme.css), desktop inchangé. */}
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <button className="f2ppmp-week-arrow" onClick={()=>setWeekOffset(w=>w-1)} aria-label="Semaine précédente" style={NAV_ARROW_STYLE}>‹</button>
        <div style={{display:"flex",gap:4,flexWrap:"nowrap",overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:2}}>
          {["Lu","Ma","Me","Je","Ve","Sa","Di"].map((d,i)=>{const isToday=weekDates[i]===TODAY;return(
            <button key={d} onClick={()=>setDayIdx(i)} style={{border:isToday?"2px solid #378ADD":"1.5px solid var(--border)",borderRadius:10,padding:"5px 10px",flexShrink:0,cursor:"pointer",background:dayIdx===i?"#0C447C":isToday?"#E6F1FB":"var(--bg-card)",color:dayIdx===i?"#fff":isToday?"#0C447C":"var(--text-primary)",fontSize:11,fontWeight:dayIdx===i||isToday?700:600,lineHeight:1.4}}>
              {d}<br/><span style={{opacity:.85,fontSize:10}}>{weekDates[i]?.slice(8)}/{weekDates[i]?.slice(5,7)}</span>
            </button>);})}
        </div>
        <button className="f2ppmp-week-arrow" onClick={()=>setWeekOffset(w=>w+1)} aria-label="Semaine suivante" style={NAV_ARROW_STYLE}>›</button>
      </div>
    </div>

    {/* Sections */}
    <div onTouchStart={swipeDay.onTouchStart} onTouchEnd={swipeDay.onTouchEnd}>
    {sections.map(section=>(
      <div key={section.id} style={{border:`1.5px solid ${section.pc.border}`,borderRadius:14,overflow:"hidden",background:"#fff"}}>
        <div style={{background:section.pc.header,padding:"9px 18px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{color:"#fff",fontSize:14,fontWeight:800}}>{section.label}</span>
          {section.id!=="DIVERS"&&<span style={{background:"rgba(255,255,255,.2)",color:"#fff",borderRadius:20,padding:"1px 10px",fontSize:11}}>{EQ[section.equipe]?.heures||""}</span>}
        </div>
        {section.rows.map((row,ri)=>{
          const fam=row.famille?FAMILLES[row.famille]:null;
          const pc=section.pc;
          const pJ=POSTES_JOURNEE.find(x=>x.jsCode===row.jsCode);
          return(<div key={`${row.jsCode}-${ri}`} style={{display:"flex",alignItems:"stretch",borderBottom:ri<section.rows.length-1?`1px solid ${pc.border}`:"none",background:ri%2===0?pc.bg:"#fff",borderLeft:`4px solid ${fam?.accent||"transparent"}`}}>
            <div style={{width:210,flexShrink:0,padding:"9px 14px",borderRight:`1px solid ${pc.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                {!row.isJourneeSpeciale&&<span style={{fontFamily:"monospace",fontSize:10,fontWeight:800,color:"#fff",background:fam?.color||"#7c3aed",borderRadius:5,padding:"2px 7px"}}>{row.jsCode}</span>}
                {fam&&<span style={{fontSize:9,background:fam.accent,color:"#fff",borderRadius:10,padding:"1px 7px",fontWeight:800}}>{row.famille}</span>}
                {row.allowFormation&&<span style={{fontSize:9,background:"#bbf7d0",color:"#14532d",borderRadius:10,padding:"1px 6px",fontWeight:700}}>/F</span>}
                {(row.maxSlots||1)>1&&row.maxSlots<99&&<span style={{fontSize:9,background:"#dbeafe",color:"#1e40af",borderRadius:10,padding:"1px 5px",fontWeight:700}}>×{row.maxSlots}</span>}
                {isPrevisionnel&&row.agents.length>1&&<span style={{fontSize:12,background:"#fee2e2",color:"#dc2626",borderRadius:10,padding:"2px 8px",fontWeight:800}}>⚠ Conflit</span>}
              </div>
              <div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginTop:3}}>{pJ?`${pJ.jsCode} · ${pJ.label}`:row.poste.label}</div>
              {pJ?.subtitle&&<div style={{fontSize:10,color:"#1e293b",fontWeight:600,fontStyle:"italic"}}>{pJ.subtitle}</div>}
              {row.isJournee&&pJ&&<div style={{fontSize:9,color:"#94a3b8",marginTop:1}}>{pJ.horaires}</div>}
            </div>
            <div style={{flex:1,padding:"7px 12px",display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",minHeight:46}}>
              {row.isDispo
                ? row.agents.map(ag=>{
                    // fix (23/08, demande d'Olivier : "le bouton [...] doit aussi avoir
                    // le bouton ajustement du poste complet") : la carte "Disponibles"
                    // n'avait jusque-la aucun bouton 🔄 (echange/erreur CPS/message) --
                    // ajoute ici, meme comportement que sur une carte de poste normale.
                    // famille = celle REELLE de l'agent (ag.famille, jamais row.famille
                    // qui vaut toujours null pour cette ligne) -- meme categorie de bug
                    // deja rencontree et corrigee le 18/08 sur les lignes "FOR" (famille
                    // null rejetee par la validation backend, "famille et type sont
                    // requis").
                    const aleaDispo=findAlea(cpsAleas,row.jsCode,dateKey,ag.famille);
                    return(<div key={ag.id} style={{display:"flex",flexDirection:"column",gap:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,background:"#ecfdf5",border:"1.5px solid #6ee7b7",borderRadius:aleaDispo?.type==="message"?"9px 9px 0 0":9,padding:"4px 9px"}}>
                        <Av initials={ag.initials} size={22} famille={ag.famille}/>
                        <div style={{fontSize:11,fontWeight:700,color:"#065f46"}}>{ag.prenom} {ag.nom}</div>
                        <button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:ag.famille,nomOfficiel:`${ag.prenom} ${ag.nom}`})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>🔄</button>
                      </div>
                      {aleaDispo?.type==="message"&&<div style={{display:"flex",alignItems:"flex-start",gap:6,background:"#eff6ff",border:"1.5px solid #93c5fd",borderTop:"none",borderRadius:"0 0 9px 9px",padding:"4px 9px"}}>
                        <span style={{fontSize:12}}>📢</span>
                        <div style={{fontSize:10,color:"#1d4ed8",flex:1,lineHeight:1.4}}>{aleaDispo.motif}</div>
                        <button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:ag.famille,nomOfficiel:`${ag.prenom} ${ag.nom}`,editAlea:aleaDispo})} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#1d4ed8",opacity:.6,flexShrink:0}}>✎</button>
                        <button onClick={()=>annulerAlea(aleaDispo.id,setCpsAleas)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#1d4ed8",opacity:.6,flexShrink:0}}>✕</button>
                      </div>}
                    </div>);
                  })
                : Array.from({length:row.maxSlots<99?row.maxSlots:Math.max(row.agents.length,1)},(_,si)=>{
                    const ag=row.agents[si];const en=ag?schedule[`${ag.id}-${dateKey}`]:null;
                    if(search&&ag&&!`${ag.prenom} ${ag.nom}`.toLowerCase().includes(search.toLowerCase()))return null;
                    const isForm=en?.equipe==="JF";const isMe=ag&&currentAgent?.id===ag.id;
                    // row.famille||ag?.famille (23/08) : les postes generiques toutes
                    // familles (DISPO/RFT SAM/JEQ...) ont row.famille=null -- sans ce
                    // repli sur la vraie famille de l'agent, findAlea/setAleaTarget
                    // envoyaient famille:null au backend (rejete, "famille et type sont
                    // requis") des qu'un agent cliquait sur 🔄 pour ce genre de poste,
                    // meme classe de bug deja corrigee pour "FOR" (18/08) et "Disponibles"
                    // (23/08, branche isDispo) -- ici, corrige a la source pour toutes les
                    // lignes qui passent par ce rendu par defaut (couvre aussi RFT SAM).
                    const alea=findAlea(cpsAleas,row.jsCode,dateKey,row.famille||ag?.famille);
                    if(ag&&alea&&alea.type==="non_tenu")return(<div key={si} style={{display:"flex",flexDirection:"column",gap:2,background:"#fff7ed",border:"1.5px solid #fb923c",borderRadius:9,padding:"4px 9px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:16}}>⚠️</span>
                        <div style={{fontSize:11,fontWeight:700,color:"#c2410c"}}>Poste non tenu</div>
                        <button onClick={()=>annulerAlea(alea.id,setCpsAleas)} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:"#c2410c",opacity:.6,marginLeft:"auto"}}>✕</button>
                      </div>
                      {alea.motif&&<div style={{fontSize:10,color:"#9a3412",paddingLeft:22,fontStyle:"italic"}}>{alea.motif}</div>}
                    </div>);
                    if(ag&&alea&&(alea.type==="echange"||alea.type==="erreur_cps")){
                      const nomsRemplacants=(alea.agents_concernes||[]).map(cpId=>{
                        const a=agents.find(x=>x.id===cpId);
                        return a?`${a.prenom} ${a.nom}`:cpId;
                      }).join(", ");
                      return(<div key={si} style={{display:"flex",flexDirection:"column",gap:3,background:"#fefce8",border:"1.5px solid #fde047",borderRadius:9,padding:"5px 9px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <Av initials={ag.initials} size={18} famille={ag.famille}/>
                          <div style={{fontSize:11,fontWeight:600,color:"#94a3b8",textDecoration:"line-through"}}>{ag.prenom} {ag.nom}</div>
                        </div>
                        <div style={{fontSize:11,fontWeight:700,color:"#854d0e",paddingLeft:24}}>{nomsRemplacants||"?"}</div>
                        {alea.motif&&<div style={{fontSize:10,color:"#a16207",paddingLeft:24,fontStyle:"italic"}}>{alea.motif}</div>}
                        <div style={{display:"flex",alignItems:"center",gap:6,paddingLeft:24}}><div style={{fontSize:9,color:"#a16207"}}>{alea.type==="echange"?"🔄 Échange/Combiné":"⚠️ Erreur CPS"}</div><button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:row.famille||ag.famille,nomOfficiel:`${ag.prenom} ${ag.nom}`,editAlea:alea})} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#a16207",opacity:.6,marginLeft:"auto"}}>✎</button><button onClick={()=>annulerAlea(alea.id,setCpsAleas)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#a16207",opacity:.6}}>✕</button></div>
                      </div>);
                    }
                    if(ag&&isPrevisionnel){
                      const sig=findPrevisionnelSignalement(previsionnelSignalements,ag.id,dateKey);
                      if(sig){
                        const nomsRemplacants=(sig.agents_remplacants||[]).map(r=>`${r.prenom} ${r.nom}`).join(", ");
                        return(<div key={si} style={{display:"flex",flexDirection:"column",gap:3,background:"#f5f3ff",border:"1.5px solid #c4b5fd",borderRadius:9,padding:"5px 9px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <Av initials={ag.initials} size={18} famille={ag.famille}/>
                            <div style={{fontSize:11,fontWeight:600,color:"#94a3b8",textDecoration:"line-through"}}>{ag.prenom} {ag.nom}</div>
                          </div>
                          <div style={{fontSize:11,fontWeight:700,color:"#6d28d9",paddingLeft:24}}>{nomsRemplacants||"?"}</div>
                          <div style={{display:"flex",alignItems:"center",gap:6,paddingLeft:24}}><div style={{fontSize:9,color:"#7c3aed"}}>📅 Signalement</div><button onClick={()=>annulerPrevisionnelSignalement(sig.id,setPrevisionnelSignalements)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#7c3aed",opacity:.6,marginLeft:"auto"}}>✕</button></div>
                        </div>);
                      }
                      return(<div key={si} style={{display:"flex",alignItems:"center",gap:6,background:isMe?(fam?.highlightBg||"#c7d2fe"):(fam?.light||"rgba(255,255,255,.8)"),border:`${isMe?2.5:1.5}px solid ${isMe?(fam?.accent||"#6366f1"):"rgba(0,0,0,.07)"}`,borderRadius:9,padding:"4px 9px",boxShadow:isMe?`0 0 0 2px ${fam?.accent||"#6366f1"}22`:"none"}}>
                        <Av initials={ag.initials} size={22} famille={ag.famille}/>
                        <div>
                          <div style={{fontSize:11,fontWeight:700,color:row.agents.length>1?"#dc2626":"#1e293b"}}>{ag.prenom} {ag.nom}</div>
                          <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>{ag.grade}</div>
                          {row.isJourneeSpeciale&&findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey)&&<div style={{fontSize:9,color:"#7c3aed",fontStyle:"italic"}}>{findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey).message}</div>}
                        </div>
                        {row.isJourneeSpeciale?
                        <button onClick={()=>setJourneeSpecialeNoteTarget({agentId:ag.id,agentNom:`${ag.prenom} ${ag.nom}`,currentMessage:findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey)?.message||""})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>📝</button>
                        :
                        <button onClick={()=>setPrevisionnelTarget({agentId:ag.id,nomTitulaire:`${ag.prenom} ${ag.nom}`})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>🔄</button>}
                      </div>);
                    }
                    if(ag)return(<div key={si} style={{display:"flex",flexDirection:"column",gap:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,background:isForm?"#f0fdf4":isMe?(fam?.highlightBg||"#c7d2fe"):(fam?.light||"rgba(255,255,255,.8)"),border:`${isMe&&!isForm?2.5:1.5}px solid ${isForm?"#22c55e":isMe?(fam?.accent||"#6366f1"):"rgba(0,0,0,.07)"}`,borderRadius:alea?.type==="message"?"9px 9px 0 0":9,padding:"4px 9px",boxShadow:isMe&&!isForm?`0 0 0 2px ${fam?.accent||"#6366f1"}22`:"none"}}>
                        <Av initials={ag.initials} size={22} famille={ag.famille}/>
                        <div>
                          <div style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{ag.prenom} {ag.nom}</div>
                          <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>{ag.grade}</div>
                            {row.isJourneeSpeciale&&findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey)&&<div style={{fontSize:9,color:"#7c3aed",fontStyle:"italic"}}>{findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey).message}</div>}
                        </div>
                        {row.isJourneeSpeciale?
                        <button onClick={()=>setJourneeSpecialeNoteTarget({agentId:ag.id,agentNom:`${ag.prenom} ${ag.nom}`,currentMessage:findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey)?.message||""})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>📝</button>
                        :
                        <button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:row.famille||ag.famille,nomOfficiel:`${ag.prenom} ${ag.nom}`})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>🔄</button>}
                      </div>
                      {alea?.type==="message"&&<div style={{display:"flex",alignItems:"flex-start",gap:6,background:"#eff6ff",border:"1.5px solid #93c5fd",borderTop:"none",borderRadius:"0 0 9px 9px",padding:"4px 9px"}}>
                        <span style={{fontSize:12}}>📢</span>
                        <div style={{fontSize:10,color:"#1d4ed8",flex:1,lineHeight:1.4}}>{alea.motif}</div>
                        <button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:row.famille||ag.famille,nomOfficiel:`${ag.prenom} ${ag.nom}`,editAlea:alea})} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#1d4ed8",opacity:.6,flexShrink:0}}>✎</button>
                        <button onClick={()=>annulerAlea(alea.id,setCpsAleas)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#1d4ed8",opacity:.6,flexShrink:0}}>✕</button>
                      </div>}
                    </div>);
                    if(row.maxSlots<99){
                      const aleaVacant=findAlea(cpsAleas,row.jsCode,dateKey,row.famille);
                      if(aleaVacant&&aleaVacant.type==="non_tenu")return(<div key={si} style={{display:"flex",flexDirection:"column",gap:2,background:"#fff7ed",border:"1.5px solid #fb923c",borderRadius:9,padding:"4px 9px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:16}}>⚠️</span>
                          <div style={{fontSize:11,fontWeight:700,color:"#c2410c"}}>Poste non tenu</div>
                          <button onClick={()=>annulerAlea(aleaVacant.id,setCpsAleas)} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:"#c2410c",opacity:.6,marginLeft:"auto"}}>✕</button>
                        </div>
                        {aleaVacant.motif&&<div style={{fontSize:10,color:"#9a3412",paddingLeft:22,fontStyle:"italic"}}>{aleaVacant.motif}</div>}
                      </div>);
                      if(aleaVacant&&(aleaVacant.type==="echange"||aleaVacant.type==="erreur_cps")){
                        const nomsRemplacants=(aleaVacant.agents_concernes||[]).map(cpId=>{
                          const a=agents.find(x=>x.id===cpId);
                          return a?`${a.prenom} ${a.nom}`:cpId;
                        }).join(", ");
                        return(<div key={si} style={{display:"flex",flexDirection:"column",gap:3,background:"#fefce8",border:"1.5px solid #fde047",borderRadius:9,padding:"5px 9px"}}>
                          <div style={{fontSize:10,fontWeight:600,color:"#94a3b8",fontStyle:"italic"}}>Vacant (officiel)</div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <div style={{fontSize:11,fontWeight:700,color:"#854d0e"}}>{nomsRemplacants||"?"}</div>
                            <button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:row.famille,nomOfficiel:"Poste vacant",editAlea:aleaVacant})} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#a16207",opacity:.6,marginLeft:"auto"}}>✎</button>
                            <button onClick={()=>annulerAlea(aleaVacant.id,setCpsAleas)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#a16207",opacity:.6}}>✕</button>
                          </div>
                          {aleaVacant.motif&&<div style={{fontSize:10,color:"#a16207",fontStyle:"italic"}}>{aleaVacant.motif}</div>}
                        </div>);
                      }
                      if(aleaVacant&&aleaVacant.type==="message")return(<div key={si} style={{display:"flex",flexDirection:"column",gap:2,background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:9,padding:"4px 9px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:14}}>📢</span>
                          <div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>Vacant</div>
                          <button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:row.famille,nomOfficiel:"Poste vacant",editAlea:aleaVacant})} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:"#1d4ed8",opacity:.6,marginLeft:"auto"}}>✎</button>
                          <button onClick={()=>annulerAlea(aleaVacant.id,setCpsAleas)} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:"#1d4ed8",opacity:.6}}>✕</button>
                        </div>
                        <div style={{fontSize:10,color:"#1d4ed8",paddingLeft:20,lineHeight:1.4}}>{aleaVacant.motif}</div>
                      </div>);
                      const nonTenu=estNonTenu(row.jsCode,dateKey);
                      if(nonTenu.nonTenu)return(<div key={si} style={{display:"flex",alignItems:"center",gap:6,background:"#f1f5f9",border:"1.5px solid #cbd5e1",borderRadius:9,padding:"4px 9px"}}>
                        <div style={{width:22,height:22,borderRadius:"50%",background:"#cbd5e1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>{nonTenu.motif==="ferie"?"🎉":"📅"}</div>
                        <div style={{fontSize:10,color:"#475569",fontWeight:600}}>{nonTenu.motif==="ferie"?"Non tenu (férié)":"Non tenu (week-end)"}</div>
                        {!isPrevisionnel&&<button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:row.famille,nomOfficiel:"Poste vacant"})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>🔄</button>}
                      </div>);
                      return(<div key={si} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,.5)",border:"1.5px dashed rgba(0,0,0,.08)",borderRadius:9,padding:"4px 9px"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:"#e2e8f0"}}/>
                      <div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic",opacity:.4}}>Vacant</div>
                      {!isPrevisionnel&&<button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:row.famille,nomOfficiel:"Poste vacant"})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>🔄</button>}
                    </div>);
                    }
                    return null;
                  })
              }
            </div>
          </div>);
        })}
      </div>
    ))}

    </div>

    {/* Non renseignés */}
    <details style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12}}>
      <summary style={{padding:"10px 16px",cursor:"pointer",fontSize:13,fontWeight:700,color:"#64748b",display:"flex",alignItems:"center",gap:8,listStyle:"none"}}>
        ⚠️ Non renseignés
        <span style={{background:"#fee2e2",color:"#991b1b",borderRadius:20,padding:"1px 9px",fontSize:11}}>
          {agents.filter(a=>(filterF==="ALL"||a.famille===filterF)&&!schedule[`${a.id}-${dateKey}`]).length}
        </span>
      </summary>
      <div style={{padding:"8px 16px 12px",display:"flex",flexWrap:"wrap",gap:7}}>
        {agents.filter(a=>(filterF==="ALL"||a.famille===filterF)&&!schedule[`${a.id}-${dateKey}`]&&`${a.prenom} ${a.nom}`.toLowerCase().includes(search.toLowerCase())).map(ag=>(
          <div key={ag.id} style={{display:"flex",alignItems:"center",gap:7,background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"5px 10px"}}>
            <Av initials={ag.initials} size={22} famille={ag.famille}/>
            <div><div style={{fontSize:11,fontWeight:600,color:"#475569"}}>{ag.prenom} {ag.nom}</div><div style={{fontSize:9,color:"#94a3b8"}}>{ag.poste}</div></div>
            <button onClick={()=>onImport(ag)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,opacity:.5}}>✏️</button>
            {isAdmin&&<button onClick={()=>onRemoveAgent(ag)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#ef4444",opacity:.5}}>🗑</button>}
          </div>
        ))}
      </div>
    </details>
    {!isPrevisionnel&&<div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#475569",lineHeight:1.6,maxWidth:620}}>
      La feuille de présence officielle ne peut pas être modifiée ici.<br/>Seuls les signalements 🔄 (échange de poste, erreur CPS) viennent s’ajouter par-dessus, à titre indicatif.
    </div>}
    {isPrevisionnel&&<div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#475569",lineHeight:1.6,maxWidth:620}}>
      Ici, chaque agent partage volontairement son planning personnel (à activer dans Mon Profil) pour aider à s’organiser collectivement.<br/>Seules les journées de travail sont partagées — le reste (congés, absences...) ne l’est pas.<br/>Ces informations restent indicatives et ne remplacent jamais la feuille de présence officielle — en cas d’écart, rapproche-toi de l’encadrement.
    </div>}
    {aleaTarget&&<AleaPopup agents={agents} jsCode={aleaTarget.jsCode} dateKey={dateKey} famille={aleaTarget.famille} nomOfficiel={aleaTarget.nomOfficiel} editAlea={aleaTarget.editAlea} currentAgent={currentAgent} onClose={()=>setAleaTarget(null)} onSaved={()=>{api.cpsAleas.getAll().then(rows=>setCpsAleas(rows||[]));}}/>}
    {previsionnelTarget&&<PrevisionnelSignalementPopup agents={agents} agentTitulaireId={previsionnelTarget.agentId} dateKey={dateKey} nomTitulaire={previsionnelTarget.nomTitulaire} currentAgent={currentAgent} onClose={()=>setPrevisionnelTarget(null)} onSaved={()=>{api.previsionnelSignalements.getAll().then(rows=>setPrevisionnelSignalements(rows||[]));}}/>}
    {journeeSpecialeNoteTarget&&<JourneeSpecialeNotePopup agentId={journeeSpecialeNoteTarget.agentId} agentNom={journeeSpecialeNoteTarget.agentNom} dateKey={dateKey} currentMessage={journeeSpecialeNoteTarget.currentMessage} onClose={()=>setJourneeSpecialeNoteTarget(null)} onSaved={()=>{api.journeeSpecialeNotes.getAll().then(rows=>setJourneeSpecialeNotes(rows||[]));}}/>}
  </div>);
}

// ─── COMPTEURS AGENDA PERSO ───────────────────────────────────────────────────
// ─── HELPERS CALENDRIER ──────────────────────────────────────────────────────

function getMonthDates(year,month){
  // month: 0-based. Retourne tous les jours du mois
  const days=[];
  const total=new Date(year,month+1,0).getDate();
  for(let d=1;d<=total;d++) days.push(`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
  return days;
}
function firstDayOfMonth(year,month){
  // 0=dim,1=lun... on veut lundi=0
  const d=new Date(year,month,1).getDay();
  return d===0?6:d-1;
}

// ─── VUE PERSONNELLE
// ─── VUE PERSONNELLE ──────────────────────────────────────────────────────────

// ─── COULEURS PERSONNALISÉES PAR AGENT ───────────────────────────────────────
// Couleurs par défaut
// DEFAULT_COLORS : couleurs par défaut de l'agenda PERSONNEL uniquement
// La vue globale utilise toujours les couleurs de EQUIPES (non modifiables)
// Mise à jour le 17/07 (demandé par Olivier, à la place de l'ancienne palette
// trop sombre) : reprend telles quelles ses propres couleurs personnalisées
// (compte 6810186B) pour les codes qu'il avait déjà réglés — M/AM/N/J, CA,
// RU, RQ, FOR, RPP, NOTE, fêtes (voir plus bas, code séparé) — et complète
// les codes qu'il n'avait pas touchés avec des teintes vives et distinctes
// entre elles (jamais de noir/gris très foncé, pour que le sélecteur de
// couleur natif du navigateur s'ouvre sur une zone vive du dégradé plutôt
// que dans un coin sombre).
export const DEFAULT_COLORS = {
  M:"#ff0000", AM:"#ff0000", N:"#ff0000", J:"#ff0000", JF:"#ff82e8",
  // RQ recoloré le 18/08 (Olivier, audit UI : "RU et RQ partagent exactement
  // la même couleur" — #ffde08/#ffe100 étaient quasi indiscernables sur une
  // case du planning) — même famille de teinte que le nouveau DETAIL_CONFIG.RQ
  // (fuchsia), en version vive pour rester cohérent avec le reste de cette
  // palette "planning" (couleurs saturées, contrairement aux teintes plus
  // sourdes des cartes compteurs/dashboards).
  RP:"#16a34a", RPP:"#67bf15", RU:"#ffde08", RQ:"#ff00aa", TC:"#7c3aed", TY:"#a855f7", RN:"#4338ca",
  NU:"#64748b", CA:"#f5e900", CP:"#f5e900",
  MA:"#dc2626", ABS:"#b91c1c", VT:"#f59e0b", VM:"#6b7280",
  FOR:"#0dcbff", DISPO:"#059669", NOTE:"#0080ff", GREVE:"#1d51a5",
};

// Texte blanc sur fonds sombres, noir sur fonds clairs
function getTextColor(bg){
  const hex=bg.replace('#','');
  const r=parseInt(hex.substr(0,2),16);
  const g=parseInt(hex.substr(2,2),16);
  const b=parseInt(hex.substr(4,2),16);
  const luminance=(0.299*r+0.587*g+0.114*b)/255;
  return luminance>0.5?'#1e293b':'#ffffff';
}

// Panneau de personnalisation des couleurs
function ColorCustomizer({agentColors, setAgentColors, onClose}){

  // Labels lisibles pour chaque code
  const CODE_LABELS = {
    M:"Matinée", AM:"Soirée", N:"Nuit", J:"Journée", JF:"Fête (travaillée)",
    RP:"RP", RPP:"RPP", RU:"RU", RQ:"RQ", TC:"TC", TY:"TY", RN:"RN",
    NU:"NU", CA:"Congés", CP:"Congés", MA:"Maladie",
    ABS:"Absent", VT:"VT", VM:"Visite méd.", FOR:"Formation", DISPO:"Dispo",
    FETE:"Fêtes légales", NOTE:"Note perso", GREVE:"Grève",
  };

  // Tous les groupes complets — incluant JF, TY, CP, FETE
  const GROUPES=[
    {
      id:"travail",
      label:"🟥 Travail",
      codes:["M","AM","N","J","JF"],
      syncAll:true, // bouton "même couleur pour tous"
      note:"M = Matinée · AM = Soirée · N = Nuit · J = Journée · JF = Fête travaillée",
    },
    {
      id:"repos",
      label:"🟢 Repos",
      codes:["RP","RPP","RU","RQ","TC","TY","RN"],
      note:"RP = Repos Périodique · RPP = variante RP (palette dissociée) · RU/RQ = Repos Utilisation · TC/TY = Temps Compensé · RN = Repos Nuit",
    },
    {
      id:"nu",
      label:"⬜ NU (Non Utilisé)",
      codes:["NU"],
      note:"NU = Journée non utilisée",
    },
    {
      id:"dispo",
      label:"🟩 DISPO (Disponible)",
      codes:["DISPO"],
      note:"DISPO = Agent disponible",
    },
    {
      id:"conges",
      label:"🏖️ Congés (CA / CP)",
      codes:["CA"],
      note:"CA = Congés (le code CP est un alias interne)",
    },
    {
      id:"absences",
      label:"🤒 Absences / Santé",
      codes:["MA","ABS","VT","VM"],
      note:"MA = Maladie · ABS = Absent · VT = Temps Partiel · VM = Visite médicale",
    },
    {
      id:"greve",
      label:"✊ Grève",
      codes:["GREVE"],
      note:"Couleur appliquée aux codes DA (01h00 grève), DB (1/2 journée grève) et DC (journée grève) dans l'agenda",
    },
    {
      id:"formation",
      label:"📚 Formation",
      codes:["FOR"],
      note:"",
    },
    {
      id:"fetes",
      label:"🩷 Fêtes légales",
      codes:["FETE"],
      note:"Couleur appliquée à tous les codes F1, F2… dans l'agenda",
    },
    {
      id:"note",
      label:"📝 Note perso",
      codes:["NOTE"],
      note:"Couleur du badge/texte affiché pour ta note personnelle dans le planning",
    },
  ];

  // Palette élargie — boutons plus grands pour mobile
  const PALETTES=[
    "#ef4444","#dc2626","#c0392b","#f97316","#ea580c","#d97706",
    "#eab308","#84cc16","#22c55e","#16a34a","#14b8a6","#06b6d4",
    "#3b82f6","#1d4ed8","#6366f1","#8b5cf6","#7c3aed","#a855f7",
    "#ec4899","#db2777","#f43f5e","#64748b","#334155","#1e293b",
    "#000000","#ffffff","#f8fafc","#e2e8f0","#fef9c3","#fce7f3",
  ];

  // Lire/écrire une couleur (FETE = clé spéciale pour toutes les fêtes)
  const getColor = (code) => {
    if(code==="FETE") return (agentColors||{})["F1"]||"#ff82e8";
    return (agentColors||{})[code]||DEFAULT_COLORS[code]||"#f8fafc";
  };
  const setColor = (code, color) => {
    if(code==="FETE"){
      // Appliquer à tous les codes fête F1, F2, FV... + JF
      const feteKeys = [...Object.keys(CODES_FETES), "JF"];
      setAgentColors(prev=>({...prev,...Object.fromEntries(feteKeys.map(k=>[k,color]))}));
    } else {
      setAgentColors(prev=>({...prev,[code]:color}));
    }
  };
  const syncAll = (codes) => {
    const ref = getColor(codes[0]);
    setAgentColors(prev=>({...prev,...Object.fromEntries(codes.map(k=>[k,ref]))}));
  };

  const [activeGroup, setActiveGroup] = useState("travail");
  const groupe = GROUPES.find(g=>g.id===activeGroup)||GROUPES[0];
  // Réinitialisation déplacée dans l'en-tête fixe (17/07, demandé par Olivier —
  // le bouton était en bas d'une liste longue et défilante, plus exposé à un tap
  // accidentel en parcourant les couleurs) + confirmation obligatoire avant
  // d'agir, même principe que la confirmation déjà en place ailleurs (Fêtes).
  const [resetConfirm, setResetConfirm] = useState(false);

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.75)",zIndex:700,
      display:"flex",alignItems:"flex-end",justifyContent:"center",
      backdropFilter:"blur(4px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>

      {/* Panneau type bottom-sheet — pleine largeur, hauteur adaptative */}
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:600,
        maxHeight:"92vh",display:"flex",flexDirection:"column",
        boxShadow:"0 -8px 40px rgba(0,0,0,.25)"}}>

        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#1e293b,#334155)",
          padding:"16px 20px",display:"flex",alignItems:"center",gap:10,
          borderRadius:"20px 20px 0 0",flexShrink:0}}>
          <span style={{fontSize:20}}>🎨</span>
          <div style={{flex:1,color:"#fff",fontSize:14,fontWeight:800}}>Mes couleurs personnalisées</div>
          {/* Couleur distincte (ambre) + marge supplémentaire par rapport au ✕ (17/07,
              question posée par Olivier sur le risque de tap accidentel — le bouton est
              déjà protégé par une confirmation obligatoire, mais on l'éloigne et on le
              différencie visuellement en plus, pour qu'une hésitation au doigt reste
              improbable). */}
          <button onClick={()=>setResetConfirm(true)} title="Réinitialiser toutes les couleurs par défaut"
            style={{background:"rgba(251,191,36,.25)",border:"1px solid rgba(251,191,36,.4)",
            color:"#fef3c7",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:16,
            display:"flex",alignItems:"center",justifyContent:"center",marginRight:8}}>↺</button>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",
            color:"#fff",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:18,
            display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        {/* Confirmation de réinitialisation — n'agit qu'après un second tap explicite */}
        {resetConfirm&&<div style={{background:"#fef2f2",borderBottom:"1.5px solid #fecaca",
          padding:"10px 16px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <span style={{flex:1,fontSize:12,color:"#991b1b",fontWeight:600}}>
            ⚠️ Remettre toutes tes couleurs à leur valeur par défaut ?
          </span>
          <button onClick={()=>{setAgentColors({});setResetConfirm(false);}}
            style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:8,
            padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>
            Oui, réinitialiser
          </button>
          <button onClick={()=>setResetConfirm(false)}
            style={{background:"#fff",color:"#64748b",border:"1.5px solid #e2e8f0",borderRadius:8,
            padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>
            Annuler
          </button>
        </div>}

        {/* Sélecteur de groupe — select natif universel */}
        <div style={{padding:"10px 16px",borderBottom:"1.5px solid #f1f5f9",
          flexShrink:0,background:"#f8fafc"}}>
          <select value={activeGroup} onChange={e=>setActiveGroup(e.target.value)}
            style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:10,
              padding:"10px 14px",fontSize:13,fontWeight:700,color:"#1e293b",
              background:"#fff",cursor:"pointer",outline:"none",
              WebkitAppearance:"none",appearance:"none",
              paddingRight:36}}>
            {GROUPES.map(g=>(
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </div>

        {/* Contenu scrollable */}
        <div style={{overflowY:"auto",flex:1,padding:"16px 16px 32px",
          display:"flex",flexDirection:"column",gap:14,WebkitOverflowScrolling:"touch"}}>

          {/* Note explicative */}
          {groupe.note&&<div style={{background:"#f0f9ff",borderRadius:10,padding:"8px 12px",
            fontSize:11,color:"#0369a1",lineHeight:1.5}}>
            ℹ️ {groupe.note}
          </div>}

          {/* Bouton sync tous */}
          {groupe.syncAll&&groupe.codes.length>1&&<button
            onClick={()=>syncAll(groupe.codes)}
            style={{background:"#1e293b",color:"#fff",border:"none",borderRadius:10,
              padding:"10px 0",cursor:"pointer",fontSize:12,fontWeight:700,width:"100%"}}>
            🔄 Appliquer la même couleur à tous ({groupe.codes.join(", ")})
          </button>}

          {/* Ligne par code */}
          {groupe.codes.map(code=>{
            const couleur = getColor(code);
            const tc = getTextColor(couleur);
            return(
              <div key={code} style={{border:"1.5px solid #e2e8f0",borderRadius:14,overflow:"hidden"}}>
                {/* Aperçu + label */}
                <div style={{background:couleur,padding:"12px 16px",
                  display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:800,color:tc}}>{CODE_LABELS[code]||code}</div>
                    <div style={{fontSize:10,opacity:.7,color:tc,fontFamily:"monospace"}}>{code} · {couleur}</div>
                  </div>
                  {/* Input color natif — bien visible et cliquable */}
                  <label style={{position:"relative",cursor:"pointer",flexShrink:0}}>
                    <div style={{width:44,height:44,borderRadius:10,
                      background:"rgba(255,255,255,.25)",
                      border:"2px solid rgba(255,255,255,.5)",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:20}}>🎨</div>
                    <input type="color" value={couleur}
                      onChange={e=>setColor(code,e.target.value)}
                      style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",
                        width:"100%",height:"100%"}}/>
                  </label>
                </div>

                {/* Palette de couleurs — boutons 36×36 pour mobile */}
                <div style={{padding:"10px 12px",background:"#fafafa"}}>
                  <div style={{display:"grid",
                    gridTemplateColumns:"repeat(auto-fill,minmax(36px,1fr))",gap:5}}>
                    {PALETTES.map(c=>{
                      const isSel = couleur===c;
                      return(
                        <button key={c} onClick={()=>setColor(code,c)}
                          style={{width:"100%",aspectRatio:"1",borderRadius:8,background:c,
                            cursor:"pointer",border:isSel?"2.5px solid #1e293b":"1.5px solid rgba(0,0,0,.1)",
                            boxShadow:isSel?"0 0 0 2px #fff,0 0 0 4px #1e293b":"none",
                            minWidth:36,minHeight:36}}>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ─── REGISTRE jsCode → poste (pour le tableau de bord journées travaillées) ──
// Construit une fois : associe chaque jsCode connu (3x8 et journée) à son
// poste, sa famille (PRCI/PAR) et sa vacation (M/AM/N pour le 3x8, J pour
// les postes journée — une seule vacation, pas de sous-détail).
const POSTE_REGISTRY = (() => {
  const reg = {};
  [
    ...POSTES_PRCI_3x8.map(p=>({...p,famille:"PRCI"})),
    ...POSTES_PAR_3x8.map(p=>({...p,famille:"PAR"})),
  ].forEach(p=>{
    if(p.M)  reg[p.M]  = {code:p.code, label:p.label, famille:p.famille, shift:"M"};
    if(p.AM) reg[p.AM] = {code:p.code, label:p.label, famille:p.famille, shift:"AM"};
    if(p.N)  reg[p.N]  = {code:p.code, label:p.label, famille:p.famille, shift:"N"};
  });
  POSTES_JOURNEE.forEach(p=>{
    reg[p.jsCode] = {code:p.jsCode, label:p.label, famille:p.famille, shift:"J"};
  });
  // AY (19/08) : enregistré séparément, jamais via POSTES_JOURNEE (voir
  // commentaire sur getPosteLabelFromCode) -- c'est ce qui permet à
  // computeDashboardTravail (perso uniquement) de lui donner sa propre
  // section "AY - Absence" avec les dates, sans jamais risquer qu'il
  // apparaisse comme rangée dans GlobalView (CPS Officiel/Prévisionnel).
  reg["AY"] = {code:"AY", label:"AY - Absence", famille:"PRCI", shift:"J"};
  // Journée équipe (21/08, demandé par Olivier, ajoutée juste avant AY dans
  // le picker) : même traitement que AY -- jamais via POSTES_JOURNEE, sa
  // propre section dans "Jours travaillés", famille recalculée à la volée
  // (voir traiter() plus bas).
  reg["JEQ"] = {code:"JEQ", label:"Journée équipe", famille:"PRCI", shift:"J"};
  // RFT SAM (23/08, demandé par Olivier) : même principe qu'AY/JEQ --
  // enregistré directement ici plutôt que dans POSTES_PAR_3x8 (qui alimente
  // aussi les fiches UO de l'Annuaire et le sélecteur admin, hors de propos
  // pour un poste occasionnel) -- lui donne sa propre section dans "Jours
  // travaillés" avec les dates, sans effet de bord ailleurs. Toujours PAR
  // (poste "Aide AC PAR"-like, jamais reclassé dynamiquement contrairement à
  // AY/CAF/VM/JEQ/DISPO qui sont génériques toutes familles).
  reg["RFT SAM"] = {code:"RFT SAM", label:"RFT SAM", famille:"PAR", shift:"AM"};
  return reg;
})();

// Calcule le détail des journées travaillées par poste/vacation pour une
// année donnée, à partir du planning perso réel — jamais recalculé si les
// habilitations changent ensuite : uniquement basé sur ce qui a été saisi
// jour par jour dans le passé (même principe que les compteurs existants).
// Même définition de "jour travaillé" que DashboardCompteurs.computed (M/AM/N/J,
// pas JF qui est une fête) et même garde "nuit seule" (equipe=equipe2="N").
// FOR (Formation) compte aussi comme jour travaillé depuis le 17/07 (demandé
// par Olivier) — tombe naturellement dans "sans poste" (pas de jsCode associé
// à une formation), et alimente sa propre case dans parShiftGlobal.
function computeDashboardTravail(agent, schedule, year){
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const postes = {};
  // sansPosteVrai (21/08, Olivier : "ma journee de formation du 25 mars reste
  // en non aaffecté. pk ?") -- jusqu'au 21/08 une Formation était comptée
  // DEUX fois : dans sa propre carte "postes.FOR" ET dans "Non affecté" (pour
  // que la répartition PRCI/PAR/Non affecté fasse 100%), ce qui la faisait
  // apparaître à tort comme "non affectée" alors qu'elle est bien identifiée.
  // Formation a désormais sa PROPRE catégorie dans la répartition (4 tuiles :
  // PRCI/PAR/Formation/Non affecté) -- "Non affecté" ne représente plus QUE
  // les jours réellement sans aucun poste précisé, jamais une Formation.
  const sansPosteVrai = { total:0, lastDate:null, dates:[] };
  let totalTravail = 0;
  // Comptage global M/AM/N/J + FOR, tous postes confondus (+ jours sans poste
  // précisé) — distinct du détail par poste ci-dessous, jamais retiré.
  const parShiftGlobal = { M:0, AM:0, N:0, J:0, FOR:0 };

  const traiter = (eq, jsCode, dk) => {
    if(!eq) return;
    if(CODES_FETES[eq] || eq==="JF") return; // fête, pas travail
    if(!["M","AM","N","J","FOR"].includes(eq)) return; // pas une journée de travail
    totalTravail++;
    parShiftGlobal[eq]++;
    // Formation (17/07, demandé par Olivier) : garde sa propre ligne dans
    // "postes" (total + dernière date, comme un vrai poste) -- depuis le
    // 21/08, sa propre catégorie dans la répartition (plus dans "Non
    // affecté", voir commentaire sur sansPosteVrai ci-dessus), avec sa propre
    // liste de dates (postes.FOR.dates) comme "Non affecté".
    if(eq==="FOR"){
      if(!postes.FOR) postes.FOR = { code:"FOR", label:"Formation", famille:"FOR", total:0, lastDate:null, parShift:{}, dates:[] };
      postes.FOR.total++;
      postes.FOR.dates.push(dk);
      if(!postes.FOR.lastDate || dk > postes.FOR.lastDate) postes.FOR.lastDate = dk;
      return;
    }
    let info = jsCode ? POSTE_REGISTRY[jsCode] : null;
    // AY/CAF/VM/JEQ (21/08, demandé par Olivier) : POSTE_REGISTRY (et, pour
    // CAF/VM, POSTES_JOURNEE dont il dérive) est un registre STATIQUE
    // (construit une fois, partagé par tous les agents) et ne peut donc pas
    // savoir de quelle famille est l'agent qui a réellement saisi ce jour --
    // il fige famille:"PRCI" par défaut pour ces 4 postes génériques (aucun
    // des 4 n'est lié à une habilitation précise, contrairement à un vrai
    // poste PRCI/PAR). Ici, computeDashboardTravail reçoit l'agent réel : on
    // recalcule leur famille à la volée depuis agent.famille (même défaut
    // "PRCI" qu'ailleurs dans le code si absent, ex. DayEditPopup.jsx) plutôt
    // que de faire confiance à la valeur figée du registre -- "les journee
    // caf et vm doivent etre [comme] ay, affecté au[x] journee de travail
    // dont depends l'agent" (JEQ, ajoutée le même jour juste avant AY dans le
    // picker, reçoit le même traitement dès sa création). Comme ce calcul est
    // refait à chaque affichage à partir du planning déjà enregistré, les
    // CAF/VM/AY/JEQ déjà saisis par des agents PAR se reclassent
    // automatiquement en PAR sans qu'aucune donnée ne soit modifiée ni
    // ressaisie. Volontairement limité à CE calcul (Jours
    // travaillés) -- POSTES_JOURNEE lui-même n'est pas touché, CPS
    // Officiel/Planning Prévisionnel (qui le partagent) restent inchangés.
    // DISPO (23/08, même principe) : ajoutée comme poste "Journée" sélectionnable
    // dans le perso, juste avant VM -- même registre statique donc même besoin
    // de recalcul de famille à la volée.
    if(info && (jsCode==="AY" || jsCode==="CAF" || jsCode==="VM" || jsCode==="JEQ" || jsCode==="DISPO")){
      info = {...info, famille: agent?.famille || "PRCI"};
    }
    if(!info){
      sansPosteVrai.total++;
      sansPosteVrai.dates.push(dk);
      if(!sansPosteVrai.lastDate || dk > sansPosteVrai.lastDate) sansPosteVrai.lastDate = dk;
      return;
    }
    if(!postes[info.code]){
      postes[info.code] = { code:info.code, label:info.label, famille:info.famille, total:0, lastDate:null, parShift:{} };
    }
    const p = postes[info.code];
    p.total++;
    if(!p.lastDate || dk > p.lastDate) p.lastDate = dk;
    if(!p.parShift[info.shift]) p.parShift[info.shift] = { count:0, lastDate:null };
    p.parShift[info.shift].count++;
    if(!p.parShift[info.shift].lastDate || dk > p.parShift[info.shift].lastDate) p.parShift[info.shift].lastDate = dk;
  };

  Object.entries(schedule).forEach(([key,val])=>{
    if(!agent || !key.startsWith(agent.id+"-")) return;
    const dk = key.slice(agent.id.length+1);
    if(dk < start || dk > end) return;
    const isNuitSeule = val?.equipe==="N" && val?.equipe2==="N";
    if(isNuitSeule){
      traiter("N", val?.jsCode, dk);
    } else {
      traiter(val?.equipe, val?.jsCode, dk);
      traiter(val?.equipe2, val?.jsCode2, dk);
    }
    // Formation (09/08) : periode independante (val.formation) — meme regle
    // que dans DashboardCompteurs.computed : compte comme Formation
    // uniquement une fois la journee principale liberee (equipe vide),
    // jamais en plus d'une journee deja comptee via equipe/equipe2.
    if(val?.formation && !val?.equipe){
      traiter("FOR", null, dk);
    }
  });

  const totalPRCI = Object.values(postes).filter(p=>p.famille==="PRCI").reduce((s,p)=>s+p.total,0);
  const totalPAR  = Object.values(postes).filter(p=>p.famille==="PAR").reduce((s,p)=>s+p.total,0);
  const totalFormation = postes.FOR?.total || 0;
  const total = totalPRCI + totalPAR + totalFormation + sansPosteVrai.total; // === totalTravail
  const pct = (n) => total>0 ? Math.round(n/total*1000)/10 : 0;
  sansPosteVrai.dates.sort((a,b)=> b.localeCompare(a)); // plus récent d'abord
  if(postes.FOR) postes.FOR.dates.sort((a,b)=> b.localeCompare(a));

  return {
    totalTravail,
    postes: Object.values(postes).sort((a,b)=> b.total-a.total),
    sansPosteVrai,
    repartition: {
      PRCI: { jours: totalPRCI, pct: pct(totalPRCI) },
      Formation: { jours: totalFormation, pct: pct(totalFormation) },
      PAR:  { jours: totalPAR,  pct: pct(totalPAR) },
      sansPoste: { jours: sansPosteVrai.total, pct: pct(sansPosteVrai.total) },
    },
    parShiftGlobal,
  };
}

// ─── MODALE TABLEAU DE BORD JOURNÉES TRAVAILLÉES ─────────────────────────────
// Contenu du tableau de bord "Journées travaillées", extrait en composant
// autonome pour être réutilisé à la fois dans la modale (clic sur la carte
// compteur) et dans la vue restreinte admin (consultation du profil d'un
// autre agent, voir PersonalView).
function TravailDashboardContent({ data }) {
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}) : "—";
  const SHIFT_LABELS = { M:"Matin", AM:"Soirée", N:"Nuit", J:"Journée", FOR:"Formation" };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>

      {/* Répartition PRCI / PAR / Formation / Non affecté (= 100%) --
          Formation a sa PROPRE catégorie depuis le 21/08 (Olivier : "ma
          journee de formation du 25 mars reste en non aaffecté. pk ?") --
          avant, une Formation était comptée dans "Non affecté" en plus de sa
          propre carte de détail plus bas, ce qui la faisait apparaître à
          tort comme non identifiée alors qu'elle l'est parfaitement. */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {[
          {k:"PRCI", label:"PRCI", color:"#1d4ed8"},
          {k:"PAR",  label:"PAR",  color:"#065f46"},
          {k:"Formation", label:"Formation", color:"#0891b2"},
          {k:"sansPoste", label:"Non affecté", color:"#475569"},
        ].map(({k,label,color})=>(
          <div key={k} style={{flex:"1 1 100px",background:"#f8fafc",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid #e2e8f0"}}>
            <div style={{fontSize:11,fontWeight:700,color}}>{label}</div>
            <div style={{fontSize:20,fontWeight:900,color}}>{data.repartition[k].jours}</div>
            <div style={{fontSize:11,fontWeight:600,color:"#475569"}}>{data.repartition[k].pct}%</div>
            {/* Date du dernier jour, sur "Non affecté" ET "Formation" (19/08
                puis 21/08, Olivier) -- "Non affecté" ne représente plus QUE
                les jours réellement sans poste précisé (sansPosteVrai). */}
            {k==="sansPoste"&&data.repartition.sansPoste.jours>0&&<div style={{fontSize:9,fontWeight:600,color:"#94a3b8",marginTop:2}}>dernier : {fmtDate(data.sansPosteVrai.lastDate)}</div>}
            {k==="Formation"&&data.repartition.Formation.jours>0&&<div style={{fontSize:9,fontWeight:600,color:"#94a3b8",marginTop:2}}>dernier : {fmtDate(data.postes.find(p=>p.code==="FOR")?.lastDate)}</div>}
          </div>
        ))}
      </div>

      {/* Comptage global M/AM/N/J/FOR — tous postes confondus, distinct du détail par poste ci-dessous */}
      <div>
        <div style={{fontSize:11,fontWeight:700,color:"#334155",marginBottom:6}}>Total par vacation (tous postes confondus)</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {["M","AM","N","J","FOR"].map(shift=>(
            <div key={shift} style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#475569"}}>{SHIFT_LABELS[shift]}</div>
              <div style={{fontSize:20,fontWeight:900,color:"#1e293b"}}>{data.parShiftGlobal[shift]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Détail par poste */}
      {data.postes.length===0 ? (
        <div style={{fontSize:12,color:"#475569",textAlign:"center",padding:12}}>Aucun poste précisé cette année.</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {data.postes.map(p=>(
            <div key={p.code} style={{border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:11,fontWeight:700,padding:"1px 7px",borderRadius:6,background:p.famille==="PRCI"?"#dbeafe":p.famille==="PAR"?"#d1fae5":"#fef3c7",color:p.famille==="PRCI"?"#1e40af":p.famille==="PAR"?"#065f46":"#92400e"}}>{p.famille==="FOR"?"📚":p.famille}</span>
                  <span style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>{p.label}</span>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:15,fontWeight:900,color:"#1e293b"}}>{p.total}j</div>
                  <div style={{fontSize:10,fontWeight:600,color:"#475569"}}>dernier : {fmtDate(p.lastDate)}</div>
                </div>
              </div>
              {Object.keys(p.parShift).length>0 && <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {Object.entries(p.parShift).map(([shift,s])=>(
                  <div key={shift} style={{background:"#f1f5f9",borderRadius:7,padding:"4px 8px",fontSize:10}}>
                    <span style={{fontWeight:700,color:"#334155"}}>{SHIFT_LABELS[shift]||shift} : {s.count}</span>
                    <span style={{fontWeight:600,color:"#475569",marginLeft:5}}>({fmtDate(s.lastDate)})</span>
                  </div>
                ))}
              </div>}
            </div>
          ))}
        </div>
      )}

      {/* Liste complète des dates de Formation (21/08, même demande que pour
          "Non affecté" — le 21/08 plus tôt, Formation partageait encore cette
          liste avec les jours vraiment non affectés ; depuis qu'elle a sa
          propre catégorie ci-dessus, elle a aussi sa propre liste ici). */}
      {(data.postes.find(p=>p.code==="FOR")?.dates?.length>0) && (
        <div style={{border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:6}}>📚 Journées de formation ({data.postes.find(p=>p.code==="FOR").dates.length})</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {data.postes.find(p=>p.code==="FOR").dates.map((d,i)=>(
              <div key={i} style={{background:"#f1f5f9",borderRadius:7,padding:"4px 8px",fontSize:10.5,fontWeight:600,color:"#334155"}}>{fmtDate(d)}</div>
            ))}
          </div>
        </div>
      )}

      {/* Liste complète des dates "Non affecté" (21/08, Olivier : "pourquoi
          je vois plus les dates des journnes non affectee" — jusqu'ici seule
          la date la PLUS RÉCENTE était affichée, jamais la liste complète) --
          ne représente plus que les jours réellement sans aucun poste
          précisé (Formation a désormais sa propre liste juste au-dessus). */}
      {data.sansPosteVrai.dates.length>0 && (
        <div style={{border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:6}}>📋 Journées non affectées ({data.sansPosteVrai.dates.length})</div>
          <div style={{fontSize:10.5,fontWeight:500,color:"#475569",marginBottom:8}}>Le poste n'a pas été renseigné dans le planning ces jours-là.</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {data.sansPosteVrai.dates.map((d,i)=>(
              <div key={i} style={{background:"#f1f5f9",borderRadius:7,padding:"4px 8px",fontSize:10.5,fontWeight:600,color:"#334155"}}>{fmtDate(d)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TravailDashboardModal({ agent, schedule, year, availableYears, onYearChange, onClose }) {
  const data = useMemo(()=>computeDashboardTravail(agent, schedule, year), [agent, schedule, year]);

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:520,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
        <div style={{background:"linear-gradient(135deg,#8B0000,#6b0000)",padding:"18px 20px",display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",position:"sticky",top:0}}>
          <div style={{flex:"1 1 auto",minWidth:0}}>
            <div style={{color:"#fff",fontSize:16,fontWeight:800,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>💼 Journées travaillées {year}</div>
            <div style={{color:"rgba(255,255,255,.7)",fontSize:12,marginTop:2}}>{data.totalTravail} jour{data.totalTravail>1?"s":""} au total</div>
          </div>
          {availableYears&&onYearChange&&<YearSwitcher year={year} availableYears={availableYears} onChange={onYearChange}/>}
          <button onClick={onClose} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer",opacity:.8,flexShrink:0}}>✕</button>
        </div>

        <div style={{padding:"18px 20px"}}>
          <TravailDashboardContent data={data}/>
        </div>
      </div>
    </div>
  );
}

// ─── TABLEAU DE BORD CONGÉS ───────────────────────────────────────────────────
const CONGES_ANNUELS_DEFAUT = 28;

// Jours CA/CP bruts du planning perso pour une année donnée (avant ajustement de report)
function getCongesBrutsAnnee(agent, schedule, year){
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const jours = [];
  Object.entries(schedule).forEach(([k,v])=>{
    if(!agent || !k.startsWith(agent.id+"-")) return;
    const dk = k.slice(agent.id.length+1);
    if(dk < start || dk > end) return;
    if(v?.equipe==="CA"||v?.equipe==="CP") jours.push(dk);
    else if(v?.equipe2==="CA"||v?.equipe2==="CP") jours.push(dk);
  });
  return jours;
}

// Jours "Congé demandé" de l'année (06/08, pour le badge + numérotation
// combinée dans le planning perso) — même règle de détachement auto (Phase 3,
// 15/07) que computeDashboardConges : un suivi périmé (jour vide à la demande,
// rempli depuis par autre chose) n'est jamais affiché comme actif.
function getCongesDemandeesAnnee(agent, agentProfiles, schedule, year){
  const profil = agentProfiles?.[agent?.id] || {};
  const tracking = profil.congesDemandes || {};
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const jours = [];
  Object.entries(tracking).forEach(([d,t])=>{
    if(!t || t.statut!=="demande") return;
    if(d<start||d>end) return;
    const entree = schedule[`${agent?.id}-${d}`];
    const codeActuel = entree?.equipe || entree?.equipe2;
    if(t.jourEtaitVide && codeActuel) return;
    jours.push(d);
  });
  return jours;
}

// Jours "VT demandé" de l'année (06/08, même principe que
// getCongesDemandeesAnnee — VT suit désormais le même cycle
// Accordé/Demandé/Refusé que Congés, voir computeDashboardVT).
function getJoursVTDemandeesAnnee(agent, agentProfiles, schedule, year){
  const profil = agentProfiles?.[agent?.id] || {};
  const tracking = profil.vtTracking || {};
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const jours = [];
  Object.entries(tracking).forEach(([d,t])=>{
    if(!t || t.statut!=="demande") return;
    if(d<start||d>end) return;
    const entree = schedule[`${agent?.id}-${d}`];
    const codeActuel = entree?.equipe || entree?.equipe2;
    if(t.jourEtaitVide && codeActuel) return;
    jours.push(d);
  });
  return jours;
}

// Générique : jours d'un ensemble de codes équipe/équipe2 pour une année donnée
// (réutilisé pour la numérotation RU/RQ/RP+RPP dans le planning perso, 04/08 —
// même principe que getCongesBrutsAnnee).
export function getJoursCodesAnnee(agent, schedule, year, codes){
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const jours = [];
  Object.entries(schedule).forEach(([k,v])=>{
    if(!agent || !k.startsWith(agent.id+"-")) return;
    const dk = k.slice(agent.id.length+1);
    if(dk < start || dk > end) return;
    if(codes.includes(v?.equipe)) jours.push(dk);
    else if(codes.includes(v?.equipe2)) jours.push(dk);
  });
  return jours;
}

// Comme getJoursCodesAnnee, mais pour la grève (05/08) : le code (DA/DB/DC)
// est stocké dans le champ independant "greve", jamais dans equipe/equipe2
// (voir DayEditPopup/toggleGreve) - un seul code precis, pas une liste.
function getJoursGreveAnnee(agent, schedule, year, code){
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const jours = [];
  Object.entries(schedule).forEach(([k,v])=>{
    if(!agent || !k.startsWith(agent.id+"-")) return;
    const dk = k.slice(agent.id.length+1);
    if(dk < start || dk > end) return;
    if(v?.greve === code) jours.push(dk);
  });
  return jours;
}

// Calcule le détail des congés d'une année : droit, jours pris par mois (avec
// cumul), et gestion des "reports" — des jours de congé physiquement pris sur
// l'année suivante mais décomptés du solde de cette année-ci (tolérance de
// report). Historique et immuable comme le reste du planning perso : basé
// uniquement sur les jours CA/CP réellement saisis, jamais recalculé si le
// droit à congés change ensuite pour une année passée.
export function computeDashboardConges(agent, schedule, agentProfiles, year){
  const profil = agentProfiles?.[agent?.id] || {};
  const entitlement = profil.congesEntitlement?.[year] ?? CONGES_ANNUELS_DEFAUT;
  const reportsCetteAnnee = profil.congesReports?.[year] || [];       // dates hors annee, comptees sur "year"
  const reportsAnneePrecedente = profil.congesReports?.[year-1] || []; // dates de "year" deja revendiquees par year-1

  const brut = getCongesBrutsAnnee(agent, schedule, year);
  const donnesAnneePrecedente = brut.filter(d=>reportsAnneePrecedente.includes(d));
  const propresAnnee = brut.filter(d=>!reportsAnneePrecedente.includes(d));
  const reportsValides = reportsCetteAnnee.filter(d=>{
    const v = schedule[`${agent.id}-${d}`];
    return v?.equipe==="CA"||v?.equipe==="CP"||v?.equipe2==="CA"||v?.equipe2==="CP";
  });
  const tousJours = [...propresAnnee, ...reportsValides].sort();

  const parMois = {};
  let cumul = 0;
  tousJours.forEach(d=>{
    const mois = d.slice(0,7);
    if(!parMois[mois]) parMois[mois] = {dates:[], debut:cumul+1, fin:cumul, horsAnnee:false};
    parMois[mois].dates.push(d);
    if(!d.startsWith(String(year))) parMois[mois].horsAnnee = true;
    cumul++;
    parMois[mois].fin = cumul;
  });

  const pris = tousJours.length;

  // Demandes en attente / refusées : suivi indépendant du planning perso —
  // une demande n'écrit JAMAIS rien dans schedule (contrairement à VT), le
  // jour de travail existant reste affiché et compté normalement tant que le
  // congé n'est pas accordé. congesDemandes est une map PLATE indexée par
  // date ISO (même principe que vtTracking), pas de niveau année.
  //
  // Détachement auto (Phase 3, 15/07 — CORRIGÉ le 17/07 suite à un bug réel
  // signalé par Olivier) : un jour "Demandé" se pose presque toujours sur un
  // jour qui a DÉJÀ un contenu (une journée de travail prévue, un repos...) —
  // c'est le cas normal décrit dès la Phase 1 ("la journée prévue reste
  // affichée et comptée tant que le congé n'est pas accordé"). La première
  // version de ce détachement traitait à tort TOUT contenu existant comme
  // "résolu autrement", ce qui faisait disparaître quasiment toutes les
  // demandes réelles de la liste (testé initialement seulement sur des jours
  // vides, d'où le bug passé inaperçu). Corrigé : on ne détache un suivi que
  // si le jour était VIDE au moment de la demande/refus (jourEtaitVide, capturé
  // à la création) et a ÉTÉ REMPLI depuis — jamais si le jour avait déjà un
  // contenu légitime dès le départ. Un jour réellement accordé (CA/CP) reste
  // détecté via brut/tousJours, indépendamment de ce champ.
  const tracking = profil.congesDemandes || {};
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const demandes = [], refusees = [];
  Object.entries(tracking).forEach(([d, t])=>{
    if(!t) return; // entree supprimee (tombstone JSON_MERGE_PATCH : null, pas absente)
    if(d < start || d > end) return;
    const entree = schedule[`${agent.id}-${d}`];
    const codeActuel = entree?.equipe || entree?.equipe2;
    if(t.jourEtaitVide && codeActuel) return; // etait vide a la demande/refus, rempli depuis -> perime
    if(t.statut==="demande"){
      if(brut.includes(d)) return; // deja accorde -> compte via brut, pas ici
      // 13/08 (Olivier) : deja revendique par l'annee precedente (report sur
      // "year" d'un jour demande physiquement date ici) -> compte sur le solde
      // theorique de year-1 (via demandesReportees ci-dessous), pas ici, sinon
      // double-compte.
      if(reportsAnneePrecedente.includes(d)) return;
      demandes.push({date:d, dateDemande:t.dateDemande});
    } else if(t.statut==="refuse"){
      // Si le jour a finalement ete accorde entre-temps (typé CA/CP directement
      // dans le planning), on le retire du suivi des refus — demandé par
      // Olivier le 17/07 : un jour ne doit pas rester "refusé" une fois accordé.
      if(brut.includes(d)) return;
      refusees.push({date:d, dateDemande:t.dateDemande, dateRefus:t.dateRefus});
    }
  });
  demandes.sort((a,b)=>a.date<b.date?-1:1);
  refusees.sort((a,b)=>a.date<b.date?-1:1);

  // Congés demandés (pas encore accordés) physiquement datés sur l'année
  // SUIVANTE mais déjà revendiqués sur "year" via un report (13/08, Olivier :
  // "il faut que le compteur du report tienne aussi compte du congé demandé
  // l'année suivante pour avoir le bon calcul") — le report n'exige plus que
  // le jour soit déjà accordé (voir ajouterReport), un jour encore "Demandé"
  // peut être flagué de la même façon. Jamais compté dans "pris" (qui reste
  // strictement réservé aux jours réellement accordés), mais déjà engagé sur
  // le solde théorique de l'année qui le revendique — sinon l'agent croit à
  // tort avoir plus de solde restant qu'il n'en aura une fois ce jour accordé.
  const demandesReportees = reportsCetteAnnee.filter(d=>{
    if(d.startsWith(String(year))) return false; // deja compte ci-dessus si physiquement dans year
    const v = schedule[`${agent.id}-${d}`];
    const estAccorde = v?.equipe==="CA"||v?.equipe==="CP"||v?.equipe2==="CA"||v?.equipe2==="CP";
    if(estAccorde) return false; // deja dans reportsValides/pris, pas ici
    const t = tracking[d];
    return !!t && t.statut==="demande";
  });

  // Solde théorique (06/08, demandé par Olivier) : projection "si toutes les
  // demandes en attente sont accordées" — soustrait les demandes.length ET les
  // demandesReportees.length (jamais refusees, qui ne consommeront jamais le
  // solde). Peut devenir négatif si l'agent demande plus que son solde réel
  // restant (signal volontairement affiché tel quel, pas plafonné à 0, pour alerter).
  const soldeTheorique = (entitlement-pris) - demandes.length - demandesReportees.length;

  return {
    entitlement, pris, solde: entitlement-pris,
    soldeTheorique,
    parMois,
    tousJours,
    reports: reportsValides,
    donnesAnneePrecedente,
    demandes, refusees, demandesReportees,
  };
}

// Perte de jours RP/RU/RQ/Congés suite à un arrêt maladie (14/08, demandé par
// Olivier — "on perd les RP RU RQ CA en fonction du nb de jour de maladie...
// il faut pouvoir affecter les jours perdu sur ses compteur vers le compteur
// Maladie... et avoir une trace"). **Simplifié le même jour** (Olivier, après
// un premier essai avec cycle perdu/restauré : "tu as mis un message de
// restauration. Ce n'est pas utile [...] Il faut juste tracer le nombre de
// jours qui sont perdus [...] Les restaurations on s'en fout. C'est aux
// agents de vérifier que les compteurs suivent.") — plus de statut ni de
// restauration : chaque mouvement est un simple constat permanent (compteur
// + jours + note), retirable uniquement pour corriger une erreur de saisie
// (bouton "✕ Retirer", suppression définitive, pas un cycle perdu/restauré).
// agentProfiles[agentId].maladiePertes est un tableau plat, jamais indexé par
// année — chaque mouvement porte son propre champ `annee` (année du compteur
// SOURCE concerné). Géré exclusivement depuis le module Maladie
// (MaladiePertesSection ci-dessous, fusionnée dans "+ Ajouter une période"),
// les autres compteurs (RP/RU/RQ/Congés) n'affichent qu'un rappel en lecture
// seule, même principe que le récap CET (getCetTransfereJours).
export function getMaladiePerteJours(agentProfiles, agentId, compteur, annee){
  const mvts = agentProfiles?.[agentId]?.maladiePertes || [];
  return mvts.filter(m=>m.compteur===compteur && m.annee===annee).reduce((s,m)=>s+(m.jours||0), 0);
}

function CongesDashboardModal({ agent, schedule, setSchedule, agentProfiles, setAgentProfiles, year, availableYears, onYearChange, onClose, cetTransfere, maladiePerte }){
  const data = useMemo(()=>computeDashboardConges(agent, schedule, agentProfiles, year), [agent, schedule, agentProfiles, year]);
  const [entitlementInput, setEntitlementInput] = useState(String(data.entitlement));
  const [reportDate, setReportDate] = useState("");
  const [reportErr, setReportErr] = useState("");
  const [dateSnapshot, setDateSnapshot] = useState(()=>new Date().toISOString().slice(0,10));
  const [nouvelleDateDebut, setNouvelleDateDebut] = useState("");
  const [nouvelleDateFin, setNouvelleDateFin] = useState("");
  const [ajoutErr, setAjoutErr] = useState("");
  const [ajoutInfo, setAjoutInfo] = useState("");
  // Suivi des refus fusionné dans ce popup (05/08, était un second popup
  // imbriqué avant — voir computeRefusConges plus bas pour le détail des
  // champs talon). Regroupement par période purement visuel, voir
  // groupRefusEnPeriodes : aucun changement du modèle de données stocké.
  const refusData = useMemo(()=>computeRefusConges(agent, schedule, agentProfiles, year), [agent, schedule, agentProfiles, year]);
  const periodesRefus = useMemo(()=>groupRefusEnPeriodes(refusData.refus), [refusData.refus]);
  // Tri mensuel (06/08) : Demandées et Refusées regroupées par mois pour la
  // lisibilité — purement visuel, aucun changement de calcul ni de donnée.
  const demandesParMois = useMemo(()=>groupParMois(data.demandes, e=>e.date), [data.demandes]);
  const periodesRefusParMois = useMemo(()=>groupParMois(periodesRefus, p=>p.debut), [periodesRefus]);
  const [showAjoutRefus, setShowAjoutRefus] = useState(false);
  const [refusDateDebut, setRefusDateDebut] = useState("");
  const [refusDateFin, setRefusDateFin] = useState("");
  const [refusErr, setRefusErr] = useState("");
  const [refusInfo, setRefusInfo] = useState("");
  const [periodesOuvertes, setPeriodesOuvertes] = useState({});
  useEffect(()=>{ setEntitlementInput(String(data.entitlement)); },[data.entitlement]);

  const prisJusquA = useMemo(()=>data.tousJours.filter(d=>d<=dateSnapshot).length, [data.tousJours, dateSnapshot]);

  const today = new Date().toISOString().slice(0,10);
  const agCp = agent?.immatriculation || agent?.cp || agent?.id;
  const fmtDate = (d)=> d ? new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";

  const saveEntitlement = () => {
    const n = parseInt(entitlementInput,10);
    if(isNaN(n) || n<0) { setEntitlementInput(String(data.entitlement)); return; }
    setAgentProfiles(prev=>({
      ...prev,
      [agent.id]:{
        ...(prev[agent.id]||{}),
        congesEntitlement:{ ...(prev[agent.id]?.congesEntitlement||{}), [year]: n },
      }
    }));
  };

  // ── Cycle Demandé → Accordé / Refusé ────────────────────────────────────
  // congesDemandes (map plate date ISO -> {statut, dateDemande, dateRefus})
  // ne contient QUE les jours "demandé" ou "refusé" : tant qu'un congé n'est
  // pas accordé, rien n'est écrit dans le planning perso — la journée de
  // travail existante reste affichée et comptée normalement. Dès qu'un jour
  // est accordé, il est écrit dans schedule (code CA) et retiré de cette
  // map : sa présence dans schedule fait foi (même logique que getCongesBrutsAnnee).
  const setCongeTracking = (date, updater) => {
    setAgentProfiles(prev=>{
      const curr = prev[agent.id]?.congesDemandes?.[date] || {};
      const next = typeof updater === 'function' ? updater(curr) : updater;
      return {...prev, [agent.id]:{
        ...(prev[agent.id]||{}),
        congesDemandes:{ ...(prev[agent.id]?.congesDemandes||{}), [date]: next },
      }};
    });
  };

  // Le retrait envoie un tombstone { [date]: null } plutôt qu'une simple absence
  // de clé : JSON_MERGE_PATCH (backend) fusionne les objets imbriqués au lieu de
  // les remplacer — envoyer un objet plus petit ne supprime jamais une clé côté
  // serveur (seule une valeur explicite null le fait). Sans ça, "Retirer" semble
  // fonctionner en local mais l'entrée reste en base et peut réapparaître.
  const retirerCongeTracking = (date) => {
    setAgentProfiles(prev=>{
      const curr = {...(prev[agent.id]?.congesDemandes||{})};
      curr[date] = null;
      return {...prev, [agent.id]:{...(prev[agent.id]||{}), congesDemandes:curr}};
    });
  };

  const listerDatesEntre = (debut, fin) => {
    const dates = [];
    let d = new Date(debut+"T12:00:00");
    const dFin = new Date((fin||debut)+"T12:00:00");
    while(d<=dFin){ dates.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); }
    return dates;
  };

  // Ajouter une demande (jour unique ou période) : n'écrit jamais dans le
  // planning perso — c'est ce qui protège le planning contre tout risque de
  // régression tant que rien n'est accordé. Les jours déjà pris ou déjà en
  // attente sont silencieusement ignorés (pas de blocage sur toute la
  // période : une demande de période peut légitimement chevaucher des jours
  // déjà réglés autrement).
  const ajouterDemande = () => {
    setAjoutErr(""); setAjoutInfo("");
    if(!nouvelleDateDebut) return;
    if(nouvelleDateFin && nouvelleDateFin<nouvelleDateDebut){ setAjoutErr("La date de fin est avant la date de début."); return; }
    const dates = listerDatesEntre(nouvelleDateDebut, nouvelleDateFin);
    if(dates.length>62){ setAjoutErr("Période trop longue (62 jours maximum) — vérifie les dates."); return; }
    const existants = agentProfiles[agent.id]?.congesDemandes || {};
    let ajoutes=0, ignores=0;
    const maj = {};
    dates.forEach(d=>{
      const v = schedule[`${agCp}-${d}`];
      const dejaAccorde = v?.equipe==="CA"||v?.equipe==="CP"||v?.equipe2==="CA"||v?.equipe2==="CP";
      const dejaDemande = existants[d]?.statut==="demande";
      if(dejaAccorde || dejaDemande){ ignores++; return; }
      // jourEtaitVide capturé à la création : sert uniquement au détachement
      // auto (Phase 3) — ne détacher que si le jour était vide à la demande,
      // jamais s'il avait déjà un contenu légitime (cas normal).
      const jourEtaitVide = !(v?.equipe || v?.equipe2);
      maj[d] = {statut:"demande", dateDemande: today, jourEtaitVide};
      ajoutes++;
    });
    if(ajoutes>0){
      setAgentProfiles(prev=>({...prev, [agent.id]:{...(prev[agent.id]||{}), congesDemandes:{...(prev[agent.id]?.congesDemandes||{}), ...maj}}}));
    }
    setNouvelleDateDebut(""); setNouvelleDateFin("");
    setAjoutInfo(`${ajoutes} jour${ajoutes>1?"s":""} ajouté${ajoutes>1?"s":""} en demande${ignores>0?`, ${ignores} ignoré${ignores>1?"s":""} (déjà pris ou déjà en attente)`:""}.`);
  };

  // Accorder : écrase directement le jour dans le planning perso (demandé
  // explicitement par Olivier — contrairement aux autres garde-fous de cette
  // session, ici on écrase volontairement ce qui pouvait déjà être prévu).
  const accorderDemande = (date) => {
    const key = `${agCp}-${date}`;
    const entryExistante = schedule[key] || {};
    const fullEntry = {...entryExistante, equipe:"CA", prive:true};
    setSchedule(prev=>({...prev, [key]: fullEntry}));
    api.planning.saveEntry(agCp, date, fullEntry).catch(e=>console.error("Erreur sauvegarde congé accordé:", e));
    retirerCongeTracking(date);
  };

  const refuserDemande = (date) => {
    setCongeTracking(date, prev=>({statut:"refuse", dateDemande: prev.dateDemande || null, dateRefus: today, jourEtaitVide: prev.jourEtaitVide}));
  };

  const retirerDemande = (date) => retirerCongeTracking(date);

  // Annuler un jour déjà accordé : vide simplement le jour dans le planning
  // (pas de restauration automatique de ce qu'il y avait avant — l'agent
  // ressaisit si besoin, choix fait explicitement pour rester sur un
  // mécanisme simple et éprouvé, identique à VT/Fêtes).
  const annulerAccord = (date) => {
    const key = `${agCp}-${date}`;
    const entryExistante = schedule[key];
    if(!entryExistante || (entryExistante.equipe!=="CA" && entryExistante.equipe!=="CP")) return;
    const {equipe, ...reste} = entryExistante;
    const videTotal = !reste.equipe2 && !reste.finNuit && !reste.notePerso;
    if(videTotal){
      setSchedule(prev=>{const n={...prev}; delete n[key]; return n;});
      api.planning.deleteEntry(agCp, date).catch(e=>console.error("Erreur suppression congé:", e));
    } else {
      const fullEntry = {...reste, equipe:null};
      setSchedule(prev=>({...prev, [key]: fullEntry}));
      api.planning.saveEntry(agCp, date, fullEntry).catch(e=>console.error("Erreur suppression congé:", e));
    }
  };

  const ajouterReport = () => {
    setReportErr("");
    if(!reportDate) return;
    const v = schedule[`${agent.id}-${reportDate}`];
    const estConge = v?.equipe==="CA"||v?.equipe==="CP"||v?.equipe2==="CA"||v?.equipe2==="CP";
    // 13/08 (Olivier) : un jour encore "Demandé" (pas encore accordé) peut
    // aussi être flagué comme report — le solde théorique de l'année en tient
    // compte (voir demandesReportees dans computeDashboardConges), pas "Pris"
    // qui reste strictement réservé aux jours réellement accordés.
    const demandeTracking = agentProfiles?.[agent.id]?.congesDemandes?.[reportDate];
    const estDemande = demandeTracking?.statut==="demande";
    if(!estConge && !estDemande){ setReportErr("Ce jour n'est ni accordé (CA/CP) ni en attente d'accord dans le planning perso — saisis-le ou demande-le d'abord, puis reviens ici."); return; }
    if(data.reports.includes(reportDate) || (data.demandesReportees||[]).includes(reportDate)){ setReportErr("Ce jour est déjà comptabilisé en report."); return; }
    setAgentProfiles(prev=>{
      const existants = prev[agent.id]?.congesReports?.[year] || [];
      return {
        ...prev,
        [agent.id]:{
          ...(prev[agent.id]||{}),
          congesReports:{ ...(prev[agent.id]?.congesReports||{}), [year]: [...existants, reportDate] },
        }
      };
    });
    setReportDate("");
  };

  const retirerReport = (d) => {
    setAgentProfiles(prev=>{
      const existants = prev[agent.id]?.congesReports?.[year] || [];
      return {
        ...prev,
        [agent.id]:{
          ...(prev[agent.id]||{}),
          congesReports:{ ...(prev[agent.id]?.congesReports||{}), [year]: existants.filter(x=>x!==d) },
        }
      };
    });
  };

  const moisTries = Object.keys(data.parMois).sort();

  // ── Suivi des refus (fusionné dans ce popup le 05/08, était un second
  // popup imbriqué avant) — voir computeRefusConges pour talonStatut/dates.
  const ajouterRefus = () => {
    setRefusErr(""); setRefusInfo("");
    if(!refusDateDebut) return;
    if(refusDateFin && refusDateFin<refusDateDebut){ setRefusErr("La date de fin est avant la date de début."); return; }
    const dates = listerDatesEntre(refusDateDebut, refusDateFin);
    if(dates.length>62){ setRefusErr("Période trop longue (62 jours maximum) — vérifie les dates."); return; }
    const existants = agentProfiles[agent.id]?.congesDemandes || {};
    let ajoutes=0, ignores=0;
    const maj = {};
    dates.forEach(d=>{
      if(existants[d]){ ignores++; return; } // deja suivi (demande ou refuse)
      const v = schedule[`${agCp}-${d}`];
      maj[d] = {statut:"refuse", dateDemande:null, dateRefus:today, jourEtaitVide: !(v?.equipe || v?.equipe2)};
      ajoutes++;
    });
    if(ajoutes>0){
      setAgentProfiles(prev=>({...prev, [agent.id]:{...(prev[agent.id]||{}), congesDemandes:{...(prev[agent.id]?.congesDemandes||{}), ...maj}}}));
    }
    setRefusDateDebut(""); setRefusDateFin("");
    setRefusInfo(`${ajoutes} jour${ajoutes>1?"s":""} de refus ajouté${ajoutes>1?"s":""}${ignores>0?`, ${ignores} ignoré${ignores>1?"s":""} (déjà suivi)`:""}.`);
  };

  const setTalon = (date, statut) => {
    setAgentProfiles(prev=>{
      const curr = prev[agent.id]?.congesDemandes?.[date] || {};
      const next = {...curr};
      // Reinitialisation (null) : tombstone explicite sur les 3 champs, pas de
      // delete local — meme raison que retirerCongeTracking ci-dessus.
      if(statut===null){ next.talonStatut = null; next.dateTalonDemande = null; next.dateTalonRecu = null; }
      else {
        next.talonStatut = statut;
        if(statut==="demande") next.dateTalonDemande = today;
        if(statut==="recu") next.dateTalonRecu = today;
      }
      return {...prev, [agent.id]:{...(prev[agent.id]||{}), congesDemandes:{...(prev[agent.id]?.congesDemandes||{}), [date]: next}}};
    });
  };

  // Retire un ou plusieurs jours refuses d'un coup (tombstone null par date —
  // meme mecanisme que retirerCongeTracking, JSON_MERGE_PATCH ne supprime une
  // cle imbriquee que sur une valeur null explicite).
  const retirerRefus = (dates) => {
    setAgentProfiles(prev=>{
      const curr = {...(prev[agent.id]?.congesDemandes||{})};
      dates.forEach(d=>{ curr[d] = null; });
      return {...prev, [agent.id]:{...(prev[agent.id]||{}), congesDemandes:curr}};
    });
  };

  // N'active que les jours qui n'ont encore AUCUN statut de talon — ne touche
  // jamais un jour deja "recu" ou "jamais recu" pour ne rien ecraser par erreur.
  const demanderTalonPeriode = (jours) => { jours.filter(j=>!j.talonStatut).forEach(j=>setTalon(j.date,"demande")); };

  const fmtPeriodeLabel = (p) => {
    if(p.jours.length===1) return fmtDate(p.debut);
    const d1 = new Date(p.debut+"T12:00:00"), d2 = new Date(p.fin+"T12:00:00");
    const memeMois = d1.getMonth()===d2.getMonth() && d1.getFullYear()===d2.getFullYear();
    return memeMois ? `${String(d1.getDate()).padStart(2,"0")} → ${fmtDate(p.fin)}` : `${fmtDate(p.debut)} → ${fmtDate(p.fin)}`;
  };

  const renderTalonBtns = (r) => {
    if(!r.talonStatut) return <button onClick={()=>setTalon(r.date,"demande")} style={{background:"#f1f5f9",color:"#475569",border:"1px solid #cbd5e1",borderRadius:6,padding:"3px 7px",cursor:"pointer",fontSize:10,fontWeight:700}}>📋 Demander</button>;
    if(r.talonStatut==="demande") return (
      <>
        <span style={{fontSize:10,color:"#64748b",fontWeight:600}}>Demandé le {fmtDate(r.dateTalonDemande)}</span>
        <button onClick={()=>setTalon(r.date,"recu")} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:6,padding:"3px 7px",cursor:"pointer",fontSize:10,fontWeight:700}}>✓ Reçu</button>
        <button onClick={()=>setTalon(r.date,"jamais_recu")} style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:6,padding:"3px 7px",cursor:"pointer",fontSize:10,fontWeight:700}}>✕ Jamais</button>
      </>
    );
    if(r.talonStatut==="recu") return (
      <>
        <span style={{fontSize:10,color:"#166534",fontWeight:700}}>✓ Reçu le {fmtDate(r.dateTalonRecu)}</span>
        <button onClick={()=>setTalon(r.date,null)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:10,fontWeight:700,textDecoration:"underline"}}>↺</button>
      </>
    );
    return (
      <>
        <span style={{fontSize:10,color:"#dc2626",fontWeight:700}}>⚠️ Jamais reçu</span>
        <button onClick={()=>setTalon(r.date,"recu")} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:6,padding:"3px 7px",cursor:"pointer",fontSize:10,fontWeight:700}}>✓ Reçu finalement</button>
        <button onClick={()=>setTalon(r.date,null)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:10,fontWeight:700,textDecoration:"underline"}}>↺</button>
      </>
    );
  };

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:520,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
        <div style={{background:"linear-gradient(135deg,#eab308,#ca8a04)",padding:"18px 20px",display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",position:"sticky",top:0}}>
          <div style={{color:"#fff",fontSize:16,fontWeight:800,flex:"1 1 auto",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🏖️ Congés {year}</div>
          {availableYears&&onYearChange&&<YearSwitcher year={year} availableYears={availableYears} onChange={onYearChange}/>}
          <button onClick={onClose} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer",opacity:.8,flexShrink:0}}>✕</button>
        </div>

        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:16}}>

          {/* Droit à congés + solde */}
          <div style={{display:"flex",gap:8}}>
            <div style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#334155"}}>Droit</div>
              <input type="number" min="0" value={entitlementInput}
                onChange={e=>setEntitlementInput(e.target.value)}
                onBlur={saveEntitlement}
                onKeyDown={e=>{ if(e.key==="Enter") e.currentTarget.blur(); }}
                style={{width:"100%",textAlign:"center",fontSize:20,fontWeight:900,color:"#a16207",border:"1.5px solid #fde68a",borderRadius:8,padding:"2px 0",background:"#fff",marginTop:2}}/>
              <div style={{fontSize:9,color:"#475569",marginTop:2}}>modifiable</div>
            </div>
            <div style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#334155"}}>Pris</div>
              <div style={{fontSize:20,fontWeight:900,color:"#a16207"}}>{data.pris}</div>
            </div>
            <div style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"10px 8px",textAlign:"center",border:`1px solid ${(data.solde-(cetTransfere?.total||0)-(maladiePerte||0))<5?"#fca5a5":"#e2e8f0"}`}}>
              <div style={{fontSize:11,fontWeight:700,color:(data.solde-(cetTransfere?.total||0)-(maladiePerte||0))<5?"#dc2626":"#334155"}}>Restant</div>
              <div style={{fontSize:20,fontWeight:900,color:(data.solde-(cetTransfere?.total||0)-(maladiePerte||0))<5?"#dc2626":"#16a34a"}}>{data.solde-(cetTransfere?.total||0)-(maladiePerte||0)}</div>
            </div>
            <div style={{flex:1,background:refusData.total>0?"#fef2f2":"#f8fafc",borderRadius:10,padding:"10px 8px",textAlign:"center",border:`1px solid ${refusData.total>0?"#fecaca":"#e2e8f0"}`}}>
              <div style={{fontSize:11,fontWeight:700,color:refusData.total>0?"#991b1b":"#334155"}}>Refusés</div>
              <div style={{fontSize:20,fontWeight:900,color:refusData.total>0?"#dc2626":"#94a3b8"}}>{refusData.total}</div>
            </div>
          </div>

          {/* Récap CET (Phase 4, 06/08) : jours de Congés transférés au CET —
              jamais écrit dans le planning perso, purement un rappel (voir
              CetView.jsx, getCetTransfereJours). */}
          {cetTransfere && cetTransfere.total>0 && (
            <div style={{fontSize:11,fontWeight:600,color:"#5b21b6",background:"#faf5ff",border:"1px solid #e9d5ff",borderRadius:8,padding:"8px 10px"}}>
              🏦 {cetTransfere.total} jour{cetTransfere.total>1?"s":""} transféré{cetTransfere.total>1?"s":""} au CET
              {cetTransfere.parSousCompte.courant>0 && ` — Compte courant : ${cetTransfere.parSousCompte.courant}j`}
              {cetTransfere.parSousCompte.finActivite>0 && ` — Compte fin d'activité : ${cetTransfere.parSousCompte.finActivite}j`}
            </div>
          )}

          {/* Perte maladie (14/08) : jours de Congés perdus suite à un arrêt
              maladie — jamais écrit dans le planning perso, purement un rappel
              en lecture seule (voir getMaladiePerteJours). Gérée exclusivement
              depuis le module Maladie. */}
          {maladiePerte>0 && (
            <div style={{fontSize:11,fontWeight:600,color:"#b91c1c",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 10px"}}>
              🤒 {maladiePerte} jour{maladiePerte>1?"s":""} perdu{maladiePerte>1?"s":""} suite à un arrêt maladie — gestion depuis le module Maladie.
            </div>
          )}

          {/* Épargner directement au CET depuis Congés (07/08, demandé par
              Olivier) — widget partagé, voir CetView.jsx EpargneCetWidget. */}
          <EpargneCetWidget agent={agent} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} source="CA" sourceLabel="mes congés" year={year} besoinValeur={false}/>

          {/* Solde théorique (06/08, étendu le 13/08 aux demandes reportées) :
              projection "si toutes les demandes en attente sont accordées" —
              visible dès qu'il y a des demandes en cours (locales OU
              reportées vers {year+1}, voir demandesReportees), jamais affecté
              par les refus. */}
          {(data.demandes.length+(data.demandesReportees||[]).length)>0 && (
            <div style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:10,padding:"9px 12px",fontSize:11.5,fontWeight:600,color:"#1e40af"}}>
              ⏳ {data.demandes.length+(data.demandesReportees||[]).length} jour{(data.demandes.length+(data.demandesReportees||[]).length)>1?"s":""} en attente d'accord — solde théorique si tout accordé : <strong style={{color:data.soldeTheorique<0?"#dc2626":"#1e40af",fontSize:13}}>{data.soldeTheorique}</strong>
            </div>
          )}

          {/* Jours pris jusqu'à une date choisie (aujourd'hui par défaut) */}
          <div style={{background:"#fefce8",border:"1.5px solid #fde68a",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:140}}>
              <div style={{fontSize:11,fontWeight:700,color:"#334155"}}>Pris jusqu'au</div>
              <input type="date" value={dateSnapshot} onChange={e=>setDateSnapshot(e.target.value)}
                style={{marginTop:3,padding:"5px 8px",border:"1.5px solid #fde68a",borderRadius:7,fontSize:12,fontWeight:600,color:"#334155",background:"#fff"}}/>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:900,color:"#a16207",lineHeight:1}}>{prisJusquA}</div>
              <div style={{fontSize:9,fontWeight:600,color:"#334155",marginTop:2}}>jour{prisJusquA>1?"s":""}</div>
            </div>
          </div>

          {/* Détail mensuel */}
          {moisTries.length===0 ? (
            <div style={{fontSize:12,color:"#475569",textAlign:"center",padding:12}}>Aucun congé accordé cette année.</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {moisTries.map(mois=>{
                const m = data.parMois[mois];
                const moisNum = parseInt(mois.slice(5,7),10)-1;
                const anneeMois = mois.slice(0,4);
                return(
                  <div key={mois} style={{border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 12px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>
                        {MOIS_L[moisNum]}{m.horsAnnee?` ${anneeMois}`:""}
                      </span>
                      <span style={{fontSize:12,fontWeight:700,color:"#a16207"}}>
                        {m.dates.length}j
                      </span>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>
                      {m.dates.map(d=>(
                        <span key={d} style={{fontSize:10,fontWeight:600,color:"#475569",background:"#f8fafc",borderRadius:5,padding:"2px 5px",display:"inline-flex",alignItems:"center",gap:3}}>
                          {fmtDate(d)}
                          <button onClick={()=>annulerAccord(d)} title="Annuler ce congé accordé" style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:10,fontWeight:800,padding:0,lineHeight:1}}>✕</button>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}


          {data.donnesAnneePrecedente.length>0 && (
            <div style={{fontSize:11,fontWeight:500,color:"#334155",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px"}}>
              ℹ️ {data.donnesAnneePrecedente.length} jour{data.donnesAnneePrecedente.length>1?"s":""} de {year} compté{data.donnesAnneePrecedente.length>1?"s":""} sur le solde {year-1} (report) — non inclus ci-dessus. Voir le tableau de bord {year-1}.
            </div>
          )}

          {/* Nouvelle demande : jour unique ou période (date de fin optionnelle) */}
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8}}>+ Nouvelle demande</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <div style={{flex:"1 1 120px"}}>
                <div style={{fontSize:9,fontWeight:600,color:"#94a3b8",marginBottom:2}}>Du</div>
                <input type="date" value={nouvelleDateDebut} onChange={e=>{setNouvelleDateDebut(e.target.value);setAjoutErr("");setAjoutInfo("");}}
                  style={{width:"100%",padding:"7px 9px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
              </div>
              <div style={{flex:"1 1 120px"}}>
                <div style={{fontSize:9,fontWeight:600,color:"#94a3b8",marginBottom:2}}>Au (optionnel)</div>
                <input type="date" value={nouvelleDateFin} onChange={e=>{setNouvelleDateFin(e.target.value);setAjoutErr("");setAjoutInfo("");}}
                  style={{width:"100%",padding:"7px 9px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
              </div>
              <button onClick={ajouterDemande} style={{alignSelf:"flex-end",background:"#a16207",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Ajouter</button>
            </div>
            {ajoutErr && <div style={{fontSize:11,fontWeight:600,color:"#dc2626",marginTop:6}}>{ajoutErr}</div>}
            {ajoutInfo && <div style={{fontSize:11,fontWeight:600,color:"#166534",marginTop:6}}>{ajoutInfo}</div>}
            <div style={{fontSize:10,color:"#94a3b8",marginTop:5}}>Laisse "Au" vide pour un seul jour. Un congé demandé n'apparaît pas dans le planning perso tant qu'il n'est pas accordé — la journée prévue reste affichée et comptée normalement.</div>
            <div style={{fontSize:10,color:"#94a3b8",marginTop:6,display:"flex",alignItems:"center",gap:6}}>
              <span style={{background:"#eab308",color:"#1e293b",border:"1.5px dashed #1e293b",borderRadius:5,padding:"1px 6px",fontSize:10,fontWeight:700,flexShrink:0}}>⏳ CA (n°X)</span>
              <span>= badge visible dans le planning tant que le congé n'est pas accordé.</span>
            </div>
          </div>

          {/* Demandées */}
          <div>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8}}>⏳ Demandées ({data.demandes.length})</div>
            {data.demandes.length===0 ? <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Aucune demande en attente.</div> :
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {demandesParMois.map(({mois,items})=>{
                  const moisNum = parseInt(mois.slice(5,7),10)-1;
                  const anneeMois = mois.slice(0,4);
                  const horsAnnee = anneeMois!==String(year);
                  return (
                    <div key={mois}>
                      <div style={{fontSize:11,fontWeight:800,color:"#a16207",marginBottom:6,textTransform:"uppercase",letterSpacing:.3}}>
                        {MOIS_L[moisNum]}{horsAnnee?` ${anneeMois}`:""} · {items.length}j
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:7}}>
                        {items.map(e=>(
                          <div key={e.date} style={{border:"1px solid #e2e8f0",borderRadius:9,padding:"9px 11px",display:"flex",flexDirection:"column",gap:6}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                              <span style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>{fmtDate(e.date)}</span>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                <button onClick={()=>accorderDemande(e.date)} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>✓ Accorder</button>
                                <button onClick={()=>refuserDemande(e.date)} style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>✕ Refuser</button>
                                <button onClick={()=>retirerDemande(e.date)} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:11,fontWeight:700,textDecoration:"underline"}}>🗑 Retirer</button>
                              </div>
                            </div>
                            {e.dateDemande && <div style={{fontSize:10,color:"#64748b",fontWeight:600}}>Demandé le {fmtDate(e.dateDemande)}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>}
          </div>

          {/* Refusées — regroupées par période consécutive (visuel uniquement,
              voir groupRefusEnPeriodes), fusionné avec l'ancien suivi des
              refus/talon (05/08, était un second popup imbriqué avant) */}
          <div>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8}}>❌ Refusées ({refusData.total} jour{refusData.total>1?"s":""})</div>

            {refusData.sansTalon>0 && (
              <div style={{fontSize:11,fontWeight:600,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"9px 11px",marginBottom:10}}>
                💡 Pense à demander ton talon de refus pour {refusData.sansTalon===1?"le jour refusé":`les ${refusData.sansTalon} jours refusés`} sans talon en cours.
              </div>
            )}

            <div style={{marginBottom:10}}>
              <button onClick={()=>setShowAjoutRefus(v=>!v)} style={{background:"none",border:"none",color:"#991b1b",cursor:"pointer",fontSize:11,fontWeight:700,padding:0,display:"flex",alignItems:"center",gap:4}}>
                {showAjoutRefus?"▴":"▾"} + Nouveau refus (saisie directe)
              </button>
              {showAjoutRefus && (
                <div style={{marginTop:8}}>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <div style={{flex:"1 1 120px"}}>
                      <div style={{fontSize:9,fontWeight:600,color:"#94a3b8",marginBottom:2}}>Du</div>
                      <input type="date" value={refusDateDebut} onChange={e=>{setRefusDateDebut(e.target.value);setRefusErr("");setRefusInfo("");}}
                        style={{width:"100%",padding:"7px 9px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                    </div>
                    <div style={{flex:"1 1 120px"}}>
                      <div style={{fontSize:9,fontWeight:600,color:"#94a3b8",marginBottom:2}}>Au (optionnel)</div>
                      <input type="date" value={refusDateFin} onChange={e=>{setRefusDateFin(e.target.value);setRefusErr("");setRefusInfo("");}}
                        style={{width:"100%",padding:"7px 9px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                    </div>
                    <button onClick={ajouterRefus} style={{alignSelf:"flex-end",background:"#991b1b",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Ajouter</button>
                  </div>
                  {refusErr && <div style={{fontSize:11,fontWeight:600,color:"#dc2626",marginTop:6}}>{refusErr}</div>}
                  {refusInfo && <div style={{fontSize:11,fontWeight:600,color:"#166534",marginTop:6}}>{refusInfo}</div>}
                  <div style={{fontSize:10,color:"#94a3b8",marginTop:5}}>Laisse "Au" vide pour un seul jour. N'écrit rien dans le planning perso — un refus est juste un suivi personnel.</div>
                </div>
              )}
            </div>

            {periodesRefus.length===0 ? <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Aucune.</div> :
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {periodesRefusParMois.map(({mois,items})=>{
                  const moisNum = parseInt(mois.slice(5,7),10)-1;
                  const anneeMois = mois.slice(0,4);
                  const horsAnnee = anneeMois!==String(year);
                  const joursDuMois = items.reduce((s,p)=>s+p.jours.length,0);
                  return (
                    <div key={mois}>
                      <div style={{fontSize:11,fontWeight:800,color:"#991b1b",marginBottom:6,textTransform:"uppercase",letterSpacing:.3}}>
                        {MOIS_L[moisNum]}{horsAnnee?` ${anneeMois}`:""} · {joursDuMois}j
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:7}}>
                        {items.map(p=>{
                          const isMulti = p.jours.length>1;
                          const key = p.debut;
                          const ouverte = !!periodesOuvertes[key];
                          const badgeStyle = p.talonResume==="recu" ? {color:"#166534",background:"#dcfce7"}
                            : p.talonResume==="mixte" ? {color:"#92400e",background:"#fef3c7"}
                            : {color:"#64748b",background:"#f1f5f9"};
                          const badgeLabel = p.talonResume==="recu" ? "✓ Talon reçu"
                            : p.talonResume==="mixte" ? `Talon ${p.recus}/${p.jours.length} reçus`
                            : "Talon non demandé";
                          return (
                            <div key={key} style={{border:"1px solid #fecaca",background:"#fef2f2",borderRadius:9,padding:"9px 11px"}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                <div>
                                  <div style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>{fmtPeriodeLabel(p)}</div>
                                  <div style={{fontSize:10,color:"#64748b",fontWeight:600}}>{p.jours.length} jour{p.jours.length>1?"s":""} refusé{p.jours.length>1?"s":""}</div>
                                </div>
                                <span style={{fontSize:10,fontWeight:700,borderRadius:6,padding:"3px 8px",...badgeStyle}}>{badgeLabel}</span>
                              </div>
                              <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap",alignItems:"center"}}>
                                {isMulti && p.sansStatut>0 &&
                                  <button onClick={()=>demanderTalonPeriode(p.jours)} style={{background:"#f1f5f9",color:"#475569",border:"1px solid #cbd5e1",borderRadius:7,padding:"4px 9px",cursor:"pointer",fontSize:10,fontWeight:700}}>
                                    📋 Demander le talon{p.talonResume==="mixte"?" restant":""}
                                  </button>}
                                {isMulti &&
                                  <button onClick={()=>setPeriodesOuvertes(prev=>({...prev,[key]:!ouverte}))} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:10,fontWeight:700,textDecoration:"underline"}}>
                                    {ouverte?"▴ Réduire":"▾ Détailler jour par jour"}
                                  </button>}
                                <button onClick={()=>retirerRefus(p.jours.map(j=>j.date))} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:10,fontWeight:700,textDecoration:"underline"}}>🗑 Retirer</button>
                              </div>
                              {!isMulti && (
                                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",borderTop:"1px dashed #fecaca",marginTop:8,paddingTop:8}}>
                                  {renderTalonBtns(p.jours[0])}
                                </div>
                              )}
                              {ouverte && isMulti && (
                                <div style={{marginTop:9,paddingTop:9,borderTop:"1px dashed #fecaca",display:"flex",flexDirection:"column",gap:7}}>
                                  {p.jours.map(j=>(
                                    <div key={j.date} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                      <span style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{fmtDate(j.date)}</span>
                                      <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>{renderTalonBtns(j)}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>}
          </div>

          {/* Reports vers l'année suivante */}
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:6}}>↪️ Report sur {year+1}</div>
            <div style={{fontSize:10,fontWeight:500,color:"#475569",marginBottom:8}}>
              Un jour de congé pris sur {year+1} mais décompté du solde {year} (tolérance de report). Peut être ajouté dès la demande (⏳), pas besoin d'attendre l'accord — le solde théorique en tient compte tout de suite.
            </div>
            {(data.reports.length>0 || (data.demandesReportees||[]).length>0) && (
              <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:8}}>
                {data.reports.map(d=>(
                  <div key={d} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f8fafc",borderRadius:7,padding:"5px 9px"}}>
                    <span style={{fontSize:11,fontWeight:600,color:"#334155"}}>✓ {fmtDate(d)}</span>
                    <button onClick={()=>retirerReport(d)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:12,fontWeight:700}}>✕ Retirer</button>
                  </div>
                ))}
                {(data.demandesReportees||[]).map(d=>(
                  <div key={d} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fffbeb",border:"1px dashed #fde68a",borderRadius:7,padding:"5px 9px"}}>
                    <span style={{fontSize:11,fontWeight:600,color:"#92400e"}}>⏳ {fmtDate(d)} — en attente d'accord</span>
                    <button onClick={()=>retirerReport(d)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:12,fontWeight:700}}>✕ Retirer</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:6}}>
              <input type="date" value={reportDate} onChange={e=>{setReportDate(e.target.value);setReportErr("");}}
                style={{flex:1,padding:"7px 9px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
              <button onClick={ajouterReport} style={{background:"#a16207",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Ajouter</button>
            </div>
            {reportErr && <div style={{fontSize:11,fontWeight:600,color:"#dc2626",marginTop:6}}>{reportErr}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SUIVI DES REFUS DE CONGÉS (Phase 4 refonte Congés, 15/07 — fusionné dans
// le popup Congés principal le 05/08, n'est plus un second popup imbriqué) ──
// Réutilise la même donnée (agentProfiles[agentId].congesDemandes, statut
// "refuse") déjà écrite par le bouton "✕ Refuser" du tableau de bord Congés,
// mais permet AUSSI une saisie directe (jour unique ou période) sans passer
// par une demande préalable — un refus peut être enregistré rétroactivement,
// sans que l'agent ait forcément fait sa demande depuis l'appli. Même règle
// de détachement auto que Phase 3 : un jour dont le planning perso contient
// déjà un code quelconque est ignoré (suivi périmé). Suivi du "talon de
// refus" par jour : aucun état → demandé → reçu, ou demandé → jamais reçu
// (état d'alerte). Portée strictement personnelle (chaque agent ne voit que
// son propre suivi) — l'agrégat anonymisé tous agents est une phase à part
// (Phase 5, backend, pas encore construite, voir CLAUDE.md).
function computeRefusConges(agent, schedule, agentProfiles, year){
  const profil = agentProfiles?.[agent?.id] || {};
  const tracking = profil.congesDemandes || {};
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const refus = [];
  Object.entries(tracking).forEach(([d,t])=>{
    if(!t) return; // entree supprimee (tombstone JSON_MERGE_PATCH : null, pas absente)
    if(t.statut!=="refuse") return;
    if(d<start||d>end) return;
    const entree = schedule[`${agent.id}-${d}`];
    const codeActuel = entree?.equipe || entree?.equipe2;
    const estAccorde = entree?.equipe==="CA"||entree?.equipe==="CP"||entree?.equipe2==="CA"||entree?.equipe2==="CP";
    if(estAccorde) return; // accorde entre-temps (typé directement CA/CP dans le planning)
    if(t.jourEtaitVide && codeActuel) return; // etait vide au refus, rempli depuis par autre chose -> perime
    refus.push({
      date:d, dateDemande:t.dateDemande||null, dateRefus:t.dateRefus||null,
      talonStatut:t.talonStatut||null, dateTalonDemande:t.dateTalonDemande||null, dateTalonRecu:t.dateTalonRecu||null,
    });
  });
  refus.sort((a,b)=>a.date<b.date?-1:1);
  const parMois = {};
  refus.forEach(r=>{
    const mois = r.date.slice(0,7);
    if(!parMois[mois]) parMois[mois]=[];
    parMois[mois].push(r);
  });
  return { refus, parMois, total: refus.length, sansTalon: refus.filter(r=>!r.talonStatut).length };
}

// Regroupe une liste d'items par mois (tri mensuel, 06/08 — demande d'Olivier
// pour la clarte des listes Demandees/Refusees) — purement un regroupement
// d'affichage, aucun changement de la donnee sous-jacente. getDate extrait la
// date ISO (YYYY-MM-DD) de chaque item (le champ differe selon la liste : .date
// pour une demande, .debut pour une periode de refus deja regroupee).
function groupParMois(items, getDate){
  const map = {};
  items.forEach(it=>{
    const mois = getDate(it).slice(0,7);
    (map[mois]=map[mois]||[]).push(it);
  });
  return Object.keys(map).sort().map(mois=>({mois, items:map[mois]}));
}

// Regroupe les jours refuses consecutifs (calendrier) en periodes pour
// l'affichage uniquement — la donnee stockee (congesDemandes) reste une
// entree independante par date (avec son propre talonStatut), ce
// regroupement ne change RIEN en base ni au calcul du solde Conges/Bilan
// Global — refus doit deja etre trie par date croissante (voir
// computeRefusConges ci-dessus).
function groupRefusEnPeriodes(refus){
  const periodes = [];
  let courante = null;
  refus.forEach(r=>{
    if(courante){
      const dernier = courante.jours[courante.jours.length-1];
      const diffJours = Math.round((new Date(r.date+"T12:00:00") - new Date(dernier.date+"T12:00:00"))/86400000);
      if(diffJours===1){ courante.jours.push(r); return; }
    }
    courante = { jours:[r] };
    periodes.push(courante);
  });
  return periodes.map(p=>{
    const jours = p.jours;
    const recus = jours.filter(j=>j.talonStatut==="recu").length;
    const sansStatut = jours.filter(j=>!j.talonStatut).length;
    let talonResume;
    if(recus===jours.length) talonResume = "recu";
    else if(sansStatut===jours.length) talonResume = "aucun";
    else talonResume = "mixte";
    return { debut:jours[0].date, fin:jours[jours.length-1].date, jours, recus, sansStatut, talonResume };
  });
}

// ─── PAUSE FIGÉE → COMPTEUR TC (solde en heures/minutes) ────────────────────
// Refonte du 17/07, puis re-précisée le même jour après retours d'Olivier :
// le solde TC/TY/RN n'est PLUS lié automatiquement aux jours détectés dans le
// planning perso (découplage total demandé) — seules les pauses figées
// validées continuent de créditer automatiquement le TC (+1h30, plafonné à
// 32h00). Tout le reste (TC/TY/RN) ne bouge que par saisie manuelle de
// l'agent, sous forme d'un JOURNAL d'ajustements datés par mois (pas un
// simple "solde de départ" unique) — et **sans remise à zéro annuelle** :
// "c'est suivi en permanence" (mots d'Olivier). Le compteur de JOURS pris
// (détecté depuis le planning perso) reste lui annuel et purement informatif,
// complètement indépendant du solde en heures.
const TC_MIN_PAUSE   = 90;   // 1h30 créditées par pause figée validée
// 32h00 — plafond partagé par TC (déjà en place) et TY (13/08, Olivier :
// "le compteur ty a le meme plafont de 32h00 que le tc. il faut mettre le
// meme mecanisme avec le paiement aumatatique au dela") — au-delà, le
// surplus n'est jamais ajouté au solde (à payer automatiquement/vérifier
// en heures sup).
export const PLAFOND_32H_MIN = 1920;
const TC_PLAFOND_MIN = PLAFOND_32H_MIN; // alias historique, TC préexistant

// Solde en heures/minutes d'un journal d'ajustements manuels (utilisé par
// TC/TY/RN) — pas de notion d'année : simple somme de tous les ajustements
// jamais saisis, chacun tagué avec un mois pour repère/tri, mais qui
// n'affecte jamais le calcul lui-même (pas de remise à zéro).
// plafondMin (optionnel, 13/08 — TY uniquement, RN reste sans plafond) :
// si fourni, rejoue le ledger en ordre chronologique RÉEL (saisiLe, pas le
// tri d'affichage par mois) et plafonne le solde cumulé — un ajout qui
// dépasserait le plafond n'est crédité que jusqu'au plafond, l'excédent est
// remonté dans horsPlafond (même principe que le plafond TC sur les pauses
// figées, computeDashboardTC) ; un retrait (delta négatif) n'est lui jamais
// plafonné.
// cutoffDate (21/08, module FIM — Fiche Individuelle Mensuelle) : optionnel,
// "YYYY-MM-DD" — ne prend en compte que les entrées dont le MOIS choisi par
// l'agent (champ "mois", pas saisiLe) est à cette date ou avant, pour
// reconstituer le solde tel qu'il était à la fin d'un mois passé. Corrigé le
// 21/08 (Olivier : "quand je charge la situation a fin mars tout les
// compteurs de rn, ty, tq sont a 0 [...] jai mis a jour janvier, avril et
// mai. donc juin a 0 c'est pas possible") : filtrer sur saisiLe (la date
// RÉELLE où l'agent a cliqué "ajouter") cassait tout rattrapage a posteriori
// — un ajustement "saisi aujourd'hui" pour le mois de janvier a un saisiLe
// d'aujourd'hui, largement après la fin mars, donc exclu à tort d'un rapport
// de mars alors qu'il représente bel et bien janvier. Même principe déjà
// utilisé (et correct) par computeDashboardTC juste plus bas, qui dérive
// toujours sa date de tri/coupure du champ "mois", jamais de saisiLe.
// Omis = comportement inchangé (solde courant, tous les 10+ appels existants
// ne passent pas ce paramètre).
export function computeLedgerSolde(agentProfiles, agentId, ledgerKey, plafondMin, cutoffDate){
  let ledger = agentProfiles?.[agentId]?.[ledgerKey] || [];
  const moisDate = e => (e.mois||"0000-00")+"-01";
  if(cutoffDate) ledger = ledger.filter(e=>moisDate(e)<=cutoffDate);
  const dernierSaisiLe = ledger.reduce((max,e)=> (!max || (e.saisiLe||"")>max) ? e.saisiLe : max, null);
  const trie = [...ledger].sort((a,b)=>(b.mois||"").localeCompare(a.mois||"") || (b.saisiLe||"").localeCompare(a.saisiLe||""));
  if(plafondMin==null){
    const solde = ledger.reduce((s,e)=>s+(e.deltaMinutes||0), 0);
    return { solde, ledger: trie, dernierSaisiLe, horsPlafond: 0 };
  }
  const chrono = [...ledger].sort((a,b)=>moisDate(a).localeCompare(moisDate(b)) || (a.saisiLe||"").localeCompare(b.saisiLe||""));
  let solde = 0, horsPlafond = 0;
  chrono.forEach(e=>{
    const delta = e.deltaMinutes||0;
    if(delta>0){
      const place = Math.max(0, plafondMin - solde);
      const ajoute = Math.min(delta, place);
      solde += ajoute;
      horsPlafond += (delta - ajoute);
    } else {
      solde += delta;
    }
  });
  return { solde, ledger: trie, dernierSaisiLe, horsPlafond };
}

// Semestre civil (S1 = janvier-juin, S2 = juillet-décembre) — nouveau (16/08,
// module TQ) : aucun concept de semestre n'existait dans l'appli avant, ne
// réutilise pas rollingAcquis (spécifique au modèle acquis-par-année de RQ,
// un mécanisme différent du ledger continu utilisé ici).
export function getSemestreCourant(dateStr){
  const d = dateStr ? new Date(dateStr+"T12:00:00") : new Date();
  const annee = d.getFullYear();
  const numero = (d.getMonth() < 6) ? 1 : 2;
  return { annee, numero, label: `S${numero} ${annee}` };
}

// Bascule le solde TQ courant vers TY (plafonné à 32h00, PLAFOND_32H_MIN) —
// jamais automatique, déclenché par l'agent depuis le module TQ. Écrit 2
// entrées ledger liées par un même transfertId (annulable via
// annulerTransfertTQ ci-dessous) + une ligne d'archive dans tqTransferts. Le
// surplus au-delà du plafond TY n'est écrit nulle part comme un mouvement
// d'heures — c'est un vrai paiement en paie, hors du système d'heures de
// l'appli — juste gardé dans tqTransferts pour affichage/archivage.
function basculerTQversTY(agentProfiles, agentId, setAgentProfiles){
  const tq = computeLedgerSolde(agentProfiles, agentId, "tqLedger");
  const soldeTQ = tq.solde;
  if(soldeTQ<=0) return null;
  const ty = computeLedgerSolde(agentProfiles, agentId, "tyLedger", PLAFOND_32H_MIN);
  const placeDisponible = Math.max(0, PLAFOND_32H_MIN - ty.solde);
  const montantVersTY = Math.min(soldeTQ, placeDisponible);
  const montantPaye = soldeTQ - montantVersTY;
  const transfertId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const aujourdhui = new Date().toISOString().slice(0,10);
  const mois = aujourdhui.slice(0,7);
  const { annee, numero } = getSemestreCourant();
  const semestre = `${annee}-S${numero}`;
  setAgentProfiles(prev=>{
    const p = prev[agentId] || {};
    const tqLedger = [...(p.tqLedger||[]), { id:`${transfertId}-tq`, mois, deltaMinutes:-soldeTQ, saisiLe:aujourdhui, note:"transfert", transfertId }];
    const tyLedger = montantVersTY>0
      ? [...(p.tyLedger||[]), { id:`${transfertId}-ty`, mois, deltaMinutes:montantVersTY, saisiLe:aujourdhui, note:"transfert_tq", transfertId }]
      : (p.tyLedger||[]);
    const tqTransferts = [...(p.tqTransferts||[]), { id:transfertId, semestre, dateTransfert:aujourdhui, montantVersTY, montantPaye }];
    return { ...prev, [agentId]: { ...p, tqLedger, tyLedger, tqTransferts } };
  });
  return { montantVersTY, montantPaye };
}

// Annule un basculement TQ→TY : retire les 2 entrées ledger liées par
// transfertId + la ligne d'archive — solde TQ et TY reviennent exactement à
// leur état d'avant, sans limite de délai (même principe que "Annuler" sur
// Congés/CET, qui n'a pas non plus de délai).
function annulerTransfertTQ(agentProfiles, agentId, transfertId, setAgentProfiles){
  setAgentProfiles(prev=>{
    const p = prev[agentId] || {};
    return {
      ...prev,
      [agentId]: {
        ...p,
        tqLedger: (p.tqLedger||[]).filter(e=>e.transfertId!==transfertId),
        tyLedger: (p.tyLedger||[]).filter(e=>e.transfertId!==transfertId),
        tqTransferts: (p.tqTransferts||[]).filter(t=>t.id!==transfertId),
      }
    };
  });
}

function minToHM(min){
  const neg = min < 0;
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs/60), m = abs%60;
  return `${neg?"-":""}${h}h${String(m).padStart(2,'0')}`;
}

// Rappel du planning perso pour une date donnée (ex: "Matinée · CCL") — relu
// EN DIRECT depuis schedule à chaque affichage, jamais stocké : si l'agent
// complète une case vide après coup, le rappel se met à jour tout seul.
export function getPlanningRappel(schedule, agCp, date){
  const v = schedule?.[`${agCp}-${date}`];
  if(!v || (!v.equipe && !v.equipe2)) return null;
  const OMIS = ["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","DISPO","NU","TC","TY","RN","JF"];
  const describe = (code) => {
    if(!code) return null;
    const label = EQ_COLORS[code]?.label || code;
    const poste = v.jsCode && !OMIS.includes(v.jsCode) ? (getPosteLabelFromCode(v.jsCode)||v.jsCode) : null;
    return poste ? `${label} · ${poste}` : label;
  };
  const parts = [describe(v.equipe), describe(v.equipe2)].filter(Boolean);
  return parts.length ? [...new Set(parts)].join(" + ") : null;
}

// Export planning perso en .ics (22/08, Olivier : "est que tu pense qu'il
// est possible d'exporter le perso pour pouvoir l'importer dans un autre
// agenda genre google ?" puis "export par mois et annee. et faut qu'on
// puisse trouver la methode export import"). iCalendar (.ics) est le format
// standard reconnu nativement en import direct par Google Calendar/Outlook/
// Apple Calendar — génération 100% côté navigateur, aucun backend
// nécessaire. `libelleJourExport` reprend le même principe que
// `getPlanningRappel` ci-dessus (rejoué à chaque export depuis `schedule`,
// jamais stocké), mais en substituant le vrai nom d'une fête (ex. "Lundi de
// Pâques") à son seul code, et en ajoutant Formation/Grève — deux champs
// indépendants (voir modules Formation et Grève) que getPlanningRappel ne
// couvre pas puisqu'ils ne vivent jamais dans equipe/equipe2. La note perso
// (`notePerso`) reste volontairement exclue : c'est une donnée privée par
// nature, elle n'a pas vocation à partir dans un agenda externe.
const GREVE_LABELS_EXPORT = { DA:"01h00 grève", DB:"1/2 journée grève", DC:"Journée grève" };
function libelleJourExport(schedule, agCp, date){
  const v = schedule?.[`${agCp}-${date}`];
  if(!v) return null;
  const OMIS = ["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","DISPO","NU","TC","TY","RN","JF","CET"];
  const describe = (code, jsCode) => {
    if(!code) return null;
    if(CODES_FETES[code]) return CODES_FETES[code];
    const label = EQ_COLORS[code]?.label || code;
    const poste = jsCode && !OMIS.includes(jsCode) ? (getPosteLabelFromCode(jsCode)||jsCode) : null;
    return poste ? `${label} · ${poste}` : label;
  };
  const parts = [describe(v.equipe, v.jsCode), describe(v.equipe2, v.jsCode2)].filter(Boolean);
  let s = [...new Set(parts)].join(" + ");
  if(v.formation) s = (s?s+" + ":"")+`🎓 Formation : ${v.formation}`;
  if(v.greve) s = (s?s+" + ":"")+`✊ ${GREVE_LABELS_EXPORT[v.greve]||v.greve}`;
  return s || null;
}
function icsEscape(s){ return String(s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n"); }
function icsDate(dateKey){ return dateKey.replace(/-/g,""); }
function icsNextDay(dateKey){
  const d=new Date(dateKey+"T12:00:00");
  d.setDate(d.getDate()+1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
// Parse "06h10–14h17" (ou "22h15–06h17", qui traverse minuit pour la Nuit)
function icsParseHoraires(heures){
  const m=/^(\d{2})h(\d{2})[\u2013-](\d{2})h(\d{2})$/.exec(heures||"");
  if(!m) return null;
  const [,h1,m1,h2,m2]=m.map((x,i)=>i===0?x:+x);
  return { h1,m1,h2,m2, traverseMinuit: (h2*60+m2)<=(h1*60+m1) };
}
function genererICS(agent, schedule, joursTries){
  const lignes=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//F2P.PMP//Export planning//FR","CALSCALE:GREGORIAN"];
  const now=new Date();
  const p2=n=>String(n).padStart(2,"0");
  const dtstamp=`${now.getUTCFullYear()}${p2(now.getUTCMonth()+1)}${p2(now.getUTCDate())}T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`;
  const agCp=agent.immatriculation||agent.cp||agent.id;
  joursTries.forEach(date=>{
    const summary=libelleJourExport(schedule, agCp, date);
    if(!summary) return;
    const v=schedule[`${agCp}-${date}`];
    const horaires=["M","AM","N","J"].includes(v.equipe) ? icsParseHoraires(EQ_COLORS[v.equipe]?.heures) : null;
    lignes.push("BEGIN:VEVENT");
    lignes.push(`UID:f2ppmp-${agCp}-${date}@f2p-pmp`);
    lignes.push(`DTSTAMP:${dtstamp}`);
    lignes.push(`SUMMARY:${icsEscape(summary)}`);
    if(horaires){
      const jourFin=horaires.traverseMinuit ? icsNextDay(date) : date;
      lignes.push(`DTSTART:${icsDate(date)}T${p2(horaires.h1)}${p2(horaires.m1)}00`);
      lignes.push(`DTEND:${icsDate(jourFin)}T${p2(horaires.h2)}${p2(horaires.m2)}00`);
    } else {
      lignes.push(`DTSTART;VALUE=DATE:${icsDate(date)}`);
      lignes.push(`DTEND;VALUE=DATE:${icsDate(icsNextDay(date))}`);
    }
    lignes.push("END:VEVENT");
  });
  lignes.push("END:VCALENDAR");
  return lignes.join("\r\n");
}
function joursDuMois(year,month){
  const nb=new Date(year,month+1,0).getDate();
  return Array.from({length:nb},(_,i)=>dKey(year,month+1,i+1));
}
function joursDeLannee(year){
  let jours=[];
  for(let m=0;m<12;m++) jours=jours.concat(joursDuMois(year,m));
  return jours;
}
// joursEntre (24/08, demande d'Olivier : "une periode plus ou moins longue
// qui pourrait couvrir des mois en cours ou finir en cours de mois plus
// loin") -- periode libre Du/Au, en plus des 2 raccourcis "mois affiche" et
// "annee complete" deja existants, jamais limitee a des bornes de mois/annee.
function joursEntre(du,au){
  const jours=[];
  let d=new Date(du+"T12:00:00");
  const fin=new Date(au+"T12:00:00");
  while(d<=fin){
    jours.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
    d.setDate(d.getDate()+1);
  }
  return jours;
}
function ExportIcsButton({ agent, schedule, curMonth, curYear }){
  const [ouvert,setOuvert]=useState(false);
  const [periodeDu,setPeriodeDu]=useState("");
  const [periodeAu,setPeriodeAu]=useState("");
  const [periodeErr,setPeriodeErr]=useState("");
  const telecharger=(contenu,suffixeNom)=>{
    const blob=new Blob([contenu],{type:"text/calendar;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const nom=`${(agent.nom||"AGENT").toUpperCase()}_Planning_${suffixeNom}.ics`;
    const a=document.createElement("a");
    a.href=url; a.download=nom;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  return(<div style={{display:"flex",flexDirection:"column",gap:6}}>
    <button onClick={()=>setOuvert(o=>!o)} style={{display:"flex",alignItems:"center",gap:6,border:"1.5px solid #0f4c81",background:"#eff6ff",color:"#0f4c81",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:"clamp(12px,1.4vw,14px)",fontWeight:700,alignSelf:"flex-start"}}>
      📤 Exporter (.ics) {ouvert?"▴":"▾"}
    </button>
    {ouvert&&<div style={{border:"1.5px solid #e2e8f0",borderRadius:10,padding:12,display:"flex",flexDirection:"column",gap:8,background:"#fff"}}>
      <button onClick={()=>{telecharger(genererICS(agent,schedule,joursDuMois(curYear,curMonth)),`${MOIS_L[curMonth]}${curYear}`);setOuvert(false);}} style={{textAlign:"left",border:"1px solid #e2e8f0",background:"#f8fafc",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,color:"#1e293b",padding:"8px 10px"}}>📅 Mois affiché ({MOIS_L[curMonth]} {curYear})</button>
      <button onClick={()=>{telecharger(genererICS(agent,schedule,joursDeLannee(curYear)),`${curYear}`);setOuvert(false);}} style={{textAlign:"left",border:"1px solid #e2e8f0",background:"#f8fafc",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,color:"#1e293b",padding:"8px 10px"}}>🗓️ Année complète ({curYear})</button>

      {/* Période libre (24/08, demandé par Olivier) : Du/Au quelconques,
          jamais bornés à un mois ou une année civile entière — peut démarrer
          ou finir en plein milieu d'un mois, sur plusieurs années. */}
      <div style={{borderTop:"1px solid #f1f5f9",paddingTop:8}}>
        <div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginBottom:6}}>🗂️ Période personnalisée</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <input type="date" value={periodeDu} onChange={e=>{setPeriodeDu(e.target.value);setPeriodeErr("");}}
            style={{flex:1,minWidth:120,padding:"7px 9px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
          <input type="date" value={periodeAu} onChange={e=>{setPeriodeAu(e.target.value);setPeriodeErr("");}}
            style={{flex:1,minWidth:120,padding:"7px 9px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
        </div>
        <button onClick={()=>{
            if(!periodeDu||!periodeAu){setPeriodeErr("Choisis les 2 dates.");return;}
            if(periodeAu<periodeDu){setPeriodeErr("La date de fin doit être après la date de début.");return;}
            telecharger(genererICS(agent,schedule,joursEntre(periodeDu,periodeAu)),`${periodeDu}_au_${periodeAu}`);
            setOuvert(false);setPeriodeDu("");setPeriodeAu("");
          }} style={{marginTop:6,width:"100%",textAlign:"center",border:"1px solid #0f4c81",background:"#eff6ff",color:"#0f4c81",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700,padding:"7px 10px"}}>📤 Télécharger cette période</button>
        {periodeErr && <div style={{fontSize:11,fontWeight:600,color:"#dc2626",marginTop:5}}>{periodeErr}</div>}
      </div>

      <div style={{fontSize:11,color:"#64748b",lineHeight:1.5,paddingTop:4,borderTop:"1px solid #f1f5f9"}}>
        <b>Pour l'importer dans Google Calendar</b> : sur agenda.google.com (ordi), ⚙️ Paramètres → "Importer et exporter" → "Importer" → choisis le fichier .ics téléchargé.<br/>
        <b>Sur iPhone (app Calendrier)</b> : ouvre le fichier .ics téléchargé → "Ajouter à..." → choisis ton agenda.
      </div>
    </div>}
  </div>);
}

// cutoffDate (21/08, module FIM) : optionnel, mêmes principe et raison que
// sur computeLedgerSolde ci-dessus — filtre à la fois les ajustements manuels
// (par saisiLe) ET les pauses figées validées (par date_jour) avant de rejouer
// le solde plafonné, pour reconstituer le solde TC tel qu'il était à la fin
// d'un mois passé. Omis = comportement inchangé.
export function computeDashboardTC(agent, schedule, agentProfiles, pausesData, year, cutoffDate){
  const agentId = agent?.id;
  const profil = agentProfiles?.[agentId] || {};
  const ledger = profil.tcLedger || [];

  // Jours TC pris : reste annuel et purement informatif (compteur de jours,
  // trié par mois) — complètement découplé du solde en heures ci-dessous.
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const joursTC = [];
  Object.entries(schedule||{}).forEach(([k,v])=>{
    if(!agent || !k.startsWith(agent.id+"-")) return;
    const dk = k.slice(agent.id.length+1);
    if(dk < start || dk > end) return;
    if(v?.equipe==="TC" || v?.equipe2==="TC") joursTC.push(dk);
  });
  joursTC.sort();
  const parMoisTC = {};
  joursTC.forEach(d=>{ const m=d.slice(0,7); (parMoisTC[m]=parMoisTC[m]||[]).push(d); });

  // Solde en heures : suivi en continu, PAS de remise à zéro annuelle. Rejoue
  // en ordre chronologique réel tous les ajustements manuels jamais saisis
  // (tagués par mois, pour repère seulement) et toutes les pauses figées
  // validées de tous les temps — le plafond de 32h dépend de cet ordre.
  //
  // moisEffectif (24/08, bug signalé par Olivier) : le crédit +1h30 doit
  // compter sur le MOIS DE CONSTATATION (mois_fia, choisi par l'agent quand
  // il vérifie que la pause est bien apparue quelque part — ex: une pause du
  // 12 janvier constatée en mars doit créditer TC en mars, pas en janvier).
  // Avant ce correctif, le classement chronologique (donc le mois où le
  // crédit "arrive" dans le solde, y compris pour la Fiche Individuelle
  // Mensuelle qui filtre par cutoffDate) se basait à tort sur date_jour (le
  // jour de la pause elle-même) plutôt que sur mois_fia. Repli sur le mois de
  // date_jour uniquement si mois_fia n'a jamais été renseigné (validation
  // ancienne, ou agent qui a coché "Vérifié" sans encore choisir de mois).
  const pausesValidees = (pausesData||[])
    .filter(p => p.fia_done)
    .map(p => {
      const dateJour = String(p.date_jour).slice(0,10);
      const moisEffectif = p.mois_fia ? String(p.mois_fia).slice(0,7) : dateJour.slice(0,7);
      return { dateJour, moisEffectif };
    });

  let evenements = [
    ...ledger.map(e=>({date:(e.mois||"0000-00")+"-01", type:"manuel", delta:e.deltaMinutes||0})),
    ...pausesValidees.map(p=>({date:p.moisEffectif+"-01", type:"pause_validee", dateJour:p.dateJour, moisEffectif:p.moisEffectif})),
  ].sort((a,b)=> a.date===b.date
    ? (a.type!==b.type ? (a.type<b.type?-1:1) : (a.dateJour||"").localeCompare(b.dateJour||""))
    : a.date.localeCompare(b.date));
  if(cutoffDate) evenements = evenements.filter(e=>e.date<=cutoffDate);

  let solde = 0;
  const detailPauses = {};
  evenements.forEach(ev=>{
    if(ev.type==="manuel"){
      solde += ev.delta;
    } else {
      const place = Math.max(0, TC_PLAFOND_MIN - solde);
      const ajoute = Math.min(TC_MIN_PAUSE, place);
      solde += ajoute;
      detailPauses[ev.dateJour] = {ajoute, horsPlafond: TC_MIN_PAUSE-ajoute, moisEffectif: ev.moisEffectif};
    }
  });

  const dernierSaisiLe = ledger.reduce((max,e)=> (!max || (e.saisiLe||"")>max) ? e.saisiLe : max, null);
  const ledgerTrie = [...ledger].sort((a,b)=>(b.mois||"").localeCompare(a.mois||"") || (b.saisiLe||"").localeCompare(a.saisiLe||""));

  return {
    solde, ledger: ledgerTrie, dernierSaisiLe,
    joursTC, nbJoursTC: joursTC.length, parMoisTC,
    detailPauses,
    totalHorsPlafond: Object.values(detailPauses).reduce((s,d)=>s+d.horsPlafond,0),
  };
}

// ─── COMPTEUR VT (temps partiel) ─────────────────────────────────────────────
// Refonte du 06/08 : VT suit désormais EXACTEMENT le même cycle que Congés
// (Accordé/Demandé/Refusé, voir computeDashboardConges) — "Demandé" et
// "Refusé" n'écrivent JAMAIS dans le planning perso (agentProfiles[agentId].
// vtTracking, statut "demande"/"refuse", même détachement auto que Congés).
// Seul "Accordé" écrit "VT" dans schedule, qui reste la SEULE source de
// vérité pour la bascule automatique Accordé→Pris selon la date (plus besoin
// d'un flag "accorde" séparé : présence dans schedule = accordé). Compat
// rétro : une ancienne entrée déjà écrite en VT avant cette refonte est donc
// automatiquement traitée comme accordée ici (brut fait foi).
export function computeDashboardVT(agent, schedule, agentProfiles, year){
  const profil = agentProfiles?.[agent?.id] || {};
  const entitlement = profil.vtEntitlement?.[year] ?? 0;
  const tracking = profil.vtTracking || {};

  const start = `${year}-01-01`, end = `${year}-12-31`;
  const brut = [];
  Object.entries(schedule).forEach(([k,v])=>{
    if(!agent || !k.startsWith(agent.id+"-")) return;
    const dk = k.slice(agent.id.length+1);
    if(dk < start || dk > end) return;
    if(v?.equipe==="VT" || v?.equipe2==="VT") brut.push(dk);
  });

  // Report A→A+1 : même principe que Congés/RP/RU (l'agent choisit une date
  // déjà posée en VT sur A+1, décomptée du solde de A plutôt que de A+1).
  const reportsCetteAnnee = profil.vtReports?.[year] || [];
  const reportsAnneePrecedente = profil.vtReports?.[year-1] || [];
  const donnesAnneePrecedente = brut.filter(d=>reportsAnneePrecedente.includes(d));
  const propresAnnee = brut.filter(d=>!reportsAnneePrecedente.includes(d));
  const reportsValides = reportsCetteAnnee.filter(d=>{
    const v = schedule[`${agent.id}-${d}`];
    return v?.equipe==="VT" || v?.equipe2==="VT";
  });
  const tousJours = [...propresAnnee, ...reportsValides].sort();

  const today = new Date().toISOString().slice(0,10);
  const entries = tousJours.map(d => ({
    date: d,
    statut: d <= today ? "pris" : "accorde",
    dateDemande: tracking[d]?.dateDemande || null,
  }));

  const parMois = {};
  tousJours.forEach(d=>{
    const mois = d.slice(0,7);
    if(!parMois[mois]) parMois[mois]=[];
    parMois[mois].push(d);
  });

  // Demandées / Refusées en attente (jamais dans schedule) — même filtrage
  // que computeDashboardConges : ignore les suivis périmés (détachement
  // auto) et tout jour déjà réellement accordé (présent dans brut).
  const demandes = [], refusees = [];
  Object.entries(tracking).forEach(([d,t])=>{
    if(!t) return;
    if(d<start||d>end) return;
    const entree = schedule[`${agent.id}-${d}`];
    const codeActuel = entree?.equipe || entree?.equipe2;
    if(t.jourEtaitVide && codeActuel) return;
    if(brut.includes(d)) return;
    if(t.statut==="demande") demandes.push({date:d, dateDemande:t.dateDemande||null});
    else if(t.statut==="refuse") refusees.push({date:d, dateDemande:t.dateDemande||null, dateRefus:t.dateRefus||null});
  });
  demandes.sort((a,b)=>a.date<b.date?-1:1);
  refusees.sort((a,b)=>a.date<b.date?-1:1);

  const pris = tousJours.length;
  const soldeTheorique = (entitlement-pris) - demandes.length;
  return {
    entitlement, pris, solde: entitlement-pris, soldeTheorique,
    parMois, tousJours, entries,
    demandes,
    accordeesAvenir: entries.filter(e=>e.statut==="accorde"),
    prises: entries.filter(e=>e.statut==="pris"),
    refusees,
    reports: reportsValides, donnesAnneePrecedente,
  };
}

function VtDashboardModal({ agent, schedule, setSchedule, agentProfiles, setAgentProfiles, year, availableYears, onYearChange, onClose }){
  const data = useMemo(()=>computeDashboardVT(agent, schedule, agentProfiles, year), [agent, schedule, agentProfiles, year]);
  const [entitlementInput, setEntitlementInput] = useState(String(data.entitlement));
  const [reportDate, setReportDate] = useState("");
  const [reportErr, setReportErr] = useState("");
  const [dateSnapshot, setDateSnapshot] = useState(()=>new Date().toISOString().slice(0,10));
  const [nouvelleDate, setNouvelleDate] = useState("");
  const [ajoutErr, setAjoutErr] = useState("");
  const [nouvelleDateRefus, setNouvelleDateRefus] = useState("");
  const [ajoutRefusErr, setAjoutRefusErr] = useState("");
  useEffect(()=>{ setEntitlementInput(String(data.entitlement)); },[data.entitlement]);

  const today = new Date().toISOString().slice(0,10);
  const agCp = agent?.immatriculation || agent?.cp || agent?.id;
  const fmtDate = (d)=> d ? new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";

  const prisJusquA = useMemo(()=>data.tousJours.filter(d=>d<=dateSnapshot).length, [data.tousJours, dateSnapshot]);

  const saveEntitlement = () => {
    const n = parseInt(entitlementInput,10);
    if(isNaN(n) || n<0) { setEntitlementInput(String(data.entitlement)); return; }
    setAgentProfiles(prev=>({
      ...prev,
      [agent.id]:{ ...(prev[agent.id]||{}), vtEntitlement:{ ...(prev[agent.id]?.vtEntitlement||{}), [year]: n } }
    }));
  };

  const ecrireVTDansPlanning = (date) => {
    const key = `${agCp}-${date}`;
    const entryExistante = schedule[key] || {};
    const fullEntry = {...entryExistante, equipe:"VT", prive:true};
    setSchedule(prev=>({...prev, [key]: fullEntry}));
    api.planning.saveEntry(agCp, date, fullEntry).catch(e=>console.error("Erreur sauvegarde VT dans planning:", e));
  };

  // Tombstone explicite (même raison que Congés : JSON_MERGE_PATCH ne supprime
  // une clé imbriquée que sur null explicite, jamais sur une absence).
  const retirerVtTracking = (date) => {
    setAgentProfiles(prev=>{
      const curr = {...(prev[agent.id]?.vtTracking||{})};
      curr[date] = null;
      return {...prev, [agent.id]:{...(prev[agent.id]||{}), vtTracking:curr}};
    });
  };

  // Nouvelle demande (06/08, même principe que Congés) : n'écrit JAMAIS dans
  // le planning perso — la journée prévue reste affichée et comptée
  // normalement tant que le VT n'est pas accordé.
  const ajouterDemande = () => {
    setAjoutErr("");
    if(!nouvelleDate) return;
    const existants = agentProfiles[agent.id]?.vtTracking || {};
    if(existants[nouvelleDate] || data.tousJours.includes(nouvelleDate)){ setAjoutErr("Ce jour est déjà suivi (demandé, accordé ou pris)."); return; }
    const v = schedule[`${agCp}-${nouvelleDate}`];
    const jourEtaitVide = !(v?.equipe || v?.equipe2);
    setAgentProfiles(prev=>({...prev, [agent.id]:{...(prev[agent.id]||{}), vtTracking:{...(prev[agent.id]?.vtTracking||{}), [nouvelleDate]:{statut:"demande", dateDemande:today, jourEtaitVide}}}}));
    setNouvelleDate("");
  };

  const ajouterRefus = () => {
    setAjoutRefusErr("");
    if(!nouvelleDateRefus) return;
    const existants = agentProfiles[agent.id]?.vtTracking || {};
    if(existants[nouvelleDateRefus] || data.tousJours.includes(nouvelleDateRefus)){ setAjoutRefusErr("Ce jour est déjà suivi (demandé, accordé ou pris)."); return; }
    const v = schedule[`${agCp}-${nouvelleDateRefus}`];
    const jourEtaitVide = !(v?.equipe || v?.equipe2);
    setAgentProfiles(prev=>({...prev, [agent.id]:{...(prev[agent.id]||{}), vtTracking:{...(prev[agent.id]?.vtTracking||{}), [nouvelleDateRefus]:{statut:"refuse", dateDemande:null, dateRefus:today, jourEtaitVide}}}}));
    setNouvelleDateRefus("");
  };

  // Accorder : écrit "VT" dans le planning perso (écrase uniquement le champ
  // équipe du jour — préserve la nuit éventuellement déjà notée, voir
  // ecrireVTDansPlanning qui spread l'entrée existante) et retire le suivi.
  const accorderDemande = (date) => {
    ecrireVTDansPlanning(date);
    retirerVtTracking(date);
  };

  const refuserDemande = (date) => {
    setAgentProfiles(prev=>{
      const curr = prev[agent.id]?.vtTracking?.[date] || {};
      const next = {statut:"refuse", dateDemande:curr.dateDemande||null, dateRefus:today, jourEtaitVide:curr.jourEtaitVide};
      return {...prev, [agent.id]:{...(prev[agent.id]||{}), vtTracking:{...(prev[agent.id]?.vtTracking||{}), [date]:next}}};
    });
  };

  const retirerDemande = (date) => retirerVtTracking(date);

  // Annuler un jour déjà accordé/pris : vide simplement le jour dans le
  // planning (pas de restauration du contenu d'origine — même principe que
  // Congés, voir annulerAccord dans CongesDashboardModal).
  const annulerAccordDuPlanning = (date) => {
    const key = `${agCp}-${date}`;
    const entryExistante = schedule[key];
    if(!entryExistante || entryExistante.equipe !== "VT") return;
    const {equipe, ...reste} = entryExistante;
    const videTotal = !reste.equipe2 && !reste.finNuit && !reste.notePerso;
    if(videTotal){
      setSchedule(prev=>{const n={...prev}; delete n[key]; return n;});
      api.planning.deleteEntry(agCp, date).catch(e=>console.error("Erreur suppression VT du planning:", e));
    } else {
      const fullEntry = {...reste, equipe:null};
      setSchedule(prev=>({...prev, [key]: fullEntry}));
      api.planning.saveEntry(agCp, date, fullEntry).catch(e=>console.error("Erreur suppression VT du planning:", e));
    }
  };

  const ajouterReport = () => {
    setReportErr("");
    if(!reportDate) return;
    const v = schedule[`${agent.id}-${reportDate}`];
    const estVT = v?.equipe==="VT"||v?.equipe2==="VT";
    if(!estVT){ setReportErr("Ce jour n'est pas saisi comme VT dans le planning perso — saisis-le d'abord, puis reviens ici."); return; }
    if(data.reports.includes(reportDate)){ setReportErr("Ce jour est déjà comptabilisé en report."); return; }
    setAgentProfiles(prev=>{
      const existants = prev[agent.id]?.vtReports?.[year] || [];
      return {...prev, [agent.id]:{ ...(prev[agent.id]||{}), vtReports:{ ...(prev[agent.id]?.vtReports||{}), [year]: [...existants, reportDate] } }};
    });
    setReportDate("");
  };

  const retirerReport = (d) => {
    setAgentProfiles(prev=>{
      const existants = prev[agent.id]?.vtReports?.[year] || [];
      return {...prev, [agent.id]:{ ...(prev[agent.id]||{}), vtReports:{ ...(prev[agent.id]?.vtReports||{}), [year]: existants.filter(x=>x!==d) } }};
    });
  };

  const moisTries = Object.keys(data.parMois).sort();

  // Demandées (06/08) : mêmes 3 actions que Congés (Accorder/Refuser/Retirer),
  // n'écrit jamais dans le planning tant que non accordé.
  const renderDemande = (e) => (
    <div key={e.date} style={{border:"1px solid #e2e8f0",borderRadius:9,padding:"9px 11px",display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>{fmtDate(e.date)}</span>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button onClick={()=>accorderDemande(e.date)} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>✓ Accorder</button>
          <button onClick={()=>refuserDemande(e.date)} style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>✕ Refuser</button>
          <button onClick={()=>retirerDemande(e.date)} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:11,fontWeight:700,textDecoration:"underline"}}>🗑 Retirer</button>
        </div>
      </div>
      {e.dateDemande && <div style={{fontSize:10,color:"#64748b",fontWeight:600}}>Demandé le {fmtDate(e.dateDemande)}</div>}
    </div>
  );

  // Accordées à venir / Prises : jours réellement dans le planning (equipe
  // "VT") — seule action possible : annuler (vide le jour, pas de
  // restauration du contenu d'origine, même principe que Congés).
  const renderPlanifie = (e) => (
    <div key={e.date} style={{border:"1px solid #e2e8f0",borderRadius:9,padding:"9px 11px",display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>{fmtDate(e.date)}</span>
        <button onClick={()=>annulerAccordDuPlanning(e.date)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:11,fontWeight:700,textDecoration:"underline"}}>✕ Annuler</button>
      </div>
    </div>
  );

  const renderRefus = (e) => (
    <div key={e.date} style={{border:"1px solid #fecaca",background:"#fef2f2",borderRadius:9,padding:"9px 11px",display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>{fmtDate(e.date)}</span>
        <button onClick={()=>retirerDemande(e.date)} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:11,fontWeight:700,textDecoration:"underline"}}>🗑 Retirer</button>
      </div>
      <div style={{fontSize:10,color:"#64748b",fontWeight:600}}>
        {e.dateDemande && <span>Demandé le {fmtDate(e.dateDemande)}</span>}
        {e.dateRefus && <span>{e.dateDemande?" · ":""}Refusé le {fmtDate(e.dateRefus)}</span>}
      </div>
    </div>
  );

  // Tri mensuel (même principe que Congés, voir groupParMois) pour les 4
  // listes VT — purement visuel, aucun changement de calcul ni de donnée.
  const renderListeParMois = (list, renderItem, headerColor) => (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {groupParMois(list, e=>e.date).map(({mois, items})=>{
        const moisNum = parseInt(mois.slice(5,7),10)-1;
        const anneeMois = mois.slice(0,4);
        const horsAnnee = anneeMois!==String(year);
        return (
          <div key={mois}>
            <div style={{fontSize:11,fontWeight:800,color:headerColor,marginBottom:6,textTransform:"uppercase",letterSpacing:.3}}>
              {MOIS_L[moisNum]}{horsAnnee?` ${anneeMois}`:""} · {items.length}j
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {items.map(renderItem)}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:560,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
        <div style={{background:"linear-gradient(135deg,#eab308,#ca8a04)",padding:"18px 20px",display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",position:"sticky",top:0}}>
          <div style={{color:"#fff",fontSize:16,fontWeight:800,flex:"1 1 auto",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🎫 VT {year}</div>
          {availableYears&&onYearChange&&<YearSwitcher year={year} availableYears={availableYears} onChange={onYearChange}/>}
          <button onClick={onClose} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer",opacity:.8,flexShrink:0}}>✕</button>
        </div>

        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:16}}>

          <div style={{fontSize:10,color:"#64748b",fontStyle:"italic"}}>Compteur pour les agents à temps partiel — le droit initial varie selon le pourcentage, à saisir manuellement.</div>

          {/* Droit + Pris + Solde */}
          <div style={{display:"flex",gap:8}}>
            <div style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#334155"}}>Droit</div>
              <input type="number" min="0" value={entitlementInput}
                onChange={e=>setEntitlementInput(e.target.value)}
                onBlur={saveEntitlement}
                onKeyDown={e=>{ if(e.key==="Enter") e.currentTarget.blur(); }}
                style={{width:"100%",textAlign:"center",fontSize:20,fontWeight:900,color:"#a16207",border:"1.5px solid #fde68a",borderRadius:8,padding:"2px 0",background:"#fff",marginTop:2}}/>
              <div style={{fontSize:9,color:"#475569",marginTop:2}}>modifiable</div>
            </div>
            <div style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#334155"}}>Pris</div>
              <div style={{fontSize:20,fontWeight:900,color:"#a16207"}}>{data.pris}</div>
            </div>
            <div style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"10px 8px",textAlign:"center",border:`1px solid ${data.solde<2?"#fca5a5":"#e2e8f0"}`}}>
              <div style={{fontSize:11,fontWeight:700,color:data.solde<2?"#dc2626":"#334155"}}>Restant</div>
              <div style={{fontSize:20,fontWeight:900,color:data.solde<2?"#dc2626":"#16a34a"}}>{data.solde}</div>
            </div>
            <div style={{flex:1,background:data.refusees.length>0?"#fef2f2":"#f8fafc",borderRadius:10,padding:"10px 8px",textAlign:"center",border:`1px solid ${data.refusees.length>0?"#fecaca":"#e2e8f0"}`}}>
              <div style={{fontSize:11,fontWeight:700,color:data.refusees.length>0?"#991b1b":"#334155"}}>Refusés</div>
              <div style={{fontSize:20,fontWeight:900,color:data.refusees.length>0?"#dc2626":"#94a3b8"}}>{data.refusees.length}</div>
            </div>
          </div>

          {/* Pris jusqu'à une date choisie */}
          <div style={{background:"#fefce8",border:"1.5px solid #fde68a",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:140}}>
              <div style={{fontSize:11,fontWeight:700,color:"#334155"}}>Pris jusqu'au</div>
              <input type="date" value={dateSnapshot} onChange={e=>setDateSnapshot(e.target.value)}
                style={{marginTop:3,padding:"5px 8px",border:"1.5px solid #fde68a",borderRadius:7,fontSize:12,fontWeight:600,color:"#334155",background:"#fff"}}/>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:900,color:"#a16207",lineHeight:1}}>{prisJusquA}</div>
              <div style={{fontSize:9,fontWeight:600,color:"#334155",marginTop:2}}>jour{prisJusquA>1?"s":""}</div>
            </div>
          </div>

          {data.donnesAnneePrecedente.length>0 && (
            <div style={{fontSize:11,fontWeight:500,color:"#334155",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px"}}>
              ℹ️ {data.donnesAnneePrecedente.length} jour{data.donnesAnneePrecedente.length>1?"s":""} de {year} compté{data.donnesAnneePrecedente.length>1?"s":""} sur le solde {year-1} (report) — non inclus ci-dessus.
            </div>
          )}

          {/* Solde théorique (06/08, même principe que Congés) : projection si
              toutes les demandes en attente sont accordées, jamais affectée
              par les refus. */}
          {data.demandes.length>0 && (
            <div style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:10,padding:"9px 12px",fontSize:11.5,fontWeight:600,color:"#1e40af"}}>
              ⏳ {data.demandes.length} jour{data.demandes.length>1?"s":""} en attente d'accord — solde théorique si tout accordé : <strong style={{color:data.soldeTheorique<0?"#dc2626":"#1e40af",fontSize:13}}>{data.soldeTheorique}</strong>
            </div>
          )}

          {/* Ajouter une nouvelle demande (06/08) : n'écrit plus dans le
              planning perso — coexiste avec un jour déjà rempli, affiché
              comme un badge indépendant "⏳ VT (n°X)". */}
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8}}>+ Nouvelle demande</div>
            <div style={{display:"flex",gap:6}}>
              <input type="date" value={nouvelleDate} onChange={e=>{setNouvelleDate(e.target.value);setAjoutErr("");}}
                style={{flex:1,padding:"7px 9px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
              <button onClick={ajouterDemande} style={{background:"#a16207",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Ajouter</button>
            </div>
            {ajoutErr && <div style={{fontSize:11,fontWeight:600,color:"#dc2626",marginTop:6}}>{ajoutErr}</div>}
            <div style={{fontSize:10,color:"#94a3b8",marginTop:5}}>Un VT demandé n'apparaît pas dans le planning perso tant qu'il n'est pas accordé — la journée prévue reste affichée et comptée normalement. Peut aussi être saisi directement depuis le popup du planning perso.</div>
            <div style={{fontSize:10,color:"#94a3b8",marginTop:6,display:"flex",alignItems:"center",gap:6}}>
              <span style={{background:"#eab308",color:"#1e293b",border:"1.5px dashed #1e293b",borderRadius:5,padding:"1px 6px",fontSize:10,fontWeight:700,flexShrink:0}}>⏳ VT (n°X)</span>
              <span>= badge visible dans le planning tant que le VT n'est pas accordé.</span>
            </div>
          </div>

          {/* Demandées — regroupées par mois (même principe que Congés, voir
              renderListeParMois) */}
          <div>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8}}>⏳ Demandées ({data.demandes.length})</div>
            {data.demandes.length===0 ? <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Aucune demande en attente.</div> :
              renderListeParMois(data.demandes, renderDemande, "#a16207")}
          </div>

          {/* Accordées à venir — regroupées par mois */}
          <div>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8}}>✅ Accordées — à venir ({data.accordeesAvenir.length})</div>
            {data.accordeesAvenir.length===0 ? <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Aucune.</div> :
              renderListeParMois(data.accordeesAvenir, renderPlanifie, "#166534")}
          </div>

          {/* Prises (passées) — regroupées par mois */}
          <div>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8}}>📌 Prises ({data.prises.length})</div>
            {data.prises.length===0 ? <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Aucune.</div> :
              renderListeParMois(data.prises, renderPlanifie, "#334155")}
          </div>

          {/* Refusées (06/08, même principe que Congés) — regroupées par mois */}
          <div>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8}}>❌ Refusées ({data.refusees.length})</div>
            <div style={{marginBottom:10}}>
              <div style={{display:"flex",gap:6}}>
                <input type="date" value={nouvelleDateRefus} onChange={e=>{setNouvelleDateRefus(e.target.value);setAjoutRefusErr("");}}
                  style={{flex:1,padding:"7px 9px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                <button onClick={ajouterRefus} style={{background:"#991b1b",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Ajouter un refus</button>
              </div>
              {ajoutRefusErr && <div style={{fontSize:11,fontWeight:600,color:"#dc2626",marginTop:6}}>{ajoutRefusErr}</div>}
            </div>
            {data.refusees.length===0 ? <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Aucune.</div> :
              renderListeParMois(data.refusees, renderRefus, "#991b1b")}
          </div>

          {/* Report vers l'année suivante */}
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:6}}>↪️ Report sur {year+1}</div>
            <div style={{fontSize:10,fontWeight:500,color:"#475569",marginBottom:8}}>
              Un jour de VT pris sur {year+1} mais décompté du solde {year} (tolérance de report).
            </div>
            {data.reports.length>0 && (
              <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:8}}>
                {data.reports.map(d=>(
                  <div key={d} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f8fafc",borderRadius:7,padding:"5px 9px"}}>
                    <span style={{fontSize:11,fontWeight:600,color:"#334155"}}>{fmtDate(d)}</span>
                    <button onClick={()=>retirerReport(d)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:12,fontWeight:700}}>✕ Retirer</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:6}}>
              <input type="date" value={reportDate} onChange={e=>{setReportDate(e.target.value);setReportErr("");}}
                style={{flex:1,padding:"7px 9px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
              <button onClick={ajouterReport} style={{background:"#a16207",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Ajouter</button>
            </div>
            {reportErr && <div style={{fontSize:11,fontWeight:600,color:"#dc2626",marginTop:6}}>{reportErr}</div>}
          </div>

          <NoticeSection sections={NOTICE_VT} accentDark="#92400e" bgLight="#fffbeb" borderLight="#fde68a"/>
        </div>
      </div>
    </div>
  );
}

// ─── MODULE TC (solde en heures/minutes, plafonné à 32h) ────────────────────
function TcDashboardModal({ agent, schedule, setSchedule, agentProfiles, setAgentProfiles, pausesData, year, availableYears, onYearChange, onClose, cetTransfere }){
  const data = useMemo(()=>computeDashboardTC(agent, schedule, agentProfiles, pausesData, year), [agent, schedule, agentProfiles, pausesData, year]);
  const agCp = agent?.immatriculation || agent?.cp || agent?.id;
  const fmtDate = (d)=> d ? new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"2-digit",month:"long"}) : "—";

  // Journal d'ajustements manuels datés par mois (17/07, re-précisé le même
  // jour) — remplace l'ancien "solde de départ" unique : pas de remise à
  // zéro annuelle, l'agent ajoute/retire des entrées à tout moment.
  const [ledgerMois, setLedgerMois] = useState(()=>new Date().toISOString().slice(0,7));
  const [ledgerH, setLedgerH] = useState("0");
  const [ledgerM, setLedgerM] = useState("0");
  const [ledgerNeg, setLedgerNeg] = useState(false);

  const ajouterLedger = () => {
    const hh = parseInt(ledgerH,10)||0, mm = parseInt(ledgerM,10)||0;
    if(hh===0 && mm===0) return;
    const delta = (hh*60+mm) * (ledgerNeg?-1:1);
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, mois: ledgerMois, deltaMinutes: delta, saisiLe: new Date().toISOString().slice(0,10) };
    setAgentProfiles(prev=>({
      ...prev,
      [agent.id]:{ ...(prev[agent.id]||{}), tcLedger: [...(prev[agent.id]?.tcLedger||[]), entry] }
    }));
    setLedgerH("0"); setLedgerM("0"); setLedgerNeg(false);
  };

  const retirerLedger = (id) => {
    setAgentProfiles(prev=>({
      ...prev,
      [agent.id]:{ ...(prev[agent.id]||{}), tcLedger: (prev[agent.id]?.tcLedger||[]).filter(e=>e.id!==id) }
    }));
  };

  const [nouvelleDate, setNouvelleDate] = useState("");
  const [ajoutErr, setAjoutErr] = useState("");
  // Erreur visible sur une action réseau échouée (ajustement, écriture/retrait
  // planning) — sans ça un échec silencieux (ex: token perdu) laisse l'agent
  // sans aucun retour et sans savoir que rien n'a été enregistré (17/07).
  const [actionError, setActionError] = useState(null);

  const ecrireTCDansPlanning = (date) => {
    const key = `${agCp}-${date}`;
    const entryExistante = schedule[key] || {};
    const fullEntry = {...entryExistante, equipe:"TC", prive:true};
    setSchedule(prev=>({...prev, [key]: fullEntry}));
    api.planning.saveEntry(agCp, date, fullEntry).catch(e=>{ console.error("Erreur sauvegarde TC dans planning:", e); setActionError("Erreur lors de l'enregistrement dans le planning. Réessaie."); });
  };

  const retirerTCDuPlanning = (date) => {
    const key = `${agCp}-${date}`;
    const entryExistante = schedule[key];
    if(!entryExistante || entryExistante.equipe !== "TC") return;
    const {equipe, ...reste} = entryExistante;
    const videTotal = !reste.equipe2 && !reste.finNuit && !reste.notePerso;
    if(videTotal){
      setSchedule(prev=>{const n={...prev}; delete n[key]; return n;});
      api.planning.deleteEntry(agCp, date).catch(e=>{ console.error("Erreur suppression TC du planning:", e); setActionError("Erreur lors de la suppression dans le planning. Réessaie."); });
    } else {
      const fullEntry = {...reste, equipe:null};
      setSchedule(prev=>({...prev, [key]: fullEntry}));
      api.planning.saveEntry(agCp, date, fullEntry).catch(e=>{ console.error("Erreur suppression TC du planning:", e); setActionError("Erreur lors de la suppression dans le planning. Réessaie."); });
    }
  };

  // "Forcer manuellement une prise de TC" (demandé par Olivier) : écrit le
  // code TC dans le planning perso, même garde-fou d'écrasement que VT/Fêtes
  // — devient ensuite indiscernable d'une saisie directe dans le planning
  // (même mécanisme de détection, joursTC recalculé depuis schedule).
  const ajouterJourTC = () => {
    setAjoutErr("");
    if(!nouvelleDate) return;
    if(data.joursTC.includes(nouvelleDate)){ setAjoutErr("Ce jour est déjà enregistré comme TC pris."); return; }
    const targetEntry = schedule[`${agCp}-${nouvelleDate}`];
    if(targetEntry?.equipe && targetEntry.equipe!=="TC"){
      setAjoutErr(`Le ${fmtDate(nouvelleDate)} contient déjà "${EQ_COLORS[targetEntry.equipe]?.label||targetEntry.equipe}" dans ton planning perso. Modifie ou efface ce jour d'abord.`);
      return;
    }
    ecrireTCDansPlanning(nouvelleDate);
    setNouvelleDate("");
  };

  const moisTries = Object.keys(data.parMoisTC).sort();
  const soldeColor = data.solde<0 ? "#dc2626" : data.solde>=TC_PLAFOND_MIN ? "#d97706" : "#0369a1";

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:560,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
        <div style={{background:"linear-gradient(135deg,#0284c7,#0369a1)",padding:"18px 20px",display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",position:"sticky",top:0}}>
          <div style={{color:"#fff",fontSize:16,fontWeight:800,flex:"1 1 auto",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🔵 TC {year}</div>
          {availableYears&&onYearChange&&<YearSwitcher year={year} availableYears={availableYears} onChange={onYearChange}/>}
          <button onClick={onClose} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer",opacity:.8,flexShrink:0}}>✕</button>
        </div>

        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:16}}>

          {actionError&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
            padding:"10px 12px",background:"#fee2e2",border:"1.5px solid #fca5a5",borderRadius:10}}>
            <span style={{fontSize:12,fontWeight:600,color:"#991b1b"}}>⚠️ {actionError}</span>
            <button onClick={()=>setActionError(null)} style={{border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,
              fontWeight:700,cursor:"pointer",background:"#991b1b",color:"#fff",flexShrink:0}}>✕</button>
          </div>}

          <div style={{fontSize:10,color:"#64748b",fontStyle:"italic"}}>Temps compensé : +1h30 par pause figée validée, plafonné à 32h00. Le reste (ajouts/retraits) se règle manuellement ci-dessous, suivi en permanence — pas de remise à zéro annuelle.</div>

          {/* Solde principal */}
          <div style={{background:"#f0f9ff",border:`2px solid ${data.solde>=TC_PLAFOND_MIN?"#fcd34d":"#bae6fd"}`,borderRadius:12,padding:"16px 12px",textAlign:"center"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#334155"}}>Solde TC (en cours)</div>
            <div style={{fontSize:34,fontWeight:900,color:soldeColor,lineHeight:1,marginTop:4}}>{minToHM(data.solde)}</div>
            <div style={{fontSize:10,fontWeight:600,color:"#64748b",marginTop:4}}>
              {data.dernierSaisiLe ? `Mis à jour le ${new Date(data.dernierSaisiLe).toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}` : "Plafond : 32h00"}
            </div>
            {data.solde>=TC_PLAFOND_MIN&&<div style={{fontSize:11,fontWeight:700,color:"#b45309",marginTop:6}}>⚠️ Plafond atteint — toute nouvelle pause validée sera à vérifier en heures sup</div>}
          </div>

          {data.totalHorsPlafond>0&&(
            <div style={{background:"#fffbeb",border:"1.5px solid #fde68a",borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontSize:12,fontWeight:800,color:"#92400e"}}>💶 {minToHM(data.totalHorsPlafond)} non ajoutées au total (plafond atteint)</div>
              <div style={{fontSize:10,color:"#78350f",marginTop:3}}>À vérifier sur la fiche de paie du mois suivant chaque pause concernée (paiement en heures supplémentaires) — détail dans le module Pause Figée.</div>
            </div>
          )}

          {/* Récap CET (Phase 2, 06/08) : jours de TC transférés au CET —
              purement un rappel, voir CetView.jsx (getCetTransfereJours). */}
          {cetTransfere && cetTransfere.total > 0 && (
            <div style={{fontSize:11,fontWeight:600,color:"#5b21b6",background:"#faf5ff",border:"1px solid #e9d5ff",borderRadius:8,padding:"8px 10px"}}>
              🏦 {cetTransfere.total} jour{cetTransfere.total>1?"s":""} transféré{cetTransfere.total>1?"s":""} au CET
              {cetTransfere.parSousCompte.courant>0 && ` — Compte courant : ${cetTransfere.parSousCompte.courant}j`}
              {cetTransfere.parSousCompte.finActivite>0 && ` — Compte fin d'activité : ${cetTransfere.parSousCompte.finActivite}j`}
            </div>
          )}

          {/* Épargner directement au CET depuis TC (07/08, demandé par
              Olivier) — widget partagé, voir CetView.jsx EpargneCetWidget. */}
          <EpargneCetWidget agent={agent} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} source="TC" sourceLabel="mon TC" year={year} besoinValeur={true}/>

          {/* Journal d'ajustements manuels — remplace l'ancien "solde de
              départ" : modulable à tout moment, pas de remise à zéro. */}
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:2}}>+ Ajuster le solde</div>
            <div style={{fontSize:10,color:"#64748b",marginBottom:8}}>Indépendant du planning perso — indique juste le mois concerné pour repère, n'affecte pas le calcul.</div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <button onClick={()=>setLedgerNeg(n=>!n)}
                style={{border:"1.5px solid #cbd5e1",borderRadius:8,padding:"7px 10px",cursor:"pointer",
                  background:ledgerNeg?"#fee2e2":"#dcfce7",color:ledgerNeg?"#dc2626":"#16a34a",fontWeight:800,fontSize:13}}>
                {ledgerNeg?"−":"+"}
              </button>
              <input type="number" min="0" value={ledgerH} onChange={e=>setLedgerH(e.target.value)}
                style={{width:56,textAlign:"center",padding:"7px 4px",border:"1.5px solid #bae6fd",borderRadius:8,fontSize:14,fontWeight:700}}/>
              <span style={{fontSize:12,fontWeight:700,color:"#334155"}}>h</span>
              <input type="number" min="0" max="59" value={ledgerM} onChange={e=>setLedgerM(e.target.value)}
                style={{width:56,textAlign:"center",padding:"7px 4px",border:"1.5px solid #bae6fd",borderRadius:8,fontSize:14,fontWeight:700}}/>
              <span style={{fontSize:12,fontWeight:700,color:"#334155"}}>min</span>
              <input type="month" value={ledgerMois} onChange={e=>setLedgerMois(e.target.value)}
                style={{padding:"6px 8px",border:"1.5px solid #bae6fd",borderRadius:8,fontSize:12,fontWeight:600}}/>
              <button onClick={ajouterLedger} style={{background:"#0369a1",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>Ajouter</button>
            </div>
            {data.ledger.length>0 && (
              <div style={{display:"flex",flexDirection:"column",gap:5,marginTop:10}}>
                {data.ledger.map(e=>{
                  const [an,mo] = (e.mois||"").split("-").map(Number);
                  return(
                    <div key={e.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:7,padding:"7px 10px"}}>
                      <span style={{fontSize:11,fontWeight:600,color:"#334155"}}>{mo?`${MOIS_L[mo-1]} ${an}`:"—"}</span>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:12,fontWeight:800,color:e.deltaMinutes<0?"#dc2626":"#16a34a"}}>{e.deltaMinutes<0?"−":"+"}{minToHM(Math.abs(e.deltaMinutes)).replace("-","")}</span>
                        <button onClick={()=>retirerLedger(e.id)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:11,fontWeight:700,textDecoration:"underline"}}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Forcer une prise de TC */}
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8}}>+ Forcer une prise de TC</div>
            <div style={{display:"flex",gap:6}}>
              <input type="date" value={nouvelleDate} onChange={e=>{setNouvelleDate(e.target.value);setAjoutErr("");}}
                style={{flex:1,padding:"7px 9px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
              <button onClick={ajouterJourTC} style={{background:"#0369a1",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Ajouter</button>
            </div>
            {ajoutErr && <div style={{fontSize:11,fontWeight:600,color:"#dc2626",marginTop:6}}>{ajoutErr}</div>}
            <div style={{fontSize:10,color:"#94a3b8",marginTop:5}}>Écrit "TC" dans le planning perso ce jour-là — équivalent à le taper directement dans le planning. N'affecte plus le solde en heures (indépendant) — ajuste-le toi-même ci-dessus si besoin.</div>
          </div>

          {/* Traçabilité : d'où vient chaque 1h30 (demandé par Olivier le 17/07) — tout l'historique, pas juste l'année en cours */}
          <div>
            {(()=>{
              const pausesCreditees = Object.entries(data.detailPauses).sort(([a],[b])=>b.localeCompare(a));
              return(<>
                <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8}}>📋 Historique des pauses créditées ({pausesCreditees.length})</div>
                {pausesCreditees.length===0 ? <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Aucune pause figée validée pour l'instant — le détail de chaque pause (planning du jour, statut) est dans le module Pause Figée.</div> :
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {pausesCreditees.map(([d,{ajoute,horsPlafond,moisEffectif}])=>{
                      // Mois de constatation affiché séparément de la date de la
                      // pause (24/08, Olivier : "il faut garder la date la pause
                      // figé. mais faut mettre aussi le mois ou c'est constater
                      // quand le temps est acquis") — la date reste celle de la
                      // pause elle-même (pour la retrouver dans le planning), le
                      // crédit est explicitement rattaché au mois choisi par
                      // l'agent, seulement affiché s'il diffère du mois de la
                      // pause (sinon redondant).
                      const moisPause = d.slice(0,7);
                      const moisLabel = moisEffectif && moisEffectif!==moisPause
                        ? `${MOIS_L[parseInt(moisEffectif.slice(5,7))-1]} ${moisEffectif.slice(0,4)}`
                        : null;
                      return(
                      <div key={d} style={{display:"flex",flexDirection:"column",gap:2,
                        background:horsPlafond>0?"#fffbeb":"#f0fdfa",border:`1px solid ${horsPlafond>0?"#fde68a":"#99f6e4"}`,
                        borderRadius:7,padding:"7px 10px"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                          <span style={{fontSize:11,fontWeight:600,color:"#334155",textTransform:"capitalize"}}>{fmtDate(d)}</span>
                          <span style={{fontSize:11,fontWeight:700,color:horsPlafond>0?"#92400e":"#0f766e"}}>
                            +{minToHM(ajoute)}{horsPlafond>0&&<span style={{fontWeight:600}}> · ⚠️ {minToHM(horsPlafond)} hors plafond</span>}
                          </span>
                        </div>
                        {moisLabel&&<span style={{fontSize:10,fontWeight:600,color:"#0f766e"}}>💳 Acquis en {moisLabel} (mois de constatation)</span>}
                      </div>
                      );
                    })}
                  </div>}
              </>);
            })()}
          </div>

          {/* Journées TC prises */}
          <div>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8}}>📌 Journées prises ({data.nbJoursTC}) — pas de solde restant en jours, uniquement en heures ci-dessus</div>
            {moisTries.length===0 ? <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Aucune journée TC prise cette année.</div> :
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {moisTries.map(mk=>{
                  const [an,mo] = mk.split("-").map(Number);
                  const dates = data.parMoisTC[mk];
                  return(
                    <div key={mk}>
                      <div style={{fontSize:11,fontWeight:700,color:"#0369a1",marginBottom:5}}>{MOIS_L[mo-1]} {an} — {dates.length}j</div>
                      <div style={{display:"flex",flexDirection:"column",gap:5}}>
                        {dates.map(d=>(
                          <div key={d} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f8fafc",borderRadius:7,padding:"6px 9px",border:"1px solid #e2e8f0"}}>
                            <span style={{fontSize:11,fontWeight:600,color:"#334155",textTransform:"capitalize"}}>{fmtDate(d)}</span>
                            <button onClick={()=>retirerTCDuPlanning(d)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:11,fontWeight:700,textDecoration:"underline"}}>✕ Retirer</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>}
          </div>

          {/* Définition courte (16/08, demandé par Olivier pour distinguer
              TC/TY/TQ — "sans que ce soit lourd", donc juste une ligne, pas
              de section repliable). */}
          <div style={{fontSize:10.5,color:"#94a3b8",borderTop:"1px solid #f1f5f9",paddingTop:8}}>
            TC : dépassement accidentel de la durée du temps de travail des mois précédents.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── OUTIL GÉNÉRIQUE "DÉTAIL + JUSQU'À UNE DATE" (RP/RU/RQ/RN/TC/TY/Maladie) ─
// RP a d'abord eu un outil minimal séparé (juste "pris jusqu'à une date"),
// remplacé le 12/07 par ce composant générique pour recevoir le même
// mécanisme de report que RU/Congés (RP a aussi une tolérance de report).
// comme Congés) et, pour RU uniquement, le même mécanisme de report A→A+1.
// acquisKey : compteur "banque" de jours accumulés au fil du temps (comme le
// Droit à congés) — l'agent déclare son solde déjà acquis, combiné au calcul
// pour donner Acquis/Pris/Restant. Deux façons de reporter d'une année sur
// l'autre (précisé par Olivier le 13/07, ne pas confondre les deux) :
//   - reportKey (RP, RU) : comme les congés — l'agent choisit des dates
//     précises physiquement posées sur A+1 mais décomptées du solde de A.
//   - rollingAcquis (RQ, RN, TC, TY) : pas de report par date — le solde
//     restant en fin d'année A devient automatiquement l'acquis de départ de
//     l'année A+1, sauf si l'agent le corrige manuellement pour cette année.
// Maladie n'a ni l'un ni l'autre (jamais accumulée) — juste consultation.
// Notice "Les arrêts maladie" (09/08, texte fourni verbatim par Olivier, à
// reprendre tel quel sans reformulation — même principe que NOTICE_CET :
// "pas d'interprétation, tu restes fidèle au règlement"). Affichée en bas
// du module Maladie uniquement (voir DETAIL_CONFIG.MA.notice ci-dessous).
const NOTICE_MALADIE = [
  {
    titre: "Les arrêts maladie",
    texte: `L'agent en arrêt de travail ou hospitalisé a l'obligation d'aviser son manager, sa CPS ou l'astreinte (en dehors des horaires d'ouverture de la CPS) le plus rapidement possible. A cette occasion, les éléments nécessaires au contrôle doivent être communiqués.`,
  },
  {
    titre: "Vos démarches",
    texte: `L'arrêt de travail est composé de trois volets :
• Lorsqu'ils ne sont pas télétransmis, les volets n° 1 et 2 sont adressés au service médical de la CPR par courrier postal sous 48h.
  Adresse pour les agents relevant du régime spécial :
  CPRPF
  17 avenue Général Leclerc
  13347 MARSEILLE CEDEX 20
  Adresse pour les agents relevant du régime général :
  CPRPF
  C908
  17 avenue Général Leclerc
  13936 MARSEILLE CEDEX 20
• Le volet n° 3 à adresser à sa CPS. Lorsque la télétransmission n'est pas possible, seul le CERFA original est accepté.
A compter du 1er juillet 2025, un nouveau CERFA sécurisé est édité sous format papier. Les anciens modèles ne sont plus acceptés depuis le 1er septembre 2025.`,
  },
  {
    titre: "La téléconsultation",
    texte: `Un arrêt de travail prescrit ou renouvelé en téléconsultation ne peut excéder 3 jours. Si la durée est supérieure, il ne sera pas indemnisé, sauf cas particulier (arrêt prescrit par le médecin traitant ou son remplaçant par exemple).`,
  },
  {
    titre: "Les horaires de sortie",
    texte: `Votre médecin doit indiquer sur votre avis d'arrêt de travail si vous êtes autorisé ou non à quitter votre domicile durant votre arrêt de travail maladie. La CPR peut contrôler votre présence à votre domicile pendant toute la durée de l'arrêt, y compris le weekend et les jours fériés.
Vos obligations dépendent des informations mentionnées par votre médecin sur votre arrêt de travail :
• Vous n'êtes pas autorisé à sortir de votre domicile parce que votre état de santé ne le permet pas ;
• Vous êtes autorisé à sortir, mais vous devez être présent à votre domicile de 9 h à 11 h et de 14 h à 16 h. Vous pouvez sortir sur ces plages horaires uniquement pour des soins ou des examens médicaux, y compris le samedi, le dimanche et les jours fériés ;
• Vous êtes autorisé à sortir sans restriction. Pour ce cas de figure, la décision doit être justifiée par votre médecin sur le volet 1 de l'avis d'arrêt de travail.`,
  },
  {
    titre: "La visite de contrôle",
    texte: `La CPR peut effectuer des contrôles à votre domicile ou vous convoquer auprès du service médical. Vos indemnités journalières peuvent être réduites voire supprimées si :
• Vous refusez le contrôle ou si vous ne vous rendez pas à la convocation ;
• Votre arrêt de travail n'est pas ou plus médicalement justifié au moment du contrôle ;
• Vous exercez une activité non autorisée par votre médecin ;
• Vous ne respectez pas les heures de sortie autorisée ou vous quittez votre lieu de résidence sans l'accord préalable de la CPR.`,
  },
  {
    titre: "La prolongation d'arrêt de travail",
    texte: `La prolongation doit être établie avant la fin de votre arrêt de travail. Attention, elle doit être prescrite par le médecin qui a établi votre arrêt de travail initial ou votre médecin traitant.
La prolongation de l'arrêt de travail par un autre professionnel de santé est exceptionnellement autorisée dans certains cas particuliers (prescription par le remplaçant du médecin traitant ou de celui qui a rédigé l'arrêt initial, prescription par le médecin qui vous suit lors d'une hospitalisation…).`,
  },
];

// Notice VT (09/08, texte + 3 tableaux fournis verbatim par Olivier — "Annexe
// 1A : Accord Collectif sur le travail à temps partiel - RH00662"). Ordre
// des tableaux explicitement demandé : Sédentaires 132 repos, puis Réserve
// 125 repos, puis Sédentaires 122 repos en dernier. Affichée en bas du
// module VT (VtDashboardModal) — voir NoticeSection ci-dessus, qui sait
// rendre soit du texte (`texte`), soit un tableau (`table`), selon ce qui
// est fourni par la section.
// Colonnes courtes pour tenir sur un écran étroit sans scroll horizontal
// (Olivier, 09/08 : "reduire la largeurs des colonne pour ne pas avoir a
// depalacer le tableaux de gauche a droite") — libellé complet gardé en
// infobulle (title) sur l'en-tête pour ne rien perdre de l'information.
const NOTICE_VT_TABLE_HEADERS = ["Taux","Travail","Repos","Congés","VT"];
const NOTICE_VT_TABLE_HEADERS_FULL = ["Taux","Journées de travail","Repos périodiques et repos supplémentaires","Congés","Journées chômées supplémentaires (VT)"];
const NOTICE_VT = [
  {
    titre: "Annexe 1A : Accord Collectif sur le travail à temps partiel - RH00662",
    texte: `Annexe 1A : TRAVAIL A TEMPS PARTIEL – Formules classiques`,
  },
  {
    titre: "Sédentaires 132 repos",
    table: { headers: NOTICE_VT_TABLE_HEADERS, headersFull: NOTICE_VT_TABLE_HEADERS_FULL, rows: [
      ["Temps complet","195","132","28",""],
      ["91,40%","178","132","26","19"],
      ["89,17%","174","132","25","24"],
      ["85,65%","167","132","24","32"],
      ["80,00%","156","132","23","44"],
      ["74,89%","146","132","21","56"],
      ["71,30%","139","132","20","64"],
      ["67,71%","132","132","19","72"],
      ["64,13%","125","132","18","80"],
      ["60,54%","118","132","17","88"],
      ["56,95%","111","132","16","96"],
      ["53,36%","104","132","15","104"],
      ["50,00%","97","132","14","112"],
    ]},
  },
  {
    titre: "Réserve 125 repos",
    table: { headers: NOTICE_VT_TABLE_HEADERS, headersFull: NOTICE_VT_TABLE_HEADERS_FULL, rows: [
      ["Temps complet","202","125","28",""],
      ["91,40%","184","125","26","20"],
      ["89,13%","180","125","25","25"],
      ["85,65%","173","125","24","33"],
      ["80,00%","161","125","23","46"],
      ["74,78%","151","125","21","58"],
      ["71,30%","144","125","20","66"],
      ["67,83%","137","125","19","74"],
      ["64,35%","130","125","18","82"],
      ["60,87%","123","125","17","90"],
      ["56,96%","115","125","16","99"],
      ["53,48%","108","125","15","107"],
      ["50,00%","101","125","14","115"],
    ]},
  },
  {
    titre: "Sédentaires 122 repos",
    table: { headers: NOTICE_VT_TABLE_HEADERS, headersFull: NOTICE_VT_TABLE_HEADERS_FULL, rows: [
      ["Temps complet","205","122","28",""],
      ["91,40%","187","122","26","20"],
      ["89,27%","183","122","25","25"],
      ["85,41%","175","122","24","34"],
      ["80,00%","164","122","23","46"],
      ["75,11%","154","122","21","58"],
      ["71,24%","146","122","20","67"],
      ["67,81%","139","122","19","75"],
      ["64,38%","132","122","18","83"],
      ["60,52%","124","122","17","92"],
      ["57,08%","117","122","16","100"],
      ["53,65%","110","122","15","108"],
      ["50,00%","102","122","14","117"],
    ]},
  },
];

// Notice TQ (16/08, nouveau module) — explique le principe, le basculement
// semestriel vers TY (annulable, surplus payé hors CET) et se termine par la
// définition courte fournie par Olivier, verbatim.
const NOTICE_TQ = [
  {
    titre: "Le principe",
    texte: `Le TQ suit le temps à compenser du semestre civil en cours (janvier-juin, puis juillet-décembre) — saisi manuellement, heure par heure, comme TC/TY/RN. Mets-le à jour chaque mois.`,
  },
  {
    titre: "Le basculement vers TY",
    texte: `En fin de semestre, c'est toi qui décides de basculer ton solde TQ vers le compteur TY — jamais automatique, prends le temps de vérifier tes compteurs avant. TY reste plafonné à 32h00 : si ton solde TQ dépasse la place disponible dans TY, le surplus n'y est pas versé — il te sera payé sur la paie du mois suivant. Un basculement reste annulable à tout moment, sans limite de délai : tes deux compteurs reviennent exactement à leur état d'avant.`,
  },
  {
    titre: "Paiement et CET",
    texte: `Le paiement hors CET est possible sur demande de l'agent. ⚠️ Ces heures ne peuvent pas être épargnées sur le CET.`,
  },
  {
    titre: "Définition",
    texte: `TQ : dépassement de la durée du temps de travail prévu mensuellement.`,
  },
];

export const DETAIL_CONFIG = {
  RP: { codes:["RP","RPP"], reportKey:"rpReports", acquisKey:"rpAcquis", rollingAcquis:false, label:"RP", icon:"🟢", gradientFrom:"#16a34a", gradientTo:"#15803d", bgLight:"#f0fdf4", borderLight:"#bbf7d0", accentDark:"#166534", accentColor:"#15803d" },
  RU: { codes:["RU"], reportKey:"ruReports", acquisKey:"ruAcquis", rollingAcquis:false, label:"RU", icon:"🟡", gradientFrom:"#d97706", gradientTo:"#b45309", bgLight:"#fffbeb", borderLight:"#fde68a", accentDark:"#92400e", accentColor:"#b45309" },
  // RQ recoloré le 18/08 (Olivier, suite à l'audit UI : "RU et RQ partagent
  // exactement la même couleur ET la même icône [...] propose une couleur
  // diffrente par defaut pour les RQ et change l'icone") — nouvelle teinte
  // fuchsia, ne collisionne avec aucun autre compteur (RP vert, RU ambre,
  // RN/TY bleu, TQ orange, MA rouge, CET violet #7c3aed comme module à part).
  RQ: { codes:["RQ"], reportKey:null, acquisKey:"rqAcquis", rollingAcquis:true, label:"RQ", icon:"🟣", gradientFrom:"#c026d3", gradientTo:"#a21caf", bgLight:"#fdf4ff", borderLight:"#f5d0fe", accentDark:"#701a75", accentColor:"#a21caf", cetSource:"RQ", cetBesoinValeur:false },
  // RN et TY (17/07, re-précisé le même jour) : le compteur "acquis" en JOURS
  // est retiré (acquisKey/rollingAcquis) au profit d'un solde en HEURES/MINUTES
  // suivi en continu (ledgerKey → computeLedgerSolde), saisi manuellement par
  // l'agent, sans lien automatique avec les jours détectés dans le planning
  // perso — voir CLAUDE.md. Le compteur de jours (codes ci-dessous) reste,
  // purement informatif désormais.
  RN: { codes:["RN"], reportKey:null, acquisKey:null, rollingAcquis:false, ledgerKey:"rnLedger", label:"RN", icon:"🔵", gradientFrom:"#4338ca", gradientTo:"#3730a3", bgLight:"#eef2ff", borderLight:"#c7d2fe", accentDark:"#3730a3", accentColor:"#4338ca", cetSource:"RN", cetBesoinValeur:true },
  // TC (17/07) : sorti de ce mécanisme générique — devient un solde en heures/
  // minutes plafonné, alimenté par les pauses figées validées, avec sa propre
  // logique (computeDashboardTC/TcDashboardModal). Voir CLAUDE.md.
  // TY plafonné à 32h00 comme TC (13/08, Olivier) — plafondMin déclenche le
  // même mécanisme de capping+heures sup dans computeLedgerSolde, RN n'a pas
  // ce champ et reste sans plafond.
  // TY recoloré le 18/08 (Olivier, audit UI : "TC et TY partagent exactement
  // la même couleur" — même violet #9333ea que EQUIPES/CARDS, pour rester
  // cohérent partout où TY est affiché).
  TY: { codes:["TY"], reportKey:null, acquisKey:null, rollingAcquis:false, ledgerKey:"tyLedger", plafondMin:PLAFOND_32H_MIN, label:"TY", icon:"🟣", gradientFrom:"#9333ea", gradientTo:"#7e22ce", bgLight:"#faf5ff", borderLight:"#e9d5ff", accentDark:"#7e22ce", accentColor:"#9333ea", cetSource:"TY", cetBesoinValeur:true },
  // TQ (16/08, nouveau module) : temps à compenser du semestre en cours, même
  // mécanisme ledger que RN/TY mais SANS plafond sur lui-même (le plafond
  // s'applique à TY une fois basculé, voir basculerTQversTY) et SANS
  // cetSource/cetBesoinValeur — volontairement absent des widgets d'épargne
  // CET (App.jsx/CetView.jsx), ces heures ne sont jamais épargnables au CET.
  // codes:[] : aucun code de planning associé, pur ledger manuel.
  TQ: { codes:[], reportKey:null, acquisKey:null, rollingAcquis:false, ledgerKey:"tqLedger", label:"TQ", icon:"🟠", gradientFrom:"#ea580c", gradientTo:"#c2410c", bgLight:"#fff7ed", borderLight:"#fed7aa", accentDark:"#9a3412", accentColor:"#ea580c", notice:NOTICE_TQ },
  MA: { codes:["MA"], reportKey:null, acquisKey:null, rollingAcquis:false, label:"Maladie", icon:"🤒", gradientFrom:"#dc2626", gradientTo:"#b91c1c", bgLight:"#fef2f2", borderLight:"#fecaca", accentDark:"#991b1b", accentColor:"#dc2626", notice:NOTICE_MALADIE },
  // Formation (17/07, demandé par Olivier) : même principe que Maladie — pure
  // consultation (pas d'acquis, pas de report), archive A+1 + 2 ans, détail
  // mensuel des dates. Remplacé le 09/08 par le vrai Module Formation
  // (src/components/FormationView.jsx, accès sidebar "🎓 Formation") — la
  // carte "Formation" du panneau compteurs n'ouvre plus ce modal générique,
  // voir DashboardCompteurs (onOpenFormation) plus bas.
};

// Jours correspondant à un ou plusieurs codes équipe pour une année, avec
// gestion optionnelle du report A→A+1 par date (reportKey, identique au
// principe des congés), et d'un solde "acquis" modifiable (comme le Droit à
// congés) si acquisKey est fourni — automatiquement reporté d'une année sur
// l'autre sans remise à zéro si rollingAcquis est vrai (RQ/RN/TC/TY : pas de
// report par date, juste un solde continu). _depth limite la remontée
// récursive du solde roulant (protection anti-boucle, aucun agent n'aura de
// données sur des dizaines d'années).
export function computeCompteurAvecDetail(agent, schedule, agentProfiles, year, codes, reportKey, acquisKey, rollingAcquis, _depth){
  const depth = _depth || 0;
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const brut = [];
  Object.entries(schedule).forEach(([k,v])=>{
    if(!agent || !k.startsWith(agent.id+"-")) return;
    const dk = k.slice(agent.id.length+1);
    if(dk < start || dk > end) return;
    if(codes.includes(v?.equipe)) brut.push(dk);
    if(codes.includes(v?.equipe2)) brut.push(dk);
  });

  const grouper = (jours) => {
    const parMois = {};
    jours.sort().forEach(d=>{
      const mois = d.slice(0,7);
      if(!parMois[mois]) parMois[mois] = [];
      parMois[mois].push(d);
    });
    return parMois;
  };

  const profil = agentProfiles?.[agent?.id] || {};

  const computeAcquis = (total) => {
    if(!acquisKey) return null;
    const manuel = profil[acquisKey]?.[year];
    if(manuel !== undefined) return manuel;
    if(rollingAcquis && depth < 20){
      // Pas de saisie manuelle pour cette année : hérite du solde restant de
      // l'année précédente (remonte récursivement jusqu'à trouver une base).
      const prev = computeCompteurAvecDetail(agent, schedule, agentProfiles, year-1, codes, reportKey, acquisKey, rollingAcquis, depth+1);
      return prev.solde ?? 0;
    }
    return 0;
  };

  if(!reportKey){
    const total = brut.length;
    const acquis = computeAcquis(total);
    return { total, parMois: grouper(brut), tousJours: brut.sort(), reports: [], donnesAnneePrecedente: [], acquis, solde: acquis!==null ? acquis-total : null };
  }

  const reportsCetteAnnee = profil[reportKey]?.[year] || [];
  const reportsAnneePrecedente = profil[reportKey]?.[year-1] || [];
  const donnesAnneePrecedente = brut.filter(d=>reportsAnneePrecedente.includes(d));
  const propresAnnee = brut.filter(d=>!reportsAnneePrecedente.includes(d));
  const reportsValides = reportsCetteAnnee.filter(d=>{
    const v = schedule[`${agent.id}-${d}`];
    return codes.includes(v?.equipe) || codes.includes(v?.equipe2);
  });
  const tousJours = [...propresAnnee, ...reportsValides].sort();
  const total = tousJours.length;
  const acquis = computeAcquis(total);
  return { total, parMois: grouper(tousJours), tousJours, reports: reportsValides, donnesAnneePrecedente, acquis, solde: acquis!==null ? acquis-total : null };
}

// Sélecteur d'année réutilisé dans l'en-tête de chaque fenêtre (Congés, RP,
// RU, Fêtes...) — déplacé hors du bandeau "Compteurs" du haut (13/07, demandé
// par Olivier) pour l'alléger. Un seul état partagé (selectedYear du panneau
// compteurs) : changer l'année dans une fenêtre met aussi à jour les cartes.
function YearSwitcher({ year, availableYears, onChange }){
  return (
    <div onClick={e=>e.stopPropagation()}
      style={{display:"flex",gap:2,background:"rgba(255,255,255,.15)",borderRadius:8,padding:2,flexShrink:0}}>
      {availableYears.map(y=>(
        <button key={y} onClick={()=>onChange(y)}
          style={{border:"none",borderRadius:6,padding:"3px 9px",cursor:"pointer",
            fontSize:11,fontWeight:700,
            background:y===year?"rgba(255,255,255,.9)":"transparent",
            color:y===year?"#334155":"rgba(255,255,255,.75)",
            boxShadow:y===year?"0 1px 3px rgba(0,0,0,.12)":"none"}}>
          {y}
        </button>
      ))}
    </div>
  );
}

// Notice réglementaire repliable, générique — même principe que NoticeSection
// dans CetView.jsx (scrollIntoView à l'ouverture, sinon le contenu révélé
// peut rester hors écran en bas d'une modale déjà longue sur mobile).
// N'apparaît que si le compteur fournit un tableau `sections` (voir
// DETAIL_CONFIG.MA.notice) — les autres compteurs n'en ont pas.
function NoticeSection({ sections, accentDark, bgLight, borderLight }){
  const [ouvert, setOuvert] = useState(false);
  const contentRef = useRef(null);
  useEffect(()=>{ if(ouvert) contentRef.current?.scrollIntoView({behavior:"smooth",block:"start"}); },[ouvert]);
  return (
    <div style={{borderTop:"1px solid #e2e8f0",paddingTop:14}}>
      <button onClick={()=>setOuvert(v=>!v)} style={{background:"none",border:"none",color:accentDark,cursor:"pointer",fontSize:12,fontWeight:800,padding:0,display:"flex",alignItems:"center",gap:6}}>
        {ouvert?"▴":"▾"} 📖 Notice — ce qu'il faut savoir
      </button>
      {ouvert && (
        <div ref={contentRef} style={{marginTop:10,display:"flex",flexDirection:"column",gap:12}}>
          {sections.map(section=>(
            <div key={section.titre} style={{background:bgLight,border:`1px solid ${borderLight}`,borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontSize:12,fontWeight:800,color:accentDark,marginBottom:5}}>{section.titre}</div>
              {section.texte && <div style={{fontSize:11.5,color:"#334155",whiteSpace:"pre-line",lineHeight:1.5}}>{section.texte}</div>}
              {section.table && (
                // Colonnes serrées + libellés courts (09/08, demandé par Olivier :
                // "reduire la largeurs des colonne pour ne pas avoir a depalacer le
                // tableaux de gauche a droite") — tableLayout:"fixed" force les 5
                // colonnes à se partager toute la largeur disponible (jamais de
                // scroll), whiteSpace:"normal" laisse "Temps complet" et les
                // en-têtes complets (en infobulle) passer à la ligne plutôt que
                // pousser le tableau plus large que l'écran. overflowX:"auto"
                // gardé en filet de sécurité pur (jamais déclenché en pratique).
                <div style={{overflowX:"auto",marginTop:section.texte?8:0}}>
                  <table style={{borderCollapse:"collapse",width:"100%",tableLayout:"fixed",fontSize:9.5}}>
                    <thead>
                      <tr>
                        {section.table.headers.map((h,i)=>(
                          <th key={i} title={section.table.headersFull?.[i]||h}
                            style={{border:`1px solid ${borderLight}`,padding:"3px 2px",background:"#fff",color:accentDark,fontWeight:800,textAlign:"center",whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.15}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row,ri)=>(
                        <tr key={ri} style={row[0]==="Temps complet"?{fontWeight:800,background:"#fff"}:undefined}>
                          {row.map((cell,ci)=>(
                            <td key={ci} style={{border:`1px solid ${borderLight}`,padding:"3px 2px",color:"#334155",whiteSpace:"normal",wordBreak:"break-word",textAlign:"center"}}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Gestion des pertes RP/RU/RQ/Congés liées à un arrêt maladie (14/08,
// demandé par Olivier — voir getMaladiePerteJours plus haut pour le cadrage
// complet + la simplification du même jour, restauration retirée). Seul
// endroit de l'appli où un mouvement de ce type peut être créé — les autres
// compteurs n'affichent qu'un rappel en lecture seule (CompteurDetailModal
// via maladiePerteDeduction, CongesDashboardModal via maladiePerte). Fusionné
// directement sous "+ Ajouter une période" (même jour, Olivier : "est-ce
// qu'il n'y avait pas la possibilité de faire un module unique qui permettait
// d'ajouter une période de jour de maladie, et de préciser en dessous [...]
// le nombre de jours perdus selon chaque compteur ? Je trouve que le module
// commence déjà à faire fouillis") — reçoit periodeDu/periodeAu en props
// uniquement pour préremplir la note par défaut ("Arrêt du ... au ..."),
// aucune autre dépendance avec la saisie du planning (les 2 actions restent
// indépendantes : la période peut déjà exister dans le planning sans que ça
// bloque la déclaration des jours perdus, et inversement).
const COMPTEURS_MALADIE_PERTE = [
  {key:"RP", label:"RP"},
  {key:"RU", label:"RU"},
  {key:"RQ", label:"RQ"},
  {key:"CA", label:"Congés"},
];

function MaladiePertesSection({ agent, agentProfiles, setAgentProfiles, year, periodeDu, periodeAu }){
  const [rp, setRp] = useState("");
  const [ru, setRu] = useState("");
  const [rq, setRq] = useState("");
  const [ca, setCa] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const mvts = agentProfiles?.[agent?.id]?.maladiePertes || [];
  const mvtsAnnee = mvts.filter(m=>m.annee===year).sort((a,b)=>(b.dateSaisie||"").localeCompare(a.dateSaisie||""));

  const fmtDate = (d)=> d ? new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";
  const labelCompteur = (c)=> COMPTEURS_MALADIE_PERTE.find(x=>x.key===c)?.label || c;
  const noteParDefaut = periodeDu ? `Arrêt du ${fmtDate(periodeDu)}${periodeAu&&periodeAu!==periodeDu?` au ${fmtDate(periodeAu)}`:""}` : "";

  const enregistrer = () => {
    setErr(""); setOk("");
    const champs = [["RP",rp],["RU",ru],["RQ",rq],["CA",ca]];
    const valides = champs.map(([k,v])=>[k,parseInt(v,10)||0]).filter(([,n])=>n>0);
    if(valides.length===0){ setErr("Indique au moins un nombre de jours sur un des compteurs."); return; }
    const noteFinale = note.trim() || noteParDefaut || null;
    const dateSaisie = new Date().toISOString().slice(0,10);
    const nouveaux = valides.map(([compteur,jours])=>({
      id:`${Date.now()}-${compteur}-${Math.random().toString(36).slice(2)}`,
      compteur, jours, annee:year, note:noteFinale, dateSaisie,
    }));
    setAgentProfiles(prev=>({
      ...prev,
      [agent.id]:{ ...(prev[agent.id]||{}), maladiePertes:[...(prev[agent.id]?.maladiePertes||[]), ...nouveaux] }
    }));
    setOk(`Compteur${valides.length>1?"s":""} mis à jour — ${valides.map(([k,n])=>`${labelCompteur(k)} −${n}j`).join(", ")}.`);
    setRp("");setRu("");setRq("");setCa("");setNote("");
  };

  const retirer = (id) => {
    setAgentProfiles(prev=>({
      ...prev,
      [agent.id]:{ ...(prev[agent.id]||{}), maladiePertes:(prev[agent.id]?.maladiePertes||[]).filter(m=>m.id!==id) }
    }));
  };

  return (
    <div style={{marginTop:12,paddingTop:12,borderTop:"1px dashed #fecaca"}}>
      <div style={{fontSize:11,fontWeight:800,color:"#b91c1c",marginBottom:4}}>🤒 Jours perdus sur d'autres compteurs pour cet arrêt (optionnel)</div>
      <div style={{fontSize:10,fontWeight:500,color:"#475569",marginBottom:8}}>
        Indique combien de jours sont perdus sur chaque compteur pour cet arrêt — le restant est réduit immédiatement. Laisse à 0 les compteurs non concernés. C'est à toi de vérifier ensuite que les compteurs sont à jour.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
        {[["RP",rp,setRp],["RU",ru,setRu],["RQ",rq,setRq],["Congés",ca,setCa]].map(([lbl,val,setter])=>(
          <div key={lbl}>
            <div style={{fontSize:10,fontWeight:700,color:"#334155",textAlign:"center",marginBottom:2}}>{lbl}</div>
            <input type="number" min="0" value={val} onChange={e=>setter(e.target.value)} placeholder="0"
              style={{width:"100%",textAlign:"center",padding:"6px 2px",border:"1.5px solid #fecaca",borderRadius:8,fontSize:13,fontWeight:700,boxSizing:"border-box"}}/>
          </div>
        ))}
      </div>
      <input type="text" value={note} onChange={e=>setNote(e.target.value)}
        placeholder={noteParDefaut ? `Note (optionnel) — défaut : ${noteParDefaut}` : "Note (optionnel) — ex: référence de l'arrêt"}
        style={{marginTop:6,width:"100%",padding:"7px 9px",border:"1.5px solid #fecaca",borderRadius:8,fontSize:12,boxSizing:"border-box"}}/>
      <button onClick={enregistrer} style={{marginTop:6,background:"#b91c1c",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>Enregistrer les jours perdus</button>
      {err && <div style={{fontSize:11,fontWeight:600,color:"#dc2626",marginTop:6}}>{err}</div>}
      {ok && <div style={{fontSize:11,fontWeight:600,color:"#16a34a",marginTop:6}}>✓ {ok}</div>}

      {mvtsAnnee.length>0 && (
        <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:5}}>
          {mvtsAnnee.map(m=>(
            <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:"#fef2f2",border:"1px solid #fecaca",borderRadius:7,padding:"7px 10px"}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#334155"}}>{labelCompteur(m.compteur)} — {m.jours}j — {fmtDate(m.dateSaisie)}</div>
                {m.note && <div style={{fontSize:10,fontWeight:500,color:"#7f1d1d",marginTop:2,fontStyle:"italic"}}>{m.note}</div>}
              </div>
              <button onClick={()=>retirer(m.id)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>✕ Retirer</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompteurDetailModal({ agent, schedule, setSchedule, agentProfiles, setAgentProfiles, year, availableYears, onYearChange, codes, reportKey, acquisKey, rollingAcquis, ledgerKey, plafondMin, label, icon, gradientFrom, gradientTo, bgLight, borderLight, accentDark, accentColor, onClose, cetDeduction, cetTransfere, cetSource, cetBesoinValeur, notice, maladiePerteDeduction, maladiePertesGestion }){
  const data = useMemo(()=>computeCompteurAvecDetail(agent, schedule, agentProfiles, year, codes, reportKey, acquisKey, rollingAcquis), [agent, schedule, agentProfiles, year, codes, reportKey, acquisKey, rollingAcquis]);
  const ledgerData = useMemo(()=> ledgerKey ? computeLedgerSolde(agentProfiles, agent?.id, ledgerKey, plafondMin) : null, [agentProfiles, agent?.id, ledgerKey, plafondMin]);
  const [dateSnapshot, setDateSnapshot] = useState(()=>new Date().toISOString().slice(0,10));
  const [reportDate, setReportDate] = useState("");
  const [reportErr, setReportErr] = useState("");
  const [acquisInput, setAcquisInput] = useState(String(data.acquis ?? 0));
  useEffect(()=>{ setAcquisInput(String(data.acquis ?? 0)); },[data.acquis]);

  // Ajustement manuel en heures/minutes daté par mois (RN/TY) — même principe
  // que le journal TC : pas de remise à zéro, suivi en permanence.
  const [ledgerMois, setLedgerMois] = useState(()=>new Date().toISOString().slice(0,7));
  const [ledgerH, setLedgerH] = useState("0");
  const [ledgerM, setLedgerM] = useState("0");
  const [ledgerNeg, setLedgerNeg] = useState(false);

  const ajouterLedger = () => {
    const hh = parseInt(ledgerH,10)||0, mm = parseInt(ledgerM,10)||0;
    if(hh===0 && mm===0) return;
    const delta = (hh*60+mm) * (ledgerNeg?-1:1);
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, mois: ledgerMois, deltaMinutes: delta, saisiLe: new Date().toISOString().slice(0,10) };
    setAgentProfiles(prev=>({
      ...prev,
      [agent.id]:{ ...(prev[agent.id]||{}), [ledgerKey]: [...(prev[agent.id]?.[ledgerKey]||[]), entry] }
    }));
    setLedgerH("0"); setLedgerM("0"); setLedgerNeg(false);
  };

  const retirerLedger = (id) => {
    setAgentProfiles(prev=>({
      ...prev,
      [agent.id]:{ ...(prev[agent.id]||{}), [ledgerKey]: (prev[agent.id]?.[ledgerKey]||[]).filter(e=>e.id!==id) }
    }));
  };

  const prisJusquA = useMemo(()=>data.tousJours.filter(d=>d<=dateSnapshot).length, [data.tousJours, dateSnapshot]);
  const fmtDate = (d)=> d ? new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";

  const saveAcquis = () => {
    const n = parseInt(acquisInput,10);
    if(isNaN(n) || n<0){ setAcquisInput(String(data.acquis ?? 0)); return; }
    setAgentProfiles(prev=>({
      ...prev,
      [agent.id]:{
        ...(prev[agent.id]||{}),
        [acquisKey]:{ ...(prev[agent.id]?.[acquisKey]||{}), [year]: n },
      }
    }));
  };

  const ajouterReport = () => {
    setReportErr("");
    if(!reportDate) return;
    const v = schedule[`${agent.id}-${reportDate}`];
    const ok = codes.includes(v?.equipe) || codes.includes(v?.equipe2);
    if(!ok){ setReportErr(`Ce jour n'est pas saisi comme ${label} dans le planning perso — saisis-le d'abord, puis reviens ici.`); return; }
    if(data.reports.includes(reportDate)){ setReportErr("Ce jour est déjà comptabilisé en report."); return; }
    setAgentProfiles(prev=>{
      const existants = prev[agent.id]?.[reportKey]?.[year] || [];
      return { ...prev, [agent.id]:{ ...(prev[agent.id]||{}), [reportKey]: {...(prev[agent.id]?.[reportKey]||{}), [year]: [...existants, reportDate]} } };
    });
    setReportDate("");
  };

  const retirerReport = (d) => {
    setAgentProfiles(prev=>{
      const existants = prev[agent.id]?.[reportKey]?.[year] || [];
      return { ...prev, [agent.id]:{ ...(prev[agent.id]||{}), [reportKey]: {...(prev[agent.id]?.[reportKey]||{}), [year]: existants.filter(x=>x!==d)} } };
    });
  };

  // Saisie "du ... au ..." (13/08, demandé par Olivier — "certains compteurs
  // ... module maladie ... et ça remplit le planning perso") : écrit le code
  // principal du compteur (codes[0] — pour RP, "RP" et jamais "RPP") dans le
  // planning perso de chaque jour de la période en un seul geste, plutôt que
  // de devoir ouvrir DayEditPopup jour par jour. Bloque TOUTE la période si
  // un seul jour contient déjà autre chose (même principe que VT/Formation
  // dans ce projet — jamais d'écrasement silencieux), rien n'est écrit tant
  // qu'un conflit existe.
  // Ecriture partagee (13/08) : garde-fou "tout ou rien" + ecriture reelle,
  // reutilisee par la periode Du/Au ET par la selection multi-jours du mini-
  // calendrier ci-dessous — un seul endroit qui decide ce qui bloque, jamais
  // deux implementations qui pourraient diverger.
  const ecrireJoursCompteur = (jours) => {
    if(jours.length===0) return null;
    if(jours.length>366) return "Sélection trop grande (max 366 jours).";
    const agCp = agent?.immatriculation || agent?.cp || agent?.id;
    const occupes = jours.filter(dk=>{
      const v = schedule[`${agCp}-${dk}`];
      return v && (v.equipe || v.equipe2);
    });
    if(occupes.length){
      return `${occupes.length} jour${occupes.length>1?"s":""} déjà occupé${occupes.length>1?"s":""} dans le planning perso (${occupes.slice(0,3).map(fmtDate).join(", ")}${occupes.length>3?"…":""}) — modifie ou efface ${occupes.length>1?"ces jours":"ce jour"} d'abord, rien n'a été écrit.`;
    }
    const code = codes[0];
    jours.forEach(dk=>{
      const key = `${agCp}-${dk}`;
      const fullEntry = { equipe: code, prive: true };
      setSchedule(prev=>({...prev,[key]:fullEntry}));
      api.planning.saveEntry(agCp, dk, fullEntry).catch(e=>console.error(`Erreur sauvegarde ${label}:`, e));
    });
    return null;
  };

  const [periodeDu, setPeriodeDu] = useState("");
  const [periodeAu, setPeriodeAu] = useState("");
  const [periodeErr, setPeriodeErr] = useState("");
  const [periodeOk, setPeriodeOk] = useState("");
  const ajouterPeriode = () => {
    setPeriodeErr(""); setPeriodeOk("");
    if(!periodeDu) return;
    const debut = periodeDu, fin = periodeAu || periodeDu;
    if(fin < debut){ setPeriodeErr("La date de fin doit être après la date de début."); return; }
    const jours = [];
    let d = new Date(debut+"T12:00:00");
    const dFin = new Date(fin+"T12:00:00");
    while(d<=dFin){
      jours.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
      d.setDate(d.getDate()+1);
    }
    const err = ecrireJoursCompteur(jours);
    if(err){ setPeriodeErr(err); return; }
    setPeriodeOk(`${jours.length} jour${jours.length>1?"s":""} ${label.toLowerCase()} ajouté${jours.length>1?"s":""} au planning perso.`);
    setPeriodeDu(""); setPeriodeAu("");
  };

  // Mini-calendrier de sélection multi-jours (13/08, demandé par Olivier —
  // "un sélecteur de jour multiple", pour les jours dispersés qu'un simple
  // Du/Au ne peut pas couvrir, ex: "tous les repos d'un mois"). Complètement
  // séparé du VRAI calendrier "Mon planning" (zone fragile du projet) — un
  // petit widget autonome, cantonné à ce panneau, la sélection persiste en
  // changeant de mois affiché. Les jours déjà occupés sont visibles grisés
  // et non cliquables (contrairement à Du/Au, le conflit est visible avant
  // même de valider, pas seulement après).
  const [miniMonth, setMiniMonth] = useState(()=>{
    const now = new Date();
    return now.getFullYear()===year ? `${year}-${String(now.getMonth()+1).padStart(2,"0")}` : `${year}-01`;
  });
  const [joursSelect, setJoursSelect] = useState([]);
  const [selectErr, setSelectErr] = useState("");
  const [selectOk, setSelectOk] = useState("");
  const [miniYear, miniMonthNum] = miniMonth.split("-").map(Number);
  const miniDaysInMonth = new Date(miniYear, miniMonthNum, 0).getDate();
  const miniFirstDow = new Date(miniYear, miniMonthNum-1, 1).getDay();
  const miniOffset = miniFirstDow===0 ? 6 : miniFirstDow-1;
  const changerMiniMois = (delta) => {
    let m = miniMonthNum + delta, y = miniYear;
    if(m<1){ m=12; y--; } else if(m>12){ m=1; y++; }
    setMiniMonth(`${y}-${String(m).padStart(2,"0")}`);
  };
  const toggleJourSelect = (dk, occupe) => {
    if(occupe) return;
    setSelectErr(""); setSelectOk("");
    setJoursSelect(prev=> prev.includes(dk) ? prev.filter(x=>x!==dk) : [...prev,dk].sort());
  };
  const ajouterSelection = () => {
    setSelectErr(""); setSelectOk("");
    if(joursSelect.length===0) return;
    const err = ecrireJoursCompteur(joursSelect);
    if(err){ setSelectErr(err); return; }
    setSelectOk(`${joursSelect.length} jour${joursSelect.length>1?"s":""} ${label.toLowerCase()} ajouté${joursSelect.length>1?"s":""} au planning perso.`);
    setJoursSelect([]);
  };

  const moisTries = Object.keys(data.parMois).sort();

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
        <div style={{background:`linear-gradient(135deg,${gradientFrom},${gradientTo})`,padding:"18px 20px",display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",position:"sticky",top:0}}>
          <div style={{color:"#fff",fontSize:16,fontWeight:800,flex:"1 1 auto",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{icon} {label} {year}</div>
          {availableYears&&onYearChange&&<YearSwitcher year={year} availableYears={availableYears} onChange={onYearChange}/>}
          <button onClick={onClose} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer",opacity:.8,flexShrink:0}}>✕</button>
        </div>

        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:16}}>

          {/* Solde en heures/minutes (RN/TY, 17/07) — journal d'ajustements
              manuels datés par mois, suivi en permanence (pas de remise à
              zéro annuelle), complètement indépendant du compteur de jours
              ci-dessous (qui reste, lui, purement informatif). */}
          {ledgerKey && ledgerData && (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{background:bgLight,border:`2px solid ${plafondMin!=null&&ledgerData.solde>=plafondMin?"#fcd34d":borderLight}`,borderRadius:12,padding:"14px 12px",textAlign:"center"}}>
                <div style={{fontSize:11,fontWeight:700,color:accentDark}}>Solde {label} (en cours)</div>
                <div style={{fontSize:32,fontWeight:900,color:plafondMin!=null&&ledgerData.solde>=plafondMin?"#d97706":accentColor,lineHeight:1,marginTop:4}}>{minToHM(ledgerData.solde)}</div>
                <div style={{fontSize:10,fontWeight:600,color:"#64748b",marginTop:4}}>
                  {ledgerData.dernierSaisiLe ? `Mis à jour le ${new Date(ledgerData.dernierSaisiLe).toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}` : "Aucune saisie pour l'instant"}
                </div>
                {/* Plafond 32h00 (13/08, TY — même mécanisme que TC) : au-delà,
                    l'excédent des ajouts n'est jamais crédité (computeLedgerSolde),
                    remonté ici comme rappel "à vérifier/payer en heures sup". */}
                {plafondMin!=null && ledgerData.solde>=plafondMin && (
                  <div style={{fontSize:11,fontWeight:700,color:"#b45309",marginTop:6}}>⚠️ Plafond 32h00 atteint — tout nouvel ajout au-delà sera à payer automatiquement (heures sup), jamais crédité au solde</div>
                )}
                {plafondMin!=null && ledgerData.horsPlafond>0 && (
                  <div style={{fontSize:10,fontWeight:600,color:"#92400e",marginTop:4}}>{minToHM(ledgerData.horsPlafond)} déjà passés en heures sup depuis le début du suivi</div>
                )}
              </div>

              <div>
                <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:6}}>+ Ajuster le solde</div>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <button onClick={()=>setLedgerNeg(n=>!n)}
                    style={{border:"1.5px solid #cbd5e1",borderRadius:8,padding:"7px 10px",cursor:"pointer",
                      background:ledgerNeg?"#fee2e2":"#dcfce7",color:ledgerNeg?"#dc2626":"#16a34a",fontWeight:800,fontSize:13}}>
                    {ledgerNeg?"−":"+"}
                  </button>
                  <input type="number" min="0" value={ledgerH} onChange={e=>setLedgerH(e.target.value)}
                    style={{width:52,textAlign:"center",padding:"7px 4px",border:`1.5px solid ${borderLight}`,borderRadius:8,fontSize:14,fontWeight:700}}/>
                  <span style={{fontSize:12,fontWeight:700,color:"#334155"}}>h</span>
                  <input type="number" min="0" max="59" value={ledgerM} onChange={e=>setLedgerM(e.target.value)}
                    style={{width:52,textAlign:"center",padding:"7px 4px",border:`1.5px solid ${borderLight}`,borderRadius:8,fontSize:14,fontWeight:700}}/>
                  <span style={{fontSize:12,fontWeight:700,color:"#334155"}}>min</span>
                  <input type="month" value={ledgerMois} onChange={e=>setLedgerMois(e.target.value)}
                    style={{padding:"6px 8px",border:`1.5px solid ${borderLight}`,borderRadius:8,fontSize:12,fontWeight:600}}/>
                  <button onClick={ajouterLedger} style={{background:accentDark,color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>Ajouter</button>
                </div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:5}}>Indépendant du planning perso — indique juste le mois concerné pour repère, n'affecte pas le calcul.</div>
              </div>

              {ledgerData.ledger.length>0 && (
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {ledgerData.ledger.map(e=>{
                    const [an,mo] = (e.mois||"").split("-").map(Number);
                    return(
                      <div key={e.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:7,padding:"7px 10px"}}>
                        <span style={{fontSize:11,fontWeight:600,color:"#334155"}}>{mo?`${MOIS_L[mo-1]} ${an}`:"—"}</span>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:12,fontWeight:800,color:e.deltaMinutes<0?"#dc2626":"#16a34a"}}>{e.deltaMinutes<0?"−":"+"}{minToHM(Math.abs(e.deltaMinutes)).replace("-","")}</span>
                          <button onClick={()=>retirerLedger(e.id)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:11,fontWeight:700,textDecoration:"underline"}}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{borderTop:"1px solid #e2e8f0"}}/>
            </div>
          )}

          {/* Basculement semestriel TQ→TY (16/08, nouveau module) — TQ n'a
              aucun code de planning (codes:[]), donc rien de la section
              "jours" plus bas (Ajouter une période/Sélectionner des jours/
              historique par mois) ne le concerne, voir codes.length>0
              ci-dessous qui l'exclut proprement. */}
          {ledgerKey==="tqLedger" && (
            <TqBasculeSection agent={agent} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} soldeTQ={ledgerData.solde} accentDark={accentDark} accentColor={accentColor} bgLight={bgLight} borderLight={borderLight}/>
          )}

          {/* Acquis/Pris/Restant — pour les compteurs qui s'accumulent au fil
              du temps (comme le Droit à congés) : l'agent déclare son solde
              déjà acquis avant que l'appli ne le suive, combiné au calcul du
              planning pour donner le vrai restant. */}
          {acquisKey && (
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid #e2e8f0"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#334155"}}>Acquis</div>
                <input type="number" min="0" value={acquisInput}
                  onChange={e=>setAcquisInput(e.target.value)}
                  onBlur={saveAcquis}
                  onKeyDown={e=>{ if(e.key==="Enter") e.currentTarget.blur(); }}
                  style={{width:"100%",textAlign:"center",fontSize:20,fontWeight:900,color:accentColor,border:`1.5px solid ${borderLight}`,borderRadius:8,padding:"2px 0",background:"#fff",marginTop:2}}/>
                <div style={{fontSize:9,color:"#475569",marginTop:2}}>
                  {rollingAcquis?"modifiable · reporté auto":"modifiable"}
                </div>
              </div>
              <div style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid #e2e8f0"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#334155"}}>Pris</div>
                <div style={{fontSize:20,fontWeight:900,color:accentColor}}>{data.total}</div>
              </div>
              <div style={{flex:1,background:"#f8fafc",borderRadius:10,padding:"10px 8px",textAlign:"center",border:`1px solid ${(data.solde-(cetDeduction||0)-(maladiePerteDeduction||0))<0?"#fca5a5":"#e2e8f0"}`}}>
                <div style={{fontSize:11,fontWeight:700,color:(data.solde-(cetDeduction||0)-(maladiePerteDeduction||0))<0?"#dc2626":"#334155"}}>Restant</div>
                <div style={{fontSize:20,fontWeight:900,color:(data.solde-(cetDeduction||0)-(maladiePerteDeduction||0))<0?"#dc2626":"#16a34a"}}>{data.solde-(cetDeduction||0)-(maladiePerteDeduction||0)}</div>
              </div>
            </div>
          )}

          {/* Récap CET (Phase 2, 06/08) : jours de ce compteur transférés au
              CET — jamais écrit dans le planning perso, purement un rappel
              (voir CetView.jsx, getCetTransfereJours). N'affecte cette vue
              que si cetTransfere est fourni (RQ/RN/TY uniquement). */}
          {cetTransfere && cetTransfere.total > 0 && (
            <div style={{fontSize:11,fontWeight:600,color:"#5b21b6",background:"#faf5ff",border:"1px solid #e9d5ff",borderRadius:8,padding:"8px 10px"}}>
              🏦 {cetTransfere.total} jour{cetTransfere.total>1?"s":""} transféré{cetTransfere.total>1?"s":""} au CET
              {cetTransfere.parSousCompte.courant>0 && ` — Compte courant : ${cetTransfere.parSousCompte.courant}j`}
              {cetTransfere.parSousCompte.finActivite>0 && ` — Compte fin d'activité : ${cetTransfere.parSousCompte.finActivite}j`}
            </div>
          )}

          {/* Perte maladie (14/08) : jours de ce compteur perdus suite à un
              arrêt maladie — jamais écrit dans le planning perso, purement un
              rappel en lecture seule (voir getMaladiePerteJours). Gérée
              exclusivement depuis le module Maladie (MaladiePertesSection,
              fusionnée sous "+ Ajouter une période" ci-dessous). */}
          {maladiePerteDeduction>0 && (
            <div style={{fontSize:11,fontWeight:600,color:"#b91c1c",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 10px"}}>
              🤒 {maladiePerteDeduction} jour{maladiePerteDeduction>1?"s":""} perdu{maladiePerteDeduction>1?"s":""} suite à un arrêt maladie — gestion depuis le module Maladie.
            </div>
          )}

          {/* Épargner directement au CET depuis ce compteur (07/08, demandé
              par Olivier) — uniquement pour RQ/RN/TY (voir cetSource dans
              DETAIL_CONFIG), widget partagé — voir CetView.jsx EpargneCetWidget. */}
          {cetSource && (
            <EpargneCetWidget agent={agent} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} source={cetSource} sourceLabel={label} year={year} besoinValeur={!!cetBesoinValeur}/>
          )}

          {/* Tout ce bloc "jours" (pris jusqu'au, ajout de période, mini-
              calendrier, historique par mois) ne concerne que les compteurs
              qui ont un vrai code de planning (codes non vide) — TQ (16/08)
              est un pur ledger manuel sans code associé, codes:[], donc rien
              de tout ça ne s'applique et ne doit s'afficher pour lui. */}
          {codes.length>0 && (<>
          <div style={{background:bgLight,border:`1.5px solid ${borderLight}`,borderRadius:10,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:150}}>
              <div style={{fontSize:12,fontWeight:700,color:accentDark}}>{label} pris jusqu'au</div>
              <input type="date" value={dateSnapshot} onChange={e=>setDateSnapshot(e.target.value)}
                style={{marginTop:4,padding:"6px 9px",border:`1.5px solid ${borderLight}`,borderRadius:7,fontSize:12,fontWeight:600,color:accentDark,background:"#fff"}}/>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:28,fontWeight:900,color:accentColor,lineHeight:1}}>{prisJusquA}</div>
              <div style={{fontSize:10,fontWeight:600,color:accentDark,marginTop:2}}>jour{prisJusquA>1?"s":""}</div>
            </div>
          </div>

          {!acquisKey && <div style={{fontSize:12,fontWeight:700,color:"#334155"}}>Total {year} : {data.total} jour{data.total>1?"s":""}</div>}

          {/* Saisie "du ... au ..." (13/08, demandé par Olivier) : écrit le
              code du compteur dans le planning perso pour toute la période en
              un seul geste — bloque tout si un seul jour est déjà occupé. */}
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:6}}>+ Ajouter une période</div>
            <div style={{fontSize:10,fontWeight:500,color:"#475569",marginBottom:8}}>
              Écrit "{codes[0]}" dans le planning perso pour chaque jour — bloqué si un seul jour de la période contient déjà autre chose.
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <input type="date" value={periodeDu} onChange={e=>{setPeriodeDu(e.target.value);setPeriodeErr("");setPeriodeOk("");}}
                style={{flex:1,minWidth:120,padding:"7px 9px",border:`1.5px solid ${borderLight}`,borderRadius:8,fontSize:12}}/>
              <input type="date" value={periodeAu} onChange={e=>{setPeriodeAu(e.target.value);setPeriodeErr("");setPeriodeOk("");}}
                style={{flex:1,minWidth:120,padding:"7px 9px",border:`1.5px solid ${borderLight}`,borderRadius:8,fontSize:12}}/>
              <button onClick={ajouterPeriode} style={{background:accentDark,color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Ajouter</button>
            </div>
            <div style={{fontSize:10,color:"#94a3b8",marginTop:5}}>Laisse "Au" vide pour un seul jour.</div>
            {periodeErr && <div style={{fontSize:11,fontWeight:600,color:"#dc2626",marginTop:6}}>{periodeErr}</div>}
            {periodeOk && <div style={{fontSize:11,fontWeight:600,color:"#16a34a",marginTop:6}}>✓ {periodeOk}</div>}

            {/* Jours perdus sur d'autres compteurs, fusionné ici (14/08,
                demandé par Olivier) — reste dans la même carte que l'ajout de
                période plutôt qu'une section à part, pour ne pas surcharger
                le module Maladie. Voir MaladiePertesSection. */}
            {maladiePertesGestion && (
              <MaladiePertesSection agent={agent} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} year={year} periodeDu={periodeDu} periodeAu={periodeAu}/>
            )}
          </div>

          {/* Mini-calendrier multi-jours (13/08, demandé par Olivier) : pour
              les jours dispersés dans un même mois (ex. "tous les repos du
              mois") que Du/Au ne peut pas couvrir en une fois. Widget autonome
              — jamais le vrai calendrier "Mon planning". */}
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:6}}>+ Sélectionner des jours (dispersés)</div>
            <div style={{fontSize:10,fontWeight:500,color:"#475569",marginBottom:8}}>
              Coche les jours à ajouter, même non consécutifs. Les jours grisés sont déjà occupés dans le planning perso.
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <button onClick={()=>changerMiniMois(-1)} style={{border:"none",background:"none",cursor:"pointer",fontSize:16,color:accentDark,padding:"2px 8px",fontWeight:700}}>‹</button>
              <span style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>{MOIS_L[miniMonthNum-1]} {miniYear}</span>
              <button onClick={()=>changerMiniMois(1)} style={{border:"none",background:"none",cursor:"pointer",fontSize:16,color:accentDark,padding:"2px 8px",fontWeight:700}}>›</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
              {["L","M","M","J","V","S","D"].map((j,i)=>(
                <div key={i} style={{fontSize:9,fontWeight:700,color:"#94a3b8",textAlign:"center"}}>{j}</div>
              ))}
              {Array.from({length:miniOffset}).map((_,i)=><div key={"o"+i}/>)}
              {Array.from({length:miniDaysInMonth}).map((_,i)=>{
                const day = i+1;
                const dk = `${miniYear}-${String(miniMonthNum).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const agCpMini = agent?.immatriculation || agent?.cp || agent?.id;
                const v = schedule[`${agCpMini}-${dk}`];
                const occupe = !!(v && (v.equipe || v.equipe2));
                const isSel = joursSelect.includes(dk);
                return (
                  <button key={dk} onClick={()=>toggleJourSelect(dk,occupe)} disabled={occupe}
                    style={{
                      aspectRatio:"1", border:`1.5px solid ${isSel?accentDark:occupe?"#e2e8f0":borderLight}`,
                      borderRadius:6, background:isSel?accentDark:occupe?"#f1f5f9":"#fff",
                      color:isSel?"#fff":occupe?"#cbd5e1":"#334155",
                      fontSize:11, fontWeight:700, cursor:occupe?"default":"pointer",
                      display:"flex", alignItems:"center", justifyContent:"center", padding:0,
                    }}>
                    {day}
                  </button>
                );
              })}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8,gap:8}}>
              <span style={{fontSize:11,fontWeight:600,color:"#475569"}}>{joursSelect.length} jour{joursSelect.length>1?"s":""} sélectionné{joursSelect.length>1?"s":""}</span>
              <button onClick={ajouterSelection} disabled={joursSelect.length===0}
                style={{background:joursSelect.length===0?"#cbd5e1":accentDark,color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:joursSelect.length===0?"default":"pointer",fontSize:12,fontWeight:700}}>+ Ajouter</button>
            </div>
            {selectErr && <div style={{fontSize:11,fontWeight:600,color:"#dc2626",marginTop:6}}>{selectErr}</div>}
            {selectOk && <div style={{fontSize:11,fontWeight:600,color:"#16a34a",marginTop:6}}>✓ {selectOk}</div>}
          </div>

          {data.donnesAnneePrecedente.length>0 && (
            <div style={{fontSize:11,fontWeight:500,color:"#334155",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px"}}>
              ℹ️ {data.donnesAnneePrecedente.length} jour{data.donnesAnneePrecedente.length>1?"s":""} de {year} compté{data.donnesAnneePrecedente.length>1?"s":""} sur le solde {year-1} (report) — non inclus ci-dessus. Voir le tableau de bord {year-1}.
            </div>
          )}

          {moisTries.length===0 ? (
            <div style={{fontSize:12,color:"#475569",textAlign:"center",padding:12}}>Aucun {label.toLowerCase()} saisi cette année.</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {moisTries.map(mois=>{
                const dates = data.parMois[mois];
                const horsAnnee = !mois.startsWith(String(year));
                const moisNum = parseInt(mois.slice(5,7),10)-1;
                const anneeMois = mois.slice(0,4);
                return(
                  <div key={mois} style={{border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 12px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>{MOIS_L[moisNum]}{horsAnnee?` ${anneeMois}`:""}</span>
                      <span style={{fontSize:12,fontWeight:700,color:accentDark}}>{dates.length}j</span>
                    </div>
                    <div style={{fontSize:10,fontWeight:600,color:"#475569",marginTop:4}}>
                      {dates.map((d,i)=>{
                        // Repère visuel RPP (04/08, demandé par Olivier — d'abord un
                        // astérisque, jugé peu lisible, remplacé le même jour par la date
                        // entière en rouge) : RP et RPP restent regroupés dans un seul
                        // decompte (codes ci-dessus), ceci n'est qu'un repère visuel, sans
                        // rien changer au calcul ni au regroupement existants.
                        const v = schedule[`${agent.id}-${d}`];
                        const isRPP = codes.includes("RPP") && (v?.equipe==="RPP"||v?.equipe2==="RPP");
                        return (
                          <span key={d} style={isRPP?{color:"#dc2626",fontWeight:800}:undefined}>
                            {i>0 && <span style={{color:"#475569",fontWeight:600}}> · </span>}
                            {fmtDate(d)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {codes.includes("RPP") && moisTries.length>0 && (
            <div style={{fontSize:10,fontWeight:600,color:"#dc2626"}}>Date en rouge = jour RPP</div>
          )}
          </>)}

          {reportKey && (
            <div style={{borderTop:"1px solid #e2e8f0",paddingTop:14}}>
              <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:6}}>↪️ Report sur {year+1}</div>
              <div style={{fontSize:10,fontWeight:500,color:"#475569",marginBottom:8}}>
                Un jour de {label.toLowerCase()} pris sur {year+1} mais décompté du solde {year} (tolérance de report).
              </div>
              {data.reports.length>0 && (
                <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:8}}>
                  {data.reports.map(d=>(
                    <div key={d} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f8fafc",borderRadius:7,padding:"5px 9px"}}>
                      <span style={{fontSize:11,fontWeight:600,color:"#334155"}}>{fmtDate(d)}</span>
                      <button onClick={()=>retirerReport(d)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:12,fontWeight:700}}>✕ Retirer</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:"flex",gap:6}}>
                <input type="date" value={reportDate} onChange={e=>{setReportDate(e.target.value);setReportErr("");}}
                  style={{flex:1,padding:"7px 9px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:12}}/>
                <button onClick={ajouterReport} style={{background:accentDark,color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Ajouter</button>
              </div>
              {reportErr && <div style={{fontSize:11,fontWeight:600,color:"#dc2626",marginTop:6}}>{reportErr}</div>}
            </div>
          )}

          {notice && <NoticeSection sections={notice} accentDark={accentDark} bgLight={bgLight} borderLight={borderLight}/>}

          {/* Définition courte (16/08, demandé par Olivier pour distinguer
              TC/TY/TQ — "sans que ce soit lourd", donc juste une ligne, pas
              de section repliable comme la notice ci-dessus). */}
          {label==="TY" && (
            <div style={{fontSize:10.5,color:"#94a3b8",borderTop:"1px solid #f1f5f9",paddingTop:8}}>
              TY : dépassement de la durée du temps de travail des semestres précédents.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Bascule semestrielle TQ→TY (16/08, nouveau module) — jamais automatique,
// déclenchée par l'agent depuis le module TQ. Voir basculerTQversTY/
// annulerTransfertTQ (fonctions pures, à côté de computeLedgerSolde) pour la
// logique de répartition/annulation ; ce composant n'est que l'affichage.
function TqBasculeSection({ agent, agentProfiles, setAgentProfiles, soldeTQ, accentDark, accentColor, bgLight, borderLight }){
  const semestre = getSemestreCourant();
  const moisCourant = new Date().getMonth(); // 5=juin (fin S1), 11=décembre (fin S2)
  const dansDernierMoisDuSemestre = moisCourant===5 || moisCourant===11;
  const transferts = (agentProfiles?.[agent.id]?.tqTransferts || []).slice().sort((a,b)=>(b.dateTransfert||"").localeCompare(a.dateTransfert||""));
  const [msg, setMsg] = useState(null);

  const basculer = () => {
    const res = basculerTQversTY(agentProfiles, agent.id, setAgentProfiles);
    if(!res){ setMsg({ok:false, text:"Rien à basculer — le solde TQ est nul."}); return; }
    const text = res.montantPaye>0
      ? `${minToHM(res.montantVersTY)} basculés vers TY, ${minToHM(res.montantPaye)} seront payés le mois suivant (plafond TY atteint).`
      : `${minToHM(res.montantVersTY)} basculés vers TY.`;
    setMsg({ok:true, text});
  };
  const annuler = (transfertId) => {
    annulerTransfertTQ(agentProfiles, agent.id, transfertId, setAgentProfiles);
    setMsg(null);
  };

  return (
    <div style={{borderTop:"1px solid #e2e8f0",paddingTop:14,display:"flex",flexDirection:"column",gap:10}}>
      {dansDernierMoisDuSemestre && soldeTQ>0 && (
        <div style={{fontSize:11,fontWeight:700,color:"#9a3412",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,padding:"8px 10px"}}>
          📅 Fin de semestre — pense à vérifier tes compteurs et à basculer ton TQ vers TY quand tu es prêt (pas d'obligation de le faire aujourd'hui).
        </div>
      )}
      <div style={{background:bgLight,border:`1.5px solid ${borderLight}`,borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:accentDark}}>📅 Semestre en cours</div>
          <div style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>{semestre.label}</div>
        </div>
        <button onClick={basculer} disabled={soldeTQ<=0}
          style={{background:soldeTQ<=0?"#cbd5e1":accentDark,color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",cursor:soldeTQ<=0?"default":"pointer",fontSize:12,fontWeight:700}}>
          🔁 Basculer vers TY
        </button>
      </div>
      {msg && (
        <div style={{fontSize:11,fontWeight:600,color:msg.ok?"#16a34a":"#64748b",background:msg.ok?"#f0fdf4":"#f8fafc",border:`1px solid ${msg.ok?"#bbf7d0":"#e2e8f0"}`,borderRadius:8,padding:"8px 10px"}}>
          {msg.ok?"✓ ":""}{msg.text}
        </div>
      )}
      {transferts.length>0 && (
        <div>
          <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:6}}>Historique des basculements</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {transferts.map(t=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:7,padding:"7px 10px"}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#334155"}}>{t.semestre} — {t.dateTransfert ? new Date(t.dateTransfert).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—"}</div>
                  <div style={{fontSize:10,color:"#64748b"}}>{minToHM(t.montantVersTY)} → TY{t.montantPaye>0?` · ${minToHM(t.montantPaye)} payés`:""}</div>
                </div>
                <button onClick={()=>annuler(t.id)} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:11,fontWeight:700,textDecoration:"underline"}}>↺ Annuler</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BILAN GLOBAL (03/08) ─────────────────────────────────────────────────────
// Vue d'ensemble des jours ET des heures que l'agent a encore à sa disposition
// — uniquement les compteurs que l'agent POSE lui-même à sa discrétion (Congés,
// RU, RQ, VT, Fêtes). RP est volontairement exclu (demandé explicitement par
// Olivier le 03/08 : "c'est le bilan global des jours que l'agent peut poser
// et a sa disposition", RP n'entre pas dans ce cadre). Chaque ligne réutilise
// directement les fonctions de calcul déjà existantes (computeDashboardConges,
// computeCompteurAvecDetail, computeDashboardVT, computeFetesLignes) — une
// seule source de vérité par compteur, jamais de recalcul parallèle qui
// pourrait diverger.
function computeBilanGlobalJours(agent, schedule, agentProfiles, year, dateProjection){
  const congesData = computeDashboardConges(agent, schedule, agentProfiles, year);
  const ruData = computeCompteurAvecDetail(agent, schedule, agentProfiles, year, DETAIL_CONFIG.RU.codes, DETAIL_CONFIG.RU.reportKey, DETAIL_CONFIG.RU.acquisKey, DETAIL_CONFIG.RU.rollingAcquis);
  const rqData = computeCompteurAvecDetail(agent, schedule, agentProfiles, year, DETAIL_CONFIG.RQ.codes, DETAIL_CONFIG.RQ.reportKey, DETAIL_CONFIG.RQ.acquisKey, DETAIL_CONFIG.RQ.rollingAcquis);
  const vtData = computeDashboardVT(agent, schedule, agentProfiles, year);
  const fetesInfo = computeFetesLignes(agent, schedule, agentProfiles, year);

  // Fêtes n'a pas d'"Acquis"/solde continu comme les 4 autres — c'est une
  // liste de dates nommées avec un statut (réglée / à traiter / perdue / à
  // venir). "Pris" = fêtes réglées cette année (prises ou payées), "Restant"
  // = fêtes encore à traiter (même définition que la cloche 🔔 de la carte
  // Fêtes). Pas de projection "avant une date choisie" pour Fêtes : ça ne
  // correspond à rien de calculable de la même façon qu'un solde de jours qui
  // s'épuise au fil de l'année — colonne affichée à "—" pour cette ligne.
  const feteReglees = (fetesInfo.lignes||[]).filter(l=>l && (l.override?.epargneCet || l.statut==="prise"||l.statut==="payee"||l.statut==="payee_auto"));
  const feteATraiter = (fetesInfo.lignes||[]).filter(l=>l && !l.override?.epargneCet && (l.statut==="attente"||l.statut==="perdue_probable"));

  const projeter = (data) => dateProjection
    ? (data.acquis ?? data.entitlement ?? 0) - (data.tousJours||[]).filter(d=>d<=dateProjection).length
    : null;

  const lignes = [
    {key:"conges", label:"Congés", acquis:congesData.entitlement, pris:congesData.pris, restant31:congesData.solde, restantProj:projeter(congesData)},
    {key:"RU",     label:"RU",     acquis:ruData.acquis??0,       pris:ruData.total,     restant31:(ruData.acquis??0)-ruData.total, restantProj:projeter(ruData)},
    {key:"RQ",     label:"RQ",     acquis:rqData.acquis??0,       pris:rqData.total,     restant31:(rqData.acquis??0)-rqData.total, restantProj:projeter(rqData)},
    {key:"VT",     label:"VT",     acquis:vtData.entitlement,     pris:vtData.pris,      restant31:vtData.solde, restantProj:projeter(vtData)},
    {key:"FETE",   label:"Fêtes",  acquis:null,                   pris:feteReglees.length, restant31:feteATraiter.length, restantProj:null},
  ];

  const totalRestant31 = lignes.reduce((s,l)=>s+(l.restant31||0),0);
  return {lignes, totalRestant31};
}

// TC/RN/TY sont déjà des soldes continus (ledger, pas de notion d'Acquis/Pris
// annuel depuis la refonte du 17/07) — le récap se limite donc au solde actuel
// de chacun + un total, pas de colonnes Pris/Restant comme pour les jours.
function computeBilanGlobalHeures(tcData, rnLedgerData, tyLedgerData){
  const lignes = [
    {key:"TC", label:"TC", solde:tcData.solde},
    {key:"RN", label:"RN", solde:rnLedgerData.solde},
    {key:"TY", label:"TY", solde:tyLedgerData.solde},
  ];
  const totalMinutes = lignes.reduce((s,l)=>s+(l.solde||0),0);
  return {lignes, totalMinutes};
}

function BilanGlobalModal({agent, schedule, agentProfiles, setAgentProfiles, pausesData, year, availableYears, onYearChange, onClose}){
  const agKey = agent?.immatriculation||agent?.cp||agent?.id;
  const [dateProjection, setDateProjection] = useState("");

  const bilanJours = useMemo(()=>computeBilanGlobalJours(agent, schedule, agentProfiles, year, dateProjection||null), [agent, schedule, agentProfiles, year, dateProjection]);
  const tcData = useMemo(()=>computeDashboardTC(agent, schedule, agentProfiles, pausesData, year), [agent, schedule, agentProfiles, pausesData, year]);
  const rnLedgerData = useMemo(()=>computeLedgerSolde(agentProfiles, agKey, "rnLedger"), [agentProfiles, agKey]);
  const tyLedgerData = useMemo(()=>computeLedgerSolde(agentProfiles, agKey, "tyLedger", PLAFOND_32H_MIN), [agentProfiles, agKey]);
  const bilanHeures = useMemo(()=>computeBilanGlobalHeures(tcData, rnLedgerData, tyLedgerData), [tcData, rnLedgerData, tyLedgerData]);
  // Rappel CET (08/08, demandé par Olivier) — volontairement à part du
  // total ci-dessus : ce sont des jours déjà épargnés, pas forcément à
  // prendre dans l'année, mais toujours à la disposition de l'agent. Le
  // solde CET est cumulatif (jamais remis à zéro), donc jamais mélangé au
  // calcul "Restant au 31/12" des autres compteurs.
  const cetData = useMemo(()=>computeDashboardCet(agentProfiles, agKey, year), [agentProfiles, agKey, year]);

  // Durée de référence d'une journée pour le calculateur jours⇄heures —
  // mémorisée par agent (indépendante de l'année, comme le solde ledger
  // TC/RN/TY lui-même). Saisie en heures + minutes séparées pour rester
  // cohérent avec les autres formulaires h/min déjà en place (ledger TC...).
  const dureeJourMin = agentProfiles[agKey]?.bilanGlobalDureeJourMin ?? null;
  const [dureeH, setDureeH] = useState(dureeJourMin!=null ? Math.floor(dureeJourMin/60) : "");
  const [dureeM, setDureeM] = useState(dureeJourMin!=null ? dureeJourMin%60 : "");
  const enregistrerDuree = () => {
    const h = parseInt(dureeH,10)||0, m = parseInt(dureeM,10)||0;
    const total = h*60+m;
    setAgentProfiles(p=>({...p,[agKey]:{...(p[agKey]||{}),bilanGlobalDureeJourMin: total>0?total:null}}));
  };

  const totalMinutesAbs = Math.abs(bilanHeures.totalMinutes);
  const signe = bilanHeures.totalMinutes<0 ? -1 : 1;
  const joursEquivalents = dureeJourMin ? Math.floor(totalMinutesAbs/dureeJourMin)*signe : null;
  const resteMin = dureeJourMin ? (totalMinutesAbs%dureeJourMin)*signe : null;
  const totalGlobalJoursEquivalents = dureeJourMin!=null ? bilanJours.totalRestant31 + joursEquivalents : null;

  const fmtDate = (d)=> d ? new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:750,display:"flex",alignItems:"center",justifyContent:"center",padding:12}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,maxWidth:640,width:"100%",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 10px 40px rgba(0,0,0,.25)"}}>
        <div style={{background:"linear-gradient(135deg,#0f4c81,#1e3a5f)",padding:"16px 20px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:1}}>
          <span style={{fontSize:18}}>🧮</span>
          <div style={{flex:1,color:"#fff",fontSize:15,fontWeight:800}}>Bilan Global {year}</div>
          {availableYears&&onYearChange&&<YearSwitcher year={year} availableYears={availableYears} onChange={onYearChange}/>}
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:10,width:32,height:32,cursor:"pointer",fontSize:16}}>✕</button>
        </div>

        <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:20}}>
          <div style={{fontSize:11,color:"#64748b",lineHeight:1.5}}>
            📆 Congés, RU, RQ, VT et Fêtes : les jours que tu peux poser à ta discrétion. RP n'est pas inclus (ce n'est pas un jour que tu choisis de poser).
          </div>

          {/* ── Date de projection ── */}
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <label style={{fontSize:12,fontWeight:700,color:"#475569"}}>Me projeter avant une date :</label>
            <input type="date" value={dateProjection} onChange={e=>setDateProjection(e.target.value)}
              style={{padding:"6px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13}}/>
            {dateProjection&&<button onClick={()=>setDateProjection("")} style={{background:"#fef2f2",color:"#dc2626",border:"1.5px solid #fecaca",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>✕ Effacer</button>}
          </div>

          {/* ── Section Jours ── */}
          <div>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>📅 Jours</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{textAlign:"left",color:"#94a3b8",fontSize:10,textTransform:"uppercase"}}>
                    <th style={{padding:"4px 6px"}}>Compteur</th>
                    <th style={{padding:"4px 6px"}}>Acquis</th>
                    <th style={{padding:"4px 6px"}}>Pris</th>
                    <th style={{padding:"4px 6px"}}>{dateProjection?`Restant avant ${fmtDate(dateProjection)}`:"Restant avant date"}</th>
                    <th style={{padding:"4px 6px"}}>Restant au 31/12</th>
                  </tr>
                </thead>
                <tbody>
                  {bilanJours.lignes.map(l=>(
                    <tr key={l.key} style={{borderTop:"1px solid #f1f5f9"}}>
                      <td style={{padding:"7px 6px",fontWeight:700,color:"#1e293b"}}>{l.label}</td>
                      <td style={{padding:"7px 6px",color:"#64748b"}}>{l.acquis??"—"}</td>
                      <td style={{padding:"7px 6px",color:"#64748b"}}>{l.pris}</td>
                      <td style={{padding:"7px 6px",color:"#64748b"}}>{l.restantProj??"—"}</td>
                      <td style={{padding:"7px 6px",fontWeight:800,fontSize:14,color:l.restant31<0?"#dc2626":"#16a34a"}}>{l.restant31}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:"2px solid #1e293b"}}>
                    <td style={{padding:"8px 6px",fontWeight:800,color:"#1e293b"}}>Total</td>
                    <td/><td/><td/>
                    <td style={{padding:"8px 6px",fontWeight:900,fontSize:16,color:"#0f4c81"}}>{bilanJours.totalRestant31} j</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Section Heures ── */}
          <div>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>⏱️ Heures</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{textAlign:"left",color:"#94a3b8",fontSize:10,textTransform:"uppercase"}}>
                    <th style={{padding:"4px 6px"}}>Compteur</th>
                    <th style={{padding:"4px 6px"}}>Solde actuel</th>
                  </tr>
                </thead>
                <tbody>
                  {bilanHeures.lignes.map(l=>(
                    <tr key={l.key} style={{borderTop:"1px solid #f1f5f9"}}>
                      <td style={{padding:"7px 6px",fontWeight:700,color:"#1e293b"}}>{l.label}</td>
                      <td style={{padding:"7px 6px",fontWeight:800,fontSize:14,color:l.solde<0?"#dc2626":"#16a34a"}}>{minToHM(l.solde)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:"2px solid #1e293b"}}>
                    <td style={{padding:"8px 6px",fontWeight:800,color:"#1e293b"}}>Total</td>
                    <td style={{padding:"8px 6px",fontWeight:900,fontSize:16,color:"#0f4c81"}}>{minToHM(bilanHeures.totalMinutes)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Calculateur jours ⇄ heures ── */}
          <div style={{background:"#f8fafc",borderRadius:12,padding:"12px 14px",border:"1.5px solid #e2e8f0"}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:6}}>🧮 Convertir le solde d'heures en jours</div>
            <div style={{fontSize:10,color:"#64748b",marginBottom:10,lineHeight:1.5}}>
              Indique la durée d'une journée pour toi (ex: 07h43, 08h02, ou une autre valeur libre) — mémorisée pour la prochaine fois.
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <input type="number" placeholder="h" value={dureeH} onChange={e=>setDureeH(e.target.value)}
                style={{width:56,padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,textAlign:"center"}}/>
              <span style={{fontSize:12,color:"#64748b"}}>h</span>
              <input type="number" placeholder="min" value={dureeM} onChange={e=>setDureeM(e.target.value)}
                style={{width:56,padding:"6px 8px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,textAlign:"center"}}/>
              <span style={{fontSize:12,color:"#64748b"}}>min</span>
              <button onClick={enregistrerDuree} style={{background:"#0f4c81",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Enregistrer</button>
            </div>
            {dureeJourMin!=null&&(
              <div style={{marginTop:10,fontSize:13}}>
                Avec des journées de <b>{minToHM(dureeJourMin)}</b>, ton solde de <b>{minToHM(bilanHeures.totalMinutes)}</b> représente :
                <div style={{fontSize:20,fontWeight:900,color:"#0f4c81",marginTop:4}}>{joursEquivalents} j <span style={{fontSize:13,fontWeight:700,color:"#64748b"}}>+ {minToHM(resteMin)}</span></div>
              </div>
            )}
          </div>

          {/* ── Total global final ── */}
          <div style={{background:"linear-gradient(135deg,#0f4c81,#1e3a5f)",borderRadius:12,padding:"14px 16px",color:"#fff"}}>
            <div style={{fontSize:11,fontWeight:700,opacity:.85,marginBottom:6,textTransform:"uppercase",letterSpacing:.4}}>Total à ta disposition</div>
            <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
              <div><div style={{fontSize:22,fontWeight:900}}>{bilanJours.totalRestant31} j</div><div style={{fontSize:10,opacity:.8}}>en jours</div></div>
              <div><div style={{fontSize:22,fontWeight:900}}>{minToHM(bilanHeures.totalMinutes)}</div><div style={{fontSize:10,opacity:.8}}>en heures</div></div>
            </div>
            {totalGlobalJoursEquivalents!=null&&(
              <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,.25)",fontSize:12}}>
                Tout compris (jours + heures converties) : <b style={{fontSize:15}}>{totalGlobalJoursEquivalents} j</b>
              </div>
            )}
          </div>

          {/* ── Rappel CET (à part, demandé par Olivier) ── */}
          <div style={{background:"#faf5ff",border:"1.5px dashed #c4b5fd",borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:12,fontWeight:800,color:"#5b21b6",marginBottom:6}}>🏦 Compte Épargne Temps (CET)</div>
            <div style={{fontSize:10,color:"#64748b",marginBottom:10,lineHeight:1.5}}>
              Volontairement à part du total ci-dessus : ce sont des jours déjà épargnés, pas forcément à prendre dans l'année — mais qui restent à ta disposition.
            </div>
            <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:22,fontWeight:900,color:"#5b21b6"}}>{cetData.soldeTotal} j</div>
                <div style={{fontSize:10,color:"#64748b"}}>Solde CET total</div>
              </div>
              {cetData.comptes.map(c=>(
                <div key={c.key}>
                  <div style={{fontSize:16,fontWeight:800,color:"#7c3aed"}}>{c.solde} j</div>
                  <div style={{fontSize:10,color:"#64748b"}}>{c.icone} {c.label} (plafond {c.plafond}j)</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TABLEAU DE BORD COMPTEURS ───────────────────────────────────────────────
// Ordre par défaut des cases compteurs, réorganisable par agent (08/08,
// demandé par Olivier — glisser-déposer, ordre mémorisé par agent même s'il
// change d'avis ensuite). "PF" et "TC" étaient forcées côte à côte (17/07) —
// dissocié le 08/08 sur demande explicite d'Olivier : "comme on peut
// réorganiser comme on veut, tu peux les dissocier pour les déplacer
// individuellement" — chacune est désormais une unité déplaçable à part
// entière, comme n'importe quelle autre carte.
const COMPTEUR_CARD_KEYS = ["conges","travail","RP","RU","RQ","FETE","RN","PF","TC","TY","TQ","VT","CET","FOR","MA"];

function DashboardCompteurs({agent, schedule, setSchedule, agentProfiles, setAgentProfiles, isOwnProfile, isAdmin, onOpenFormation}){
  const currentYear = new Date().getFullYear();
  // Année et état ouvert/fermé mémorisés (localStorage) : on reste sur ce qui
  // était consulté après une actualisation, plutôt que de revenir par défaut
  // à l'année en cours ou de refermer le panneau à chaque F5.
  const [selectedYear, setSelectedYear] = usePersist("compteursSelectedYear", currentYear);
  const year = selectedYear;
  const start = `${year}-01-01`;
  const end   = `${year}-12-31`;
  // Année A+1 incluse car les congés (et parfois d'autres compteurs) sont posés en avance
  const availableYears = [currentYear+1, currentYear, currentYear-1, currentYear-2];

  // Compteurs calculés depuis le planning
  const computed = useMemo(()=>{
    if(!agent) return {};
    const c = {travail:0,RP:0,RU:0,RQ:0,RN:0,TC:0,TY:0,CA:0,CP:0,MA:0,VT:0,ABS:0,FOR:0,NU:0,FETE:0};
    // Comptabilise un code equipe (M/AM/N/J/RP/CA/...) dans le bon compteur.
    // Appelee separement pour equipe ET equipe2 : une case peut combiner un
    // repos/absence (equipe) avec une nuit accolee (equipe2="N") qui reste
    // une vraie journee travaillee a comptabiliser, pas juste le repos.
    const tally = (eq) => {
      if(!eq) return;
      // Fêtes légales (F1,F2…) et JF → compteur FETE, pas travail
      if(CODES_FETES[eq] || eq==="JF"){
        c.FETE++;
      } else if(["M","AM","N","J","FOR"].includes(eq)){
        // FOR (Formation) compte aussi comme jour travaillé (17/07, demandé
        // par Olivier) — en plus d'alimenter son propre compteur "Formation"
        // ci-dessous (eqCompteur), pas à la place.
        c.travail++;
      }
      // RPP alimente le même compteur que RP (palette dissociée, même comptabilisation)
      const eqCompteur = eq==="RPP" ? "RP" : eq;
      if(c[eqCompteur]!==undefined) c[eqCompteur]++;
    };
    Object.entries(schedule).forEach(([key,val])=>{
      if(!key.startsWith(agent.id+"-")) return;
      const dk = key.slice(agent.id.length+1);
      if(dk < start || dk > end) return;
      // "Nuit seule" est encodee avec equipe=equipe2="N" (marqueur technique
      // redondant, voir isNuitSeule dans DayEditPopup) : une seule vraie nuit,
      // ne pas la compter deux fois. Dans tous les autres cas (repos/absence
      // + nuit accolee, ex RP+N), equipe et equipe2 sont deux journees
      // distinctes a comptabiliser chacune.
      const isNuitSeule = val?.equipe==="N" && val?.equipe2==="N";
      if(isNuitSeule){
        tally("N");
      } else {
        tally(val?.equipe);
        tally(val?.equipe2);
      }
      // Formation (09/08) : periode independante (val.formation), separee de
      // equipe/equipe2 — ne compte comme jour travaille + n'alimente le
      // compteur Formation QUE si l'agent a libere sa journee principale
      // (equipe vide), signe qu'il a valide sa participation. Tant que le
      // badge "Formation" coexiste avec une journee non tranchee, ce jour
      // continue de compter normalement sous son code d'origine (equipe),
      // jamais compte deux fois.
      if(val?.formation && !val?.equipe){
        tally("FOR");
      }
    });
    return c;
  },[agent,schedule,year]);

  // 04/08 : le correcteur manuel generique (+/-, bouton "Corriger") a ete
  // retire - confirme sans aucun usage reel sur les 10 comptes existants
  // (juste des _updatedAt vides), et desactivait la clique sur 9 des 13
  // cartes pendant qu'il etait actif. Les 4 cartes qu'il touchait (Jours
  // travailles/Fetes/Maladie/Formation) seront ameliorees carte par carte
  // si besoin plutot que via ce mecanisme generique. Voir CLAUDE.md.
  const val = (key) => computed[key]||0;

  const congesData = useMemo(()=>computeDashboardConges(agent, schedule, agentProfiles, year), [agent, schedule, agentProfiles, year]);
  const CONGES_ANNUELS = congesData.entitlement;
  const congesPris = congesData.pris;
  const solde = congesData.solde;

  // RP, RU, RQ, RN, TC, TY ont chacun leur propre outil dédié (report par
  // date pour RP/RU, solde roulant pour RQ/RN/TC/TY) : la carte doit refléter
  // le même total que le tableau de bord dédié, pas le calcul brut.
  const rpData = useMemo(()=>computeCompteurAvecDetail(agent, schedule, agentProfiles, year, DETAIL_CONFIG.RP.codes, DETAIL_CONFIG.RP.reportKey, DETAIL_CONFIG.RP.acquisKey, DETAIL_CONFIG.RP.rollingAcquis), [agent, schedule, agentProfiles, year]);
  const ruData = useMemo(()=>computeCompteurAvecDetail(agent, schedule, agentProfiles, year, DETAIL_CONFIG.RU.codes, DETAIL_CONFIG.RU.reportKey, DETAIL_CONFIG.RU.acquisKey, DETAIL_CONFIG.RU.rollingAcquis), [agent, schedule, agentProfiles, year]);
  const rqData = useMemo(()=>computeCompteurAvecDetail(agent, schedule, agentProfiles, year, DETAIL_CONFIG.RQ.codes, DETAIL_CONFIG.RQ.reportKey, DETAIL_CONFIG.RQ.acquisKey, DETAIL_CONFIG.RQ.rollingAcquis), [agent, schedule, agentProfiles, year]);
  const rnData = useMemo(()=>computeCompteurAvecDetail(agent, schedule, agentProfiles, year, DETAIL_CONFIG.RN.codes, DETAIL_CONFIG.RN.reportKey, DETAIL_CONFIG.RN.acquisKey, DETAIL_CONFIG.RN.rollingAcquis), [agent, schedule, agentProfiles, year]);
  const tyData = useMemo(()=>computeCompteurAvecDetail(agent, schedule, agentProfiles, year, DETAIL_CONFIG.TY.codes, DETAIL_CONFIG.TY.reportKey, DETAIL_CONFIG.TY.acquisKey, DETAIL_CONFIG.TY.rollingAcquis), [agent, schedule, agentProfiles, year]);
  const DETAIL_DATA_BY_KEY = {RP:rpData, RU:ruData, RQ:rqData, RN:rnData, TY:tyData};
  // RN/TY (17/07) : solde en heures/minutes, suivi en continu (journal
  // d'ajustements manuels datés par mois), affiché sur la carte à la place
  // du nombre de jours — voir DETAIL_CONFIG.RN/TY (ledgerKey).
  const rnLedgerData = useMemo(()=>computeLedgerSolde(agentProfiles, agent?.id, "rnLedger"), [agentProfiles, agent?.id]);
  const tyLedgerData = useMemo(()=>computeLedgerSolde(agentProfiles, agent?.id, "tyLedger", PLAFOND_32H_MIN), [agentProfiles, agent?.id]);
  // TQ (16/08) : solde sans plafond (le plafond ne s'applique qu'une fois
  // basculé vers TY, voir basculerTQversTY) — même principe que RN.
  const tqLedgerData = useMemo(()=>computeLedgerSolde(agentProfiles, agent?.id, "tqLedger"), [agentProfiles, agent?.id]);

  // Fêtes légales : nombre de fêtes "à traiter" (attente ou probable perdue)
  // pour la cloche sur la carte — évite d'ouvrir la fenêtre juste pour savoir
  // si quelque chose demande une action.
  const fetesInfo = useMemo(()=>computeFetesLignes(agent, schedule, agentProfiles, year), [agent, schedule, agentProfiles, year]);
  const nbFetesATraiter = fetesInfo.lignes.filter(l=>!l.override?.epargneCet && (l.statut==="attente"||l.statut==="perdue_probable")).length;

  // Module Formation (09/08) : cloche sur la carte tant qu'une notification
  // d'inscription AFO n'a pas été vue par l'agent (voir FormationView.jsx,
  // materialisee cote backend au lancement d'une session).
  const agKeyForm = agent?.immatriculation||agent?.cp||agent?.id;
  const nbFormationsNonVues = (agentProfiles[agKeyForm]?.formationNotifications||[]).filter(n=>!n.acquitte).length;

  // VT (temps partiel) : même principe que Congés (carte reflète le même total
  // que le tableau de bord dédié), avec en plus le workflow Demandé→Accordé→Pris.
  const vtData = useMemo(()=>computeDashboardVT(agent, schedule, agentProfiles, year), [agent, schedule, agentProfiles, year]);

  // CET (Compte Épargne Temps, 06/08) : module isolé dans CetView.jsx, voir
  // ce fichier pour toute la logique métier — App.jsx ne fait qu'afficher la
  // carte et ouvrir le modal, comme pour n'importe quel autre compteur.
  const cetData = useMemo(()=>computeDashboardCet(agentProfiles, agent?.id, year), [agentProfiles, agent?.id, year]);
  // Déduction CET (Phase 2, 06/08) : RQ n'a pas de ledger, son solde CET-
  // transféré est recalculé à la volée depuis cetLedger et simplement
  // soustrait à l'affichage (carte + CompteurDetailModal via la prop
  // cetDeduction) — computeCompteurAvecDetail lui-même n'est jamais touché.
  const cetTransfereRQ = useMemo(()=>getCetTransfereJours(agentProfiles, agent?.id, year, "RQ"), [agentProfiles, agent?.id, year]);
  const cetTransfereRN = useMemo(()=>getCetTransfereJours(agentProfiles, agent?.id, year, "RN"), [agentProfiles, agent?.id, year]);
  const cetTransfereTY = useMemo(()=>getCetTransfereJours(agentProfiles, agent?.id, year, "TY"), [agentProfiles, agent?.id, year]);
  const cetTransfereTC = useMemo(()=>getCetTransfereJours(agentProfiles, agent?.id, year, "TC"), [agentProfiles, agent?.id, year]);
  // Congés (Phase 4, 06/08) : même principe que RQ — jours-based, aucun
  // ledger à écrire, juste soustrait à l'affichage (carte + CongesDashboardModal).
  const cetTransfereCA = useMemo(()=>getCetTransfereJours(agentProfiles, agent?.id, year, "CA"), [agentProfiles, agent?.id, year]);
  // Fêtes proposables au formulaire "+ Nouvelle épargne" du panneau CET
  // lui-même (08/08, source RCF) — même liste/mêmes motifs que le widget
  // dédié du panneau Fêtes (computeFeteOptionsCet, partagée pour ne pas
  // dupliquer la logique disabled/reason à 2 endroits).
  const cetFeteOptions = useMemo(
    () => computeFeteOptionsCet(agent, schedule, agentProfiles, year),
    [agent, schedule, agentProfiles, year]
  );
  const CET_TRANSFERE_BY_KEY = {RQ:cetTransfereRQ, RN:cetTransfereRN, TY:cetTransfereTY, TC:cetTransfereTC};

  // Perte maladie (14/08, demandé par Olivier) : jours perdus sur RP/RU/RQ/
  // Congés suite à un arrêt — même principe que la déduction CET ci-dessus
  // (recalculé à la volée depuis maladiePertes, jamais stocké dans le solde
  // du compteur lui-même). Gestion (créer/restaurer) exclusivement depuis le
  // module Maladie, voir MaladiePertesSection.
  const maladiePerteRP = useMemo(()=>getMaladiePerteJours(agentProfiles, agent?.id, "RP", year), [agentProfiles, agent?.id, year]);
  const maladiePerteRU = useMemo(()=>getMaladiePerteJours(agentProfiles, agent?.id, "RU", year), [agentProfiles, agent?.id, year]);
  const maladiePerteRQ = useMemo(()=>getMaladiePerteJours(agentProfiles, agent?.id, "RQ", year), [agentProfiles, agent?.id, year]);
  const maladiePerteCA = useMemo(()=>getMaladiePerteJours(agentProfiles, agent?.id, "CA", year), [agentProfiles, agent?.id, year]);
  const MALADIE_PERTE_BY_KEY = {RP:maladiePerteRP, RU:maladiePerteRU, RQ:maladiePerteRQ};

  // Pause Figée (17/07) : données chargées ici (pas dans la modale) pour être
  // partagées avec le calcul du solde TC, qui en dépend (voir computeDashboardTC).
  const agentIdPauses = agent?.cp || agent?.immatriculation || agent?.id;
  const [pausesData, setPausesData] = useState([]);
  const [pausesLoading, setPausesLoading] = useState(true);
  const [pausesError, setPausesError] = useState(null);
  const rechargerPauses = () => {
    if(!agentIdPauses) return;
    setPausesError(null);
    api.pauses.getAll(agentIdPauses).then(rows=>{
      setPausesData(Array.isArray(rows)?rows:[]);
      setPausesLoading(false);
    }).catch(()=>{
      setPausesError("Impossible de charger les pauses figées. Vérifie ta connexion et réessaie.");
      setPausesLoading(false);
    });
  };
  useEffect(()=>{ setPausesLoading(true); rechargerPauses(); },[agentIdPauses]); // eslint-disable-line

  // TC (17/07) : solde en heures/minutes plafonné, alimenté par les pauses
  // figées validées — remplace l'ancien compteur générique "jours".
  const tcData = useMemo(()=>computeDashboardTC(agent, schedule, agentProfiles, pausesData, year), [agent, schedule, agentProfiles, pausesData, year]);
  const nbPausesEnAttente = pausesData.filter(p=>!p.fia_done).length;

  // Libellé "mois en cours" réutilisé par TC/RN/TY (17/07, demandé par
  // Olivier : la carte doit clairement dire que le solde ledger affiché est
  // celui d'aujourd'hui, pas un solde figé de fin d'année).
  const moisEnCoursLabel = new Date().toLocaleDateString("fr-FR",{month:"long",year:"numeric"});

  // Module VT masquable (09/08, demandé par Olivier — "c'est pour les agent
  // à temps partiel. pas utile de l'avoir en permanence pour ceux qui n'y
  // sont pas [...] le compteur VT doit etre presenté par defaut") — réglé
  // dans "Mon profil" (ProfilPersoView), persisté par agent
  // (agentProfiles[id].vtModuleActif). Absent/undefined = actif (défaut).
  // Purement visuel ("meme masqué tout ce qui est dedans est comptabilisé")
  // : ne touche à aucun calcul, seulement à la présence de la carte ici.
  const vtActif = agentProfiles?.[agentIdPauses]?.vtModuleActif !== false;
  // Palette harmonisée (19/08, demandé par Olivier — "unité de couleurs tout
  // en gardant les touches de couleur") : les 14 teintes ci-dessous viennent
  // toutes de la même échelle Tailwind "600" (même saturation/luminosité),
  // réparties sur la roue chromatique pour rester mutuellement distinguables
  // — remplace l'ancienne palette hétéroclite (mélange de tons vifs et
  // ternes, VT et Congés partageaient même la même couleur #eab308).
  const CARDS = [
    {key:"conges",  label:"Congés",          color:"#d97706", subtitle:`Pris : ${congesPris} / Acquis : ${CONGES_ANNUELS}`, alert:(solde-cetTransfereCA.total-maladiePerteCA)<5},
    {key:"travail", label:"Jours travaillés", color:"#dc2626", subtitle:`Année ${year}`},
    {key:"RP",      label:"RP",              color:"#16a34a", subtitle:"Pris au 31/12"},
    {key:"RU",      label:"RU",              color:"#ea580c", subtitle:"Pris au 31/12"},
    {key:"RQ",      label:"RQ",              color:"#c026d3", subtitle:"Restant au 31/12"},
    {key:"FETE",    label:"Fêtes",           color:"#db2777", subtitle: nbFetesATraiter>0 ? `🔔 ${nbFetesATraiter} à traiter` : "Jours fête", alert: nbFetesATraiter>0},
    {key:"RN",      label:"RN",              color:"#4f46e5", subtitle:`Solde — ${moisEnCoursLabel}`},
    {key:"PF",      label:"Pause Figée",     color:"#0d9488", subtitle: nbPausesEnAttente>0 ? `⏳ ${nbPausesEnAttente} à vérifier` : "Pauses figées", alert: nbPausesEnAttente>0},
    {key:"TC",      label:"TC",              color:"#0284c7", subtitle: tcData.solde>=TC_PLAFOND_MIN ? "Plafond 32h00 · ATTEINT" : `Solde — ${moisEnCoursLabel}`, alert: tcData.solde>=TC_PLAFOND_MIN},
    {key:"TY",      label:"TY",              color:"#9333ea", subtitle: tyLedgerData.solde>=PLAFOND_32H_MIN ? "Plafond 32h00 · ATTEINT" : `Solde — ${moisEnCoursLabel}`, alert: tyLedgerData.solde>=PLAFOND_32H_MIN},
    {key:"TQ",      label:"TQ",              color:"#ca8a04", subtitle:`Solde ${getSemestreCourant().label}`},
    ...(vtActif ? [{key:"VT", label:"VT",    color:"#65a30d", subtitle:`Solde : ${vtData.solde} / ${vtData.entitlement}`, alert:vtData.solde<2}] : []),
    {key:"CET",     label:"CET",             color:"#7c3aed", subtitle:"Compte épargne temps"},
    {key:"FOR",     label:"Formation",       color:"#0891b2", subtitle: nbFormationsNonVues>0 ? `🔔 ${nbFormationsNonVues} à voir` : "Jours formation dans l'année", alert: nbFormationsNonVues>0},
    {key:"MA",      label:"Maladie",         color:"#e11d48", subtitle:"Jours maladie dans l'année"},
  ];

  const [ouvert, setOuvert] = usePersist("compteursOuvert", false);
  const [showTravailDash, setShowTravailDash] = useState(false);
  const [showCongesDash, setShowCongesDash] = useState(false);
  const [showFetesDash, setShowFetesDash] = useState(false);
  const [showVtDash, setShowVtDash] = useState(false);
  const [showCetDash, setShowCetDash] = useState(false);
  const [showPauseFigeeDash, setShowPauseFigeeDash] = useState(false);
  const [showTcDash, setShowTcDash] = useState(false);
  const [showBilanGlobal, setShowBilanGlobal] = useState(false);
  const [openDetailKey, setOpenDetailKey] = useState(null); // RP/RU/RQ/RN/TY/MA/FOR

  // Réorganisation des cases par glisser-déposer (08/08, demandé par Olivier)
  // — ordre mémorisé par agent (agentProfiles[id].compteursOrdre), jamais
  // perdu même après plusieurs changements. La liste sauvegardée est
  // "nettoyée" à chaque lecture : une clé obsolète (compteur supprimé depuis)
  // est ignorée, une clé manquante (nouveau compteur ajouté depuis) est
  // ajoutée en fin de liste — jamais besoin de migration.
  const savedOrdre = agentProfiles?.[agent?.id]?.compteursOrdre;
  const orderedKeys = (Array.isArray(savedOrdre) && savedOrdre.length > 0)
    ? [...savedOrdre.filter(k => COMPTEUR_CARD_KEYS.includes(k)), ...COMPTEUR_CARD_KEYS.filter(k => !savedOrdre.includes(k))]
    : COMPTEUR_CARD_KEYS;

  const [reorderMode, setReorderMode] = useState(false);
  const [dragKey, setDragKey] = useState(null);
  const [overKey, setOverKey] = useState(null);

  const commitOrdre = (keys) => {
    setAgentProfiles(prev => ({ ...prev, [agent.id]: { ...(prev[agent.id] || {}), compteursOrdre: keys } }));
  };
  const reinitialiserOrdre = () => commitOrdre(null);

  const onCardPointerDown = (key) => (e) => {
    if (!reorderMode) return;
    e.preventDefault();
    setDragKey(key);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onGridPointerMove = (e) => {
    if (!dragKey) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.closest?.("[data-reorder-key]");
    const k = target?.getAttribute("data-reorder-key");
    if (k && k !== overKey) setOverKey(k);
  };
  const onGridPointerUp = () => {
    if (dragKey && overKey && dragKey !== overKey) {
      const next = orderedKeys.slice();
      const from = next.indexOf(dragKey);
      const to = next.indexOf(overKey);
      if (from !== -1 && to !== -1) {
        next.splice(from, 1);
        next.splice(to, 0, dragKey);
        commitOrdre(next);
      }
    }
    setDragKey(null); setOverKey(null);
  };

  return(
    <div style={{margin:"20px 0 8px",borderRadius:14,border:"1.5px solid var(--border)",
      overflow:"hidden",background:"var(--bg-card)",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>

      {/* ── Header accordéon cliquable ── */}
      {/* nowrap sur le conteneur externe : la flèche reste TOUJOURS à droite,
          jamais renvoyée à la ligne — seul le contenu interne (titre + résumé)
          peut s'enrouler si la largeur manque. */}
      <div onClick={()=>setOuvert(o=>!o)}
        style={{display:"flex",alignItems:"center",gap:8,padding:"12px 16px",
          cursor:"pointer",userSelect:"none",
          // Bleu-marine de la marque (identique au logo/écran de connexion) au lieu
          // du violet d'origine, jugé moche par Olivier le 17/07 — plus cohérent
          // avec le reste de l'identité visuelle de l'appli.
          background:"linear-gradient(135deg,#0f4c81,#1e3a5f)",
          borderBottom:ouvert?"1.5px solid #2d5a8e":"none",
          flexWrap:"nowrap"}}>

        <div style={{display:"flex",alignItems:"center",gap:8,flex:"1 1 auto",minWidth:0,flexWrap:"wrap"}}>
          <span style={{fontSize:13,fontWeight:800,color:"#fff",letterSpacing:-.2}}>
            {selectedYear} - Tableau de bords
          </span>
        </div>

        {/* Sélecteur d'année, visible uniquement replié → déplié (demandé par
            Olivier le 06/08, remplace l'ancien résumé de compteurs replié) */}
        {ouvert&&<YearSwitcher year={selectedYear} availableYears={availableYears} onChange={setSelectedYear}/>}

        <span style={{fontSize:13,color:"rgba(255,255,255,.8)",fontWeight:700,
          transform:ouvert?"rotate(0)":"rotate(-90deg)",
          display:"inline-block",transition:"transform .2s",flexShrink:0}}>▼</span>
      </div>

      {/* ── Contenu dépliable ── */}
      {ouvert&&<div style={{padding:"12px 14px"}}>
        {/* Sous-header actions */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <span style={{fontSize:9,color:"#94a3b8"}}>⚠️ Selon planning saisi</span>
          <div style={{flex:1}}/>
          {reorderMode&&savedOrdre&&(
            <button onClick={e=>{e.stopPropagation();reinitialiserOrdre();}}
              style={{background:"var(--bg-card)",color:"var(--text-secondary)",border:"1.5px solid var(--border)",
                borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>
              ↺ Réinitialiser l'ordre
            </button>
          )}
          <button onClick={e=>{e.stopPropagation();setReorderMode(r=>!r);}}
            style={{background:reorderMode?"#16a34a":"#0f4c81",color:"#fff",
              border:"none",borderRadius:8,padding:"5px 10px",
              cursor:"pointer",fontSize:11,fontWeight:700}}>
            {reorderMode?"✓ Terminé":"🔀 Réorganiser"}
          </button>
          <button onClick={e=>{e.stopPropagation();setShowBilanGlobal(true);}}
            style={{background:"#0f4c81",color:"#fff",
              border:"none",borderRadius:8,padding:"5px 10px",
              cursor:"pointer",fontSize:11,fontWeight:700}}>
            🧮 Bilan Global
          </button>
        </div>
        {reorderMode&&(
          <div style={{fontSize:10,color:"#5b21b6",background:"#faf5ff",border:"1px solid #e9d5ff",
            borderRadius:8,padding:"6px 10px",marginBottom:10}}>
            🔀 Maintiens une case puis fais-la glisser vers sa nouvelle place — ton ordre est mémorisé automatiquement.
          </div>
        )}

      {/* Grille compteurs */}
      {(()=>{
        const renderCard = (card) => {
          const v = card.key==="conges" ? congesData.solde - cetTransfereCA.total - maladiePerteCA
            : card.key==="VT" ? vtData.pris
            : card.key==="CET" ? cetData.soldeTotal
            : card.key==="PF" ? pausesData.filter(p=>p.fia_done && String(p.date_jour).slice(0,10)>=start && String(p.date_jour).slice(0,10)<=end).length
            : card.key==="TC" ? minToHM(tcData.solde)
            : card.key==="RN" ? minToHM(rnLedgerData.solde)
            : card.key==="TY" ? minToHM(tyLedgerData.solde)
            : card.key==="TQ" ? minToHM(tqLedgerData.solde)
            // RQ affiche le restant (Acquis - Pris) au lieu du nombre de jours pris
            // (17/07, demandé par Olivier) — RP/RU restent sur le total "pris".
            : card.key==="RQ" ? (rqData.solde ?? rqData.total) - cetTransfereRQ.total - maladiePerteRQ
            : DETAIL_DATA_BY_KEY[card.key] ? DETAIL_DATA_BY_KEY[card.key].total : val(card.key);
          const isTravailCard = card.key==="travail";
          const isCongesCard = card.key==="conges";
          const isFetesCard = card.key==="FETE";
          const isVtCard = card.key==="VT";
          const isCetCard = card.key==="CET";
          const isPfCard = card.key==="PF";
          const isTcCard = card.key==="TC";
          const isFormationCard = card.key==="FOR";
          const isDetailCard = !!DETAIL_CONFIG[card.key];
          const isClickable = !reorderMode && (isTravailCard || isCongesCard || isFetesCard || isVtCard || isCetCard || isPfCard || isTcCard || isFormationCard || isDetailCard);
          return(
            <div key={card.key}
              onClick={!isClickable ? undefined : isTravailCard ? ()=>setShowTravailDash(true) : isCongesCard ? ()=>setShowCongesDash(true) : isFetesCard ? ()=>setShowFetesDash(true) : isVtCard ? ()=>setShowVtDash(true) : isCetCard ? ()=>setShowCetDash(true) : isPfCard ? ()=>setShowPauseFigeeDash(true) : isTcCard ? ()=>setShowTcDash(true) : isFormationCard ? onOpenFormation : isDetailCard ? ()=>setOpenDetailKey(card.key) : undefined}
              style={{
              background:"var(--bg-card)",borderRadius:12,
              // Encadrement teinté (19/08, "unité de couleurs tout en gardant
              // les touches de couleur") : reprend la couleur propre à chaque
              // tuile en très faible opacité (2A hex ≈ 16%) au lieu du gris
              // neutre uniforme d'avant — chaque carte garde son identité.
              // L'alerte garde le rouge conventionnel (#fca5a5, inchangé) :
              // un signal d'alerte doit rester rouge quelle que soit la
              // couleur de la tuile, sinon il ne se voit plus comme tel.
              border:`1.5px solid ${card.alert?"#fca5a5":card.color+"2a"}`,
              padding:"10px 12px",boxShadow:"0 1px 3px rgba(0,0,0,.06)",
              position:"relative",overflow:"hidden",minWidth:0,
              cursor:isClickable?"pointer":"default",
            }}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:4,
                background:card.color,borderRadius:"10px 10px 0 0"}}/>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4,marginTop:2}}>
                <span style={{fontSize:10,fontWeight:700,color:"var(--text-secondary)"}}>{card.label}</span>
              </div>
              <div style={{fontSize:26,fontWeight:900,color:card.color,lineHeight:1}}>{v}</div>
              <div style={{fontSize:9,color:card.alert?"#ef4444":"var(--text-muted)",marginTop:3,
                fontWeight:card.alert?700:400,lineHeight:1.3}}>
                {card.subtitle}
              </div>
            </div>
          );
        };

        // Enveloppe une unité déplaçable (une case seule, ou la paire PF+TC)
        // avec les gestionnaires pointer (souris ET tactile — Pointer Events
        // unifie les deux, contrairement au drag-and-drop HTML5 natif qui ne
        // fonctionne pas sur mobile) et le retour visuel pendant le glisser.
        const wrapDraggable = (unitKey, content, extraStyle) => (
          <div key={unitKey} data-reorder-key={unitKey}
            onPointerDown={onCardPointerDown(unitKey)}
            style={{
              position:"relative", minWidth:0, ...extraStyle,
              opacity: dragKey===unitKey ? .4 : 1,
              outline: reorderMode && overKey===unitKey && dragKey!==unitKey ? "2.5px dashed #5b21b6" : "none",
              outlineOffset: 2, borderRadius:12,
              cursor: reorderMode ? (dragKey===unitKey?"grabbing":"grab") : "default",
              touchAction: reorderMode ? "none" : "auto",
            }}>
            {reorderMode && (
              <div style={{position:"absolute",top:6,right:8,fontSize:12,color:"#94a3b8",zIndex:1,pointerEvents:"none"}}>⠿⠿</div>
            )}
            {content}
          </div>
        );

        // Pause Figée et TC dissociées (08/08, demandé par Olivier — "tu peux
        // les dissocier pour les déplacer individuellement" maintenant que le
        // panneau est réorganisable) : chacune est une carte normale comme
        // les autres, plus de bloc à 2 colonnes forcé. L'ancien bug de
        // largeur (17/07 : une carte à largeur fixe en pixels ne
        // correspondait pas à la largeur réelle des voisines en 1fr) ne
        // s'applique plus ici — chaque carte est un enfant ordinaire de la
        // grille auto-fill, dimensionné exactement comme toutes les autres.
        return(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}
            onPointerMove={onGridPointerMove} onPointerUp={onGridPointerUp} onPointerCancel={onGridPointerUp}>
            {orderedKeys.map(key=>{
              const card = CARDS.find(c=>c.key===key);
              if(!card) return null;
              return wrapDraggable(key, renderCard(card));
            })}
          </div>
        );
      })()}

      </div>}

      {showTravailDash&&(
        <TravailDashboardModal agent={agent} schedule={schedule} year={selectedYear} availableYears={availableYears} onYearChange={setSelectedYear} onClose={()=>setShowTravailDash(false)}/>
      )}
      {showCongesDash&&(
        <CongesDashboardModal agent={agent} schedule={schedule} setSchedule={setSchedule} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} year={selectedYear} availableYears={availableYears} onYearChange={setSelectedYear} onClose={()=>setShowCongesDash(false)} cetTransfere={cetTransfereCA} maladiePerte={maladiePerteCA}/>
      )}
      {openDetailKey&&DETAIL_CONFIG[openDetailKey]&&(
        <CompteurDetailModal agent={agent} schedule={schedule} setSchedule={setSchedule} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} year={selectedYear} availableYears={availableYears} onYearChange={setSelectedYear} onClose={()=>setOpenDetailKey(null)} {...DETAIL_CONFIG[openDetailKey]}
          cetDeduction={openDetailKey==="RQ" ? cetTransfereRQ.total : 0}
          cetTransfere={CET_TRANSFERE_BY_KEY[openDetailKey]}
          maladiePerteDeduction={MALADIE_PERTE_BY_KEY[openDetailKey]||0}
          maladiePertesGestion={openDetailKey==="MA"}/>
      )}
      {showFetesDash&&(
        <FetesDashboardModal agent={agent} schedule={schedule} setSchedule={setSchedule} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} isAdmin={isAdmin} isOwnProfile={isOwnProfile} year={selectedYear} availableYears={availableYears} onYearChange={setSelectedYear} onClose={()=>setShowFetesDash(false)}/>
      )}
      {showVtDash&&(
        <VtDashboardModal agent={agent} schedule={schedule} setSchedule={setSchedule} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} year={selectedYear} availableYears={availableYears} onYearChange={setSelectedYear} onClose={()=>setShowVtDash(false)}/>
      )}
      {showCetDash&&(
        <CetDashboardModal agent={agent} schedule={schedule} setSchedule={setSchedule} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} year={selectedYear} availableYears={availableYears} onYearChange={setSelectedYear} onClose={()=>setShowCetDash(false)} feteOptions={cetFeteOptions}/>
      )}
      {showPauseFigeeDash&&(
        <PauseFigeeDashboardModal agent={agent} schedule={schedule} pausesData={pausesData} loading={pausesLoading} loadError={pausesError} recharger={rechargerPauses} tcData={tcData} year={selectedYear} availableYears={availableYears} onYearChange={setSelectedYear} onClose={()=>setShowPauseFigeeDash(false)}/>
      )}
      {showTcDash&&(
        <TcDashboardModal agent={agent} schedule={schedule} setSchedule={setSchedule} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} pausesData={pausesData} year={selectedYear} availableYears={availableYears} onYearChange={setSelectedYear} onClose={()=>setShowTcDash(false)} cetTransfere={cetTransfereTC}/>
      )}
      {showBilanGlobal&&(
        <BilanGlobalModal agent={agent} schedule={schedule} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} pausesData={pausesData} year={selectedYear} availableYears={availableYears} onYearChange={setSelectedYear} onClose={()=>setShowBilanGlobal(false)}/>
      )}
    </div>
  );
}

// ─── HELPERS RÈGLES FÊTES ────────────────────────────────────────────────────

// Retourne trimestre (1-4) d'un mois (1-12)
function getTrimestre(mois){ return mois<=3?1:mois<=6?2:mois<=9?3:4; }

// Retourne les règles de délai pour une fête donnée sa date réelle (string YYYY-MM-DD)
function getFeteRegles(dateFete){
  const d = new Date(dateFete);
  const mois = d.getMonth()+1;
  const annee = d.getFullYear();
  const t = getTrimestre(mois);
  let tSuiv = t+1; let aSuiv = annee;
  if(tSuiv>4){tSuiv=1;aSuiv=annee+1;}
  const finT = {1:`${aSuiv}-03-31`,2:`${aSuiv}-06-30`,3:`${aSuiv}-09-30`,4:`${aSuiv}-12-31`};
  const limiteDate = finT[tSuiv];
  // Notif = 10 du mois M-1 avant fin trimestre
  const dernierMoisT = {1:3,2:6,3:9,4:12};
  let moisNotif = dernierMoisT[tSuiv]-1; let anneeNotif = aSuiv;
  if(moisNotif<=0){moisNotif+=12;anneeNotif--;}
  const notifDate = `${anneeNotif}-${String(moisNotif).padStart(2,'0')}-10`;
  // Paye si non pris = mois suivant la limite
  const moisLim = parseInt(limiteDate.slice(5,7));
  let moisPaye = moisLim+1; let anneePaye = aSuiv;
  if(moisPaye>12){moisPaye=1;anneePaye++;}
  return {limiteDate, notifDate, moisPaye, anneePaye};
}

// Retourne les dates réelles des fêtes légales pour une année donnée
// (calculs fixes + mobiles Pâques par algorithme de Butcher-Meeus)
function getDatesFetesAnnee(annee){
  // Pâques (algorithme Butcher-Meeus)
  const a=annee%19,b=Math.floor(annee/100),c=annee%100;
  const d2=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3),h=(19*a+b-d2-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451);
  const moisPaq=Math.floor((h+l-7*m+114)/31);
  const jourPaq=((h+l-7*m+114)%31)+1;
  const paques=new Date(annee,moisPaq-1,jourPaq);

  // IMPORTANT : jamais toISOString() ici — elle convertit en UTC et decale
  // la date d'un jour en arriere des que le fuseau local est en avance sur
  // UTC (toute la France, ete comme hiver). Bug reel constate le 13/08 sur
  // 2027 : Lundi de Paques (29/03) affiche a tort comme le 28/03 (dimanche,
  // Paques elle-meme) — reconstruction manuelle depuis les composants LOCAUX
  // de la date, jamais de passage par UTC pour un simple format YYYY-MM-DD.
  const fmt=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  // Fêtes mobiles depuis Pâques
  const lunPaques=new Date(paques); lunPaques.setDate(paques.getDate()+1);       // F2
  const ascension=new Date(paques); ascension.setDate(paques.getDate()+39);      // F4 (jeudi)
  const lunPentecote=new Date(paques); lunPentecote.setDate(paques.getDate()+50); // F5

  // Noël : le 25 décembre
  const noel=new Date(annee,11,25);
  const noelDow=noel.getDay(); // 0=dim

  // VN = samedi veille de Noël, UNIQUEMENT si Noël tombe un dimanche
  // (les agents chôment aussi ce jour-là selon le règlement)
  const vnDate = noelDow===0 ? `${annee}-12-24` : null;

  // F3 = 1er mai : cas particulier si dimanche → seuls agents de service bénéficient d'un RC
  // On garde la date réelle, la règle est gérée dans computeFetesLignes via estDimanche
  const f3Date = `${annee}-05-01`;
  const f3Dow = new Date(annee,4,1).getDay();

  const dates = {
    F1: `${annee}-01-01`,   // 1er Janvier
    F2: fmt(lunPaques),     // Lundi de Pâques
    F3: f3Date,             // 1er Mai
    F4: fmt(ascension),     // Ascension (jeudi)
    FV: `${annee}-05-08`,   // 8 Mai
    F5: fmt(lunPentecote),  // Lundi de Pentecôte
    F6: `${annee}-07-14`,   // 14 Juillet
    F7: `${annee}-08-15`,   // 15 Août
    F8: `${annee}-11-01`,   // 1er Novembre
    F9: `${annee}-11-11`,   // 11 Novembre
    F0: `${annee}-12-25`,   // Noël
  };

  // VN n'apparaît que si Noël tombe un dimanche
  if(vnDate) dates.VN = vnDate;

  return dates;
}

// Indique si la fête F3 (1er mai) tombe un dimanche pour l'année donnée
function isF3Dimanche(annee){ return new Date(annee,4,1).getDay()===0; }

const MOIS_NOMS=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

// ─── CALCUL FÊTES LÉGALES (pur — réutilisé par la carte compteurs ET la modale) ─
// Mêmes règles exactes que l'ancienne FetesSection, juste extraites en fonction
// pure pour que la carte "Fêtes" du panneau compteurs puisse calculer le nombre
// de fêtes à traiter (pour la cloche) sans ouvrir la fenêtre.
// asOfDate (21/08, module FIM) : optionnel, "YYYY-MM-DD" — permet de
// recalculer le statut de chaque fête TEL QU'IL AURAIT ÉTÉ évalué à cette
// date précise (ex: fin d'un mois passé) plutôt qu'à la date réelle
// d'aujourd'hui. Omis = comportement inchangé (tous les appels existants,
// le vrai module Fêtes en temps réel compris, doivent toujours voir l'état
// actuel réel). Olivier : "si je demande mars je veux les infos de mars pas
// celle d'aout" — sans ce paramètre, un rapport pour un mois passé montrait
// à tort l'état d'AUJOURD'HUI (une fête déjà réglée depuis apparaissait
// encore "à traiter" si elle l'était encore au moment du rapport, ou
// l'inverse).
export function computeFetesLignes(agent, schedule, agentProfiles, year, asOfDate){
  const today = asOfDate || new Date().toISOString().slice(0,10);
  const fetesData = agentProfiles[agent?.id]?.fetesTracking?.[year] || {};
  const datesFetes = getDatesFetesAnnee(year);

  // Pour chaque fête, calculer son statut
  const lignes = Object.entries(CODES_FETES).map(([code, label])=>{
    // VN n'existe que si Noël tombe un dimanche pour cette année
    const dateFete = datesFetes[code];
    if(!dateFete) return null; // VN absent si Noël ne tombe pas un dimanche

    const dateFeteObj = new Date(dateFete);
    const dow = dateFeteObj.getDay(); // 0=dim

    // F2 (Lundi de Pâques) et F5 (Lundi de Pentecôte) sont TOUJOURS des lundis
    // par construction — ils ne peuvent jamais tomber un dimanche.
    // F0 (Noël) exclu ici pour une autre raison (05/08, précisé par Olivier) :
    // Noël PEUT tomber un dimanche, mais n'est alors jamais perdu — la fête
    // "VN" (veille de Noël, samedi 24/12) apparaît alors comme ligne séparée
    // et porte elle-même la logique de perte/récupération à la place de F0.
    // F0 suit donc toujours le calcul générique (semaine), jamais la branche
    // "perdue automatiquement si dimanche" ci-dessous.
    const jamaisDimanche = code === "F2" || code === "F5" || code === "F0";
    const estDimanche = !jamaisDimanche && dow === 0;
    const estF3Dimanche = code === "F3" && estDimanche;

    // Cas particulier VN : samedi veille de Noël quand Noël = dimanche
    // → mêmes règles de délai que F0 (Noël) donc T4 → limite 31 mars A+1
    // Les agents dont l'utilisation est imposée OU en RP ce jour bénéficient d'un RC

    const {limiteDate, notifDate, moisPaye, anneePaye} = getFeteRegles(dateFete);

    // Détection prise : code fête dans planning OU RP dans le trimestre suivant
    const moisLim = parseInt(limiteDate.slice(5,7));
    const anneeLim = parseInt(limiteDate.slice(0,4));
    const debutRecherche = dateFete; // à partir du jour de la fête
    // Bornée à asOfDate SEULEMENT si explicitement fourni (21/08, module
    // FIM) : une case saisie après la date du rapport n'existait pas
    // encore, de son point de vue — sinon un rapport de mars pouvait voir
    // "prise" une fête réglée en juillet (déjà dans schedule au moment où
    // le rapport est généré), alors qu'en mars ce n'était pas encore
    // arrivé. Jamais appliqué en usage normal (asOfDate omis) : le module
    // Fêtes en temps réel doit continuer à détecter une RC déjà planifiée
    // à l'avance par l'agent, même après aujourd'hui.
    const finRecherche = (asOfDate && asOfDate < limiteDate) ? asOfDate : limiteDate;

    let priseLe = null;
    let priseType = null;
    // 1. Code fête saisi directement
    Object.entries(schedule).forEach(([k,v])=>{
      if(!k.startsWith(agent.id+"-")) return;
      const dk = k.slice(agent.id.length+1);
      if(dk < debutRecherche || dk > finRecherche) return;
      if(v?.equipe === code){ priseLe = dk; priseType = "code"; }
    });
    // Détection "RP quelconque dans le trimestre suivant" volontairement
    // retirée (13/07, signalé par Olivier) : plusieurs fêtes du printemps
    // (F3/F4/FV/F5) partagent le même trimestre suivant (juillet-septembre),
    // donc un seul RP posé dans cette fenêtre était injustement compté comme
    // preuve de RC pris pour LES QUATRE fêtes à la fois. Seul le code de la
    // fête saisi explicitement dans le planning (ex: "F2") fait foi désormais.

    // ── DÉTECTION PLANNING + ROULEMENT ──────────────────────────────────────────
    const entryJour = schedule[`${agent.id}-${dateFete}`];
    const equipeJour = entryJour?.equipe || null;

    // Planning saisi ce jour
    const estRPCeJour       = equipeJour === "RP";
    const estTravaillePlanning = ["M","AM","N","J","JF"].includes(equipeJour||"");

    // Profil agent
    const profil = agentProfiles[agent.id] || {};
    const roulement = profil.roulement || null; // ex: "Roulement A", "Roulement B"…

    // Roulement prévisionnel : si pas de planning saisi, on regarde le roulement
    // Les roulements 3x8 SNCF tournent sur 5 semaines (M/AM/N/RP/RP…)
    // On utilise le roulement enregistré dans le profil comme indicateur d'équipe habituelle
    // Pour un dimanche : en roulement 3x8, le dimanche peut être M, AM, N ou RP selon la semaine
    // Sans table de roulement complète, on se base sur le planning saisi
    const estFutur = dateFete > today;
    const planningRenseigneCeJour = !!equipeJour;

    // ── RÈGLES PAR CAS ────────────────────────────────────────────────────────

    // Toutes fêtes dimanche (hors F2/F5 jamais dimanche, hors F3 cas particulier) :
    // → RC accordé si agent travaillait OU était en RP ce jour (règlement al.2 et al.3)
    // → Si planning non saisi + fête future → PERDUE par anticipation (on laisse l'agent corriger)
    // → Si planning non saisi + fête passée → PERDUE (on ne sait pas → défavorable)

    // F3 dimanche (confirmé par Olivier le 10/07) : PERDUE dans tous les cas,
    // SAUF si l'agent travaille ce jour-là — seule exception, contrairement aux
    // autres fêtes du dimanche où le RP compte aussi. Le RP ne sauve pas le F3.
    // Règle identique pour tous les agents, réservistes compris (pas de statut
    // "en attente" spécifique pour eux — ils ne sont de toute façon pas suivis
    // dans l'appli pour l'instant).

    let estPerdue = false;
    let estPerdueProbable = false; // fête dimanche future sans planning saisi
    let estRCAccorde = false;      // fête dimanche avec RC confirmé (RP ou travail)

    if(estDimanche){
      if(estF3Dimanche){
        // F3 = 1er mai dimanche
        if(estTravaillePlanning){
          estRCAccorde = true; // Service imposé confirmé → RC accordé jusqu'à la fin du trimestre suivant
        } else if(!planningRenseigneCeJour && estFutur){
          estPerdueProbable = true; // Futur non renseigné → probable perdue
        } else {
          estPerdue = true; // Pas de travail ce jour → PERDUE
        }
      } else {
        // Toutes les autres fêtes dimanche (hors F2/F5, hors F3) : TOUJOURS
        // perdue, que l'agent travaille ce jour-là ou soit en RP, ou non —
        // règle précisée par Olivier le 05/08 (diffère du 1er mai/F3, seul
        // cas où le travail réel sauve la fête). Déterminé par le seul
        // calendrier, connu à l'avance : pas de statut "probable/anticipée"
        // ni d'attente du planning nécessaire ici, contrairement à F3.
        estPerdue = true;
      }
    }

    // Override manuel (déplacé avant le motif, 14/08 — la perte pour cause
    // de maladie doit pouvoir influencer le motif affiché ci-dessous).
    const override = fetesData[code] || {};

    // Perte pour cause de maladie (14/08, demandé par Olivier — "il faut
    // pouvoir noter une fête comme perdu pour motif de maladie") : override
    // manuel prioritaire sur le calcul réglementaire habituel (Sunday rule,
    // etc.) — même principe que les autres corrections manuelles de ce
    // module (priseLe/estPayee/epargneCet), jamais stocké ailleurs que
    // fetesTracking[année][code]. Ne modifie aucune des règles existantes,
    // juste une raison supplémentaire de forcer estPerdue=true.
    if(override.perdueMaladie) estPerdue = true;

    // Motif réglementaire
    let motifReglementaire = null;
    if(override.perdueMaladie){
      motifReglementaire = "Marquée perdue pour cause d'arrêt maladie (saisie manuelle par l'agent, ne suit pas le calcul réglementaire habituel).";
    } else if(estPerdue && estF3Dimanche){
      motifReglementaire = "Lorsque le 1er mai tombe un dimanche, seuls les agents qui travaillent réellement ce jour-là bénéficient d'un RC (le repos périodique ne compte pas). Toutes les autres fêtes tombant un dimanche sont perdues sans exception, contrairement au 1er mai. Aucun service imposé détecté. (Réf. GRH00143)";
    } else if(estPerdueProbable && estF3Dimanche){
      motifReglementaire = "1er mai dimanche — Planning non encore saisi ce jour-là. Ce sera PERDUE sauf si vous travaillez ce jour (le RP ne compte pas pour cette fête). (Réf. GRH00143)";
    } else if(estPerdue && !estF3Dimanche){
      motifReglementaire = "Fête tombant un dimanche — toujours perdue, que vous travailliez ou soyez en repos périodique ce jour-là (seul le 1er mai fait exception). (Réf. GRH00143)";
    } else if(estRCAccorde && estDimanche){
      motifReglementaire = "Agent utilisé ce jour (1er mai) : RC accordé dans le trimestre civil suivant. (Réf. GRH00143)";
    } else if(code === "VN"){
      motifReglementaire = "Les agents chôment le samedi veille de Noël lorsque cette fête tombe un dimanche. Ceux utilisés ou en RP bénéficient d'un RC dans le trimestre suivant. (Réf. GRH00143)";
    }
    // asOfDate (21/08, module FIM) : un override manuel (date de prise
    // corrigée à la main, paiement anticipé confirmé) porte une vraie date
    // réelle — si cette date est APRÈS le mois du rapport, elle n'était pas
    // encore connue à ce moment-là, du point de vue de ce rapport (ex: une
    // fête confirmée "vue sur la fiche de paie de juillet" ne doit jamais
    // apparaître réglée dans un rapport de mars).
    const priseLeBrut = override.priseLe !== undefined ? override.priseLe : priseLe;
    const priseLeFinal = (asOfDate && priseLeBrut && priseLeBrut > asOfDate) ? null : priseLeBrut;
    const priseTypeFinal = override.priseType || priseType;
    const snoozeJusquau = override.snoozeJusquau || null;

    // Paiement anticipé (facultatif — n'affecte le calcul que si l'agent a
    // confirmé "vu sur ma feuille de paie" ; une simple demande sans
    // confirmation n'a aucun effet sur le statut, juste un rappel visuel).
    // Annulable à tout moment, redonne alors le calcul normal.
    const paiementAnticipe = override.paiementAnticipe || null;
    // override.estPayee n'a pas de date propre (pas de "moisVu" attaché) —
    // on continue à lui faire confiance même pour un rapport historique
    // (impossible de savoir QUAND il a été coché, risque d'un faux négatif
    // pire qu'un faux positif ici). Seul paiementAnticipe.moisVu, qui porte
    // une vraie date de confirmation, est borné par asOfDate.
    const moisVuConnuAsOf = !asOfDate || !paiementAnticipe?.moisVu || `${paiementAnticipe.moisVu}-01` <= asOfDate;
    const estPayee = override.estPayee || (!!paiementAnticipe?.moisVu && moisVuConnuAsOf) || (!priseLeFinal && !estPerdue && today > limiteDate);
    let moisPayeFinal = moisPaye, anneePayeFinal = anneePaye;
    if(paiementAnticipe?.moisVu){
      const [ay, am] = paiementAnticipe.moisVu.split("-").map(Number);
      anneePayeFinal = ay; moisPayeFinal = am;
    }

    // Statut final
    let statut = "attente";
    if(estPerdue)         statut = "perdue";
    else if(estPerdueProbable) statut = "perdue_probable";
    else if(dateFete > today)  statut = "futur";
    else if(priseLeFinal)      statut = "prise";
    else if(estPayee)          statut = "payee";
    else if(today > limiteDate)statut = "payee_auto";
    else                       statut = "attente";

    // Notif active ? (pas pour perdues)
    const notifActive = !estPerdue && !priseLeFinal && !estPayee
      && today >= notifDate && today <= limiteDate
      && (!snoozeJusquau || today >= snoozeJusquau);

    return {
      code, label, dateFete, estDimanche, estF3Dimanche,
      estPerdue, estPerdueProbable, estRCAccorde,
      estRPCeJour, estTravaillePlanning, motifReglementaire,
      limiteDate, notifDate, moisPaye: moisPayeFinal, anneePaye: anneePayeFinal,
      priseLe: priseLeFinal, priseType: priseTypeFinal,
      estPayee, statut, notifActive, override, paiementAnticipe,
    };
  }).filter(Boolean);

  // Fêtes de N-1 qui débordent sur l'année N (T4 : limite 31 mars N)
  // Toussaint (F8=1er nov), 11nov (F9), Noël (F0), VN éventuel
  const yearMoins1 = year - 1;
  const fetesDataN1 = agentProfiles[agent?.id]?.fetesTracking?.[yearMoins1] || {};
  const datesFetesN1 = getDatesFetesAnnee(yearMoins1);
  const limiteT4N1 = `${year}-03-31`; // fin du trimestre suivant T4 de N-1
  const today2 = asOfDate || new Date().toISOString().slice(0,10);

  const fetesReportN1 = Object.entries(CODES_FETES).map(([code, label])=>{
    const dateFete = datesFetesN1[code];
    if(!dateFete) return null;
    // Seulement les fêtes T4 de N-1 (octobre-décembre) dont la limite déborde sur N
    const moisFete = parseInt(dateFete.slice(5,7));
    if(getTrimestre(moisFete) !== 4) return null; // seulement T4
    // La limite est bien 31 mars N
    const limiteDate = limiteT4N1;
    const {moisPaye, anneePaye} = getFeteRegles(dateFete);

    const override = fetesDataN1[code] || {};

    // Détection prise dans le planning
    let priseLe = null;
    let priseType = null;
    // Chercher dans N-1 ET dans N (car la récup peut être prise en jan-mars N)
    // Bornée à asOfDate si fourni, même raison que plus haut.
    const finRechercheN1 = (asOfDate && asOfDate < limiteDate) ? asOfDate : limiteDate;
    Object.entries(schedule).forEach(([k,v])=>{
      if(!k.startsWith(agent.id+"-")) return;
      const dk = k.slice(agent.id.length+1);
      // Fenêtre : date fête → 31 mars N
      if(dk < dateFete || dk > finRechercheN1) return;
      if(v?.equipe===code){ priseLe = dk; priseType = "code"; }
    });
    // Détection "RP quelconque dans le trimestre suivant" retirée (13/07,
    // même raison que ci-dessus) : F8/F9/F0 partagent tous la même fenêtre
    // janv-mars N, un seul RP y aurait réglé les trois fêtes à la fois.
    if(override.priseLe!==undefined){ priseLe = override.priseLe; priseType = override.priseType||"manuel"; }
    const estPayee = override.estPayee || (!priseLe && today2 > limiteDate);

    // 05/08 : meme regle GRH00143 que le calcul principal (voir computeFetesLignes
    // ci-dessus) - une fete tombant un dimanche est TOUJOURS perdue, non
    // reportable. Manquait ici (estPerdue etait fige a false) : une fete perdue
    // de N-1 (ex: F8/1er nov. un dimanche) apparaissait a tort comme reportable
    // dans le tableau de bord de l'annee N (signale par Olivier en consultant
    // 2027). F3 n'est jamais en T4 donc pas d'exception 1er-mai a gerer ici ;
    // F0/Noel exclu comme dans le calcul principal (remplace par VN, jamais
    // dimanche par construction).
    const dowN1 = new Date(dateFete).getDay();
    const estDimancheN1 = code !== "F0" && dowN1 === 0;
    // Perte maladie (14/08) : même override que le calcul principal, prioritaire
    // sur la règle du dimanche — voir computeFetesLignes plus haut.
    const estPerdueN1 = estDimancheN1 || !!override.perdueMaladie;

    let statut;
    if(estPerdueN1)   statut = "perdue";
    else if(priseLe)  statut = "prise";
    else if(estPayee) statut = "payee";
    else if(today2 > limiteDate) statut = "payee_auto";
    else             statut = "attente";

    return {
      code, label, dateFete, limiteDate, priseLe, priseType, statut,
      estPayee, moisPaye, anneePaye,
      estDimanche:estDimancheN1, estF3Dimanche:false, estPerdue:estPerdueN1,
      motifReglementaire: override.perdueMaladie
        ? "Marquée perdue pour cause d'arrêt maladie (saisie manuelle par l'agent, ne suit pas le calcul réglementaire habituel)."
        : estPerdueN1
        ? `Fête légale de ${yearMoins1} tombée un dimanche — perdue, non récupérable (rémunérée comme un dimanche normal). (Réf. GRH00143)`
        : `Fête légale de ${yearMoins1} reportable jusqu'au 31 mars ${year} (trimestre civil suivant). (Réf. GRH00143)`,
      override,
    };
  }).filter(Boolean);

  return { lignes, fetesReportN1, yearMoins1 };
}

// Liste des fêtes proposables à l'épargne CET (année en cours + report N-1),
// chacune avec un motif de non-sélection calculé (perdue/prise/payée/déjà
// épargnée) — extrait de FetesDashboardModal (08/08) pour être réutilisable
// aussi depuis le formulaire générique du panneau CET lui-même (source RCF),
// voir PersonalView plus bas. Logique inchangée, juste sortie en fonction
// autonome pour éviter de la dupliquer à 2 endroits.
function computeFeteOptionsCet(agent, schedule, agentProfiles, year){
  const { lignes, fetesReportN1, yearMoins1 } = computeFetesLignes(agent, schedule, agentProfiles, year);
  const buildOption = (l, anneeVal) => {
    let disabled = false, reason = "";
    if(l.override?.epargneCet){
      disabled = true; reason = "🏦 Déjà épargnée au CET";
    } else if(l.statut==="perdue"){
      disabled = true; reason = l.estDimanche ? "❌ Perdue (dimanche)" : "❌ Perdue";
    } else if(l.statut==="prise"){
      const d = l.priseLe ? new Date(l.priseLe).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"2-digit"}) : "";
      disabled = true; reason = `✅ Prise${d?` le ${d}`:""}`;
    } else if(l.statut==="payee" || l.statut==="payee_auto"){
      disabled = true; reason = `💶 Payée ${MOIS_NOMS[l.moisPaye-1]}${l.anneePaye!==anneeVal?` ${l.anneePaye}`:""}`;
    }
    return {code:l.code, label:l.label, annee:anneeVal, disabled, reason};
  };
  const fromLignes = lignes.map(l=>buildOption(l, year));
  const fromReport = fetesReportN1.map(l=>buildOption(l, yearMoins1));
  return [...fromLignes, ...fromReport];
}

// ─── MODALE FÊTES LÉGALES ─────────────────────────────────────────────────────
// Remplace l'ancien panneau toujours visible sous les compteurs (12/07,
// demandé par Olivier) : la carte "Fêtes" du panneau compteurs ouvre
// désormais cette fenêtre. Mêmes règles exactes, réorganisées par priorité
// (à traiter / perdues / réglées / à venir) plutôt qu'en liste chronologique,
// pour rester lisible même avec beaucoup d'agents peu familiers de l'appli.
function FetesDashboardModal({agent, schedule, setSchedule, agentProfiles, setAgentProfiles, isAdmin, isOwnProfile, year, availableYears, onYearChange, onClose}){
  const today = new Date().toISOString().slice(0,10);
  const { lignes, fetesReportN1, yearMoins1 } = useMemo(
    ()=>computeFetesLignes(agent, schedule, agentProfiles, year),
    [agent, schedule, agentProfiles, year]
  );

  // Fêtes proposées à l'épargne CET (08/08) : la liste complète est affichée
  // (année en cours + report N-1), mais les fêtes déjà réglées d'une façon ou
  // d'une autre (perdue, prise, payée, déjà épargnée) sont marquées non
  // sélectionnables avec le motif affiché à côté — plutôt que simplement
  // absentes, pour qu'Olivier comprenne pourquoi il ne peut pas les cocher
  // (signalé : la F3 "Prise" restait sélectionnable, seule "perdue" était
  // exclue). Voir EpargneFetesCetWidget dans CetView.jsx.
  const feteOptions = useMemo(
    () => computeFeteOptionsCet(agent, schedule, agentProfiles, year),
    [agent, schedule, agentProfiles, year]
  );

  const setFetesDataYear = (targetYear, updater) => {
    setAgentProfiles(prev=>{
      const curr = prev[agent.id]?.fetesTracking?.[targetYear] || {};
      const next = typeof updater === 'function' ? updater(curr) : updater;
      return {...prev, [agent.id]:{
        ...(prev[agent.id]||{}),
        fetesTracking:{
          ...(prev[agent.id]?.fetesTracking||{}),
          [targetYear]: next,
        }
      }};
    });
  };

  const [editingCode, setEditingCode] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [motifOuvert, setMotifOuvert] = useState(null);
  const [resetConfirmOuvert, setResetConfirmOuvert] = useState(null);
  const [paiementOuvert, setPaiementOuvert] = useState(null);
  const [paiementMoisVal, setPaiementMoisVal] = useState("");
  const [ouvertN1, setOuvertN1] = useState(true);

  // Écrit (ou retire) le code de la fête directement dans le planning perso, le jour
  // de la prise manuelle choisie dans ce tableau de bord — pour que la fête saisie
  // ici se retrouve avec son intitulé exact (ex: "F2") dans le planning, et pas
  // seulement comme une correction locale invisible ailleurs. Deux garde-fous
  // (choisis par Olivier le 14/07) : on ne touche jamais un jour du planning qui
  // contient déjà autre chose, et on ne permet pas une deuxième date pour une même
  // fête déjà prise ailleurs — dans les deux cas, on bloque avec un message plutôt
  // que d'écraser ou dupliquer silencieusement.
  const agCp = agent?.immatriculation || agent?.cp || agent?.id;
  const ecrireCodeFeteDansPlanning = (code, date) => {
    const key = `${agCp}-${date}`;
    const entryExistante = schedule[key] || {};
    const fullEntry = {...entryExistante, equipe: code, prive:false};
    setSchedule(prev=>({...prev, [key]: fullEntry}));
    api.planning.saveEntry(agCp, date, fullEntry).catch(e=>console.error("Erreur sauvegarde fête dans planning:", e));
  };
  const retirerCodeFeteDuPlanning = (code, date) => {
    const key = `${agCp}-${date}`;
    const entryExistante = schedule[key];
    if(!entryExistante || entryExistante.equipe !== code) return; // déjà changé entre temps, on ne touche pas
    const {equipe, ...reste} = entryExistante;
    const videTotal = !reste.equipe2 && !reste.finNuit && !reste.notePerso;
    if(videTotal){
      setSchedule(prev=>{const n={...prev}; delete n[key]; return n;});
      api.planning.deleteEntry(agCp, date).catch(e=>console.error("Erreur suppression fête du planning:", e));
    } else {
      const fullEntry = {...reste, equipe:null};
      setSchedule(prev=>({...prev, [key]: fullEntry}));
      api.planning.saveEntry(agCp, date, fullEntry).catch(e=>console.error("Erreur suppression fête du planning:", e));
    }
  };
  const appliquerPriseManuelle = (code, val, targetYear=year) => {
    const relevantLignes = targetYear===yearMoins1 ? fetesReportN1 : lignes;
    const ligneActuelle = relevantLignes.find(l=>l.code===code);
    // Date effectivement affichée comme "prise" avant cette action — qu'elle vienne d'une
    // saisie manuelle dans ce tableau de bord OU d'un code tapé directement dans le planning
    // perso (priseType "code"). Dans les deux cas, annuler doit retirer le code du planning,
    // sinon le tableau de bord repasse "à traiter" alors que le jour reste marqué dans le
    // planning perso — état incohérent signalé par Olivier le 14/07.
    const ancienneDate = ligneActuelle?.priseLe || null;

    if(!val){
      // Annulation : retirer le code du planning perso là où il a été détecté/écrit
      if(ancienneDate) retirerCodeFeteDuPlanning(code, ancienneDate);
      setFetesDataYear(targetYear, prev=>({...prev,[code]:{...(prev[code]||{}),priseLe:null,priseType:null}}));
      setEditingCode(null);
      return;
    }

    // Garde-fou 1 : le jour cible du planning doit être libre (ou déjà ce même code)
    const targetEntry = schedule[`${agCp}-${val}`];
    if(targetEntry?.equipe && targetEntry.equipe!==code){
      const labelExistant = EQ_COLORS[targetEntry.equipe]?.label || targetEntry.equipe;
      alert(`Impossible : le ${new Date(val).toLocaleDateString("fr-FR")} est déjà rempli dans ton planning perso avec "${labelExistant}".\n\nPour lier ${code} à ce jour, ouvre d'abord ce jour dans le planning perso et vide-le (ou choisis une autre date pour ${code}).`);
      return;
    }
    // Garde-fou 2 : la fête ne doit pas déjà être prise à une autre date
    if(ligneActuelle?.priseLe && ligneActuelle.priseLe!==val){
      alert(`${code} est déjà marquée prise le ${new Date(ligneActuelle.priseLe).toLocaleDateString("fr-FR")}. Annule d'abord cette prise si tu veux la déplacer.`);
      return;
    }

    if(ancienneDate && ancienneDate!==val) retirerCodeFeteDuPlanning(code, ancienneDate);
    ecrireCodeFeteDansPlanning(code, val);
    setFetesDataYear(targetYear, prev=>({...prev,[code]:{...(prev[code]||{}),snoozeJusquau:null,priseLe:val,priseType:"manuel"}}));
    setEditingCode(null);
  };
  const prendreEnCompte = (code, targetYear=year) => appliquerPriseManuelle(code, today, targetYear);
  const snooze10j = (code, targetYear=year) => {
    const d = new Date(); d.setDate(d.getDate()+10);
    setFetesDataYear(targetYear, prev=>({...prev,[code]:{...(prev[code]||{}),snoozeJusquau:d.toISOString().slice(0,10)}}));
  };
  const setManualDate = (code, val, targetYear=year) => appliquerPriseManuelle(code, val, targetYear);
  const setManualPayee = (code, val, targetYear=year) => {
    setFetesDataYear(targetYear, prev=>({...prev,[code]:{...(prev[code]||{}),estPayee:val}}));
  };
  // Perte pour cause de maladie (14/08, demandé par Olivier) : simple bascule
  // manuelle — même principe que setManualPayee, mais avec un tombstone null
  // explicite au retrait (JSON_MERGE_PATCH côté backend ne supprime jamais
  // une clé simplement absente, même piège que resetManuel/annulerPaiementAnticipe
  // juste en dessous, déjà documenté plusieurs fois sur ce projet).
  const toggleMaladiePerdue = (code, targetYear=year) => {
    setFetesDataYear(targetYear, prev=>{
      const curr = prev[code] || {};
      return {...prev, [code]:{...curr, perdueMaladie: curr.perdueMaladie ? null : {date:today}}};
    });
  };
  const resetManuel = (code, targetYear=year) => {
    // 05/08 : "delete" local ne suffit pas - le backend fusionne donnees_json
    // via JSON_MERGE_PATCH, une cle simplement absente du patch envoye reste
    // INCHANGEE cote serveur (seule une valeur null explicite l'efface). Meme
    // bug deja corrige le 16/07 pour Conges/VT/paiement anticipe (voir
    // annulerPaiementAnticipe juste en dessous), oublie ici : la correction
    // manuelle revenait silencieusement au prochain rechargement du profil
    // ("ca se remet tout seul", signale par Olivier).
    setFetesDataYear(targetYear, prev=>({...prev, [code]: null}));
    setEditingCode(null);
  };

  // Paiement anticipé : demander un mois, puis confirmer "vu sur la feuille de
  // paie" (ce qui, seulement à ce moment-là, marque la fête payée). Annulable
  // à tout moment — tant que "vu" n'est pas confirmé, le calcul normal reste
  // inchangé (simple rappel visuel de la demande).
  const demanderPaiementAnticipe = (code, mois, targetYear=year) => {
    setFetesDataYear(targetYear, prev=>({...prev,[code]:{...(prev[code]||{}),
      paiementAnticipe:{...(prev[code]?.paiementAnticipe||{}), moisDemande:mois, moisVu:null}}}));
  };
  const confirmerVuFeuillePaie = (code, mois, targetYear=year) => {
    setFetesDataYear(targetYear, prev=>({...prev,[code]:{...(prev[code]||{}),
      paiementAnticipe:{...(prev[code]?.paiementAnticipe||{}), moisVu:mois}}}));
  };
  // paiementAnticipe mis à null explicitement (pas delete) : JSON_MERGE_PATCH
  // (backend) fusionne les objets imbriqués au lieu de les remplacer — un champ
  // simplement absent de l'objet envoyé reste inchangé côté serveur, seule une
  // valeur null explicite l'efface (même bug que Congés/VT, trouvé le 16/07).
  const annulerPaiementAnticipe = (code, targetYear=year) => {
    setFetesDataYear(targetYear, prev=>{
      const curr = {...(prev[code]||{})};
      curr.paiementAnticipe = null;
      return {...prev, [code]:curr};
    });
  };

  // Regroupement par priorité — plus intuitif qu'une liste chronologique :
  // ce qui nécessite une action d'abord, ce qui est réglé en dernier.
  // Une fête épargnée au CET (07/08, override.epargneCet) compte comme
  // réglée quel que soit son statut réglementaire sous-jacent (celui-ci
  // n'est jamais modifié par l'épargne — voir EpargneFetesCetWidget).
  const groupeATraiter = lignes.filter(l=>!l.override?.epargneCet && (l.statut==="attente"||l.statut==="perdue_probable"));
  const groupePerdues  = lignes.filter(l=>!l.override?.epargneCet && l.statut==="perdue");
  const groupeReglees  = lignes.filter(l=>l.override?.epargneCet || l.statut==="prise"||l.statut==="payee"||l.statut==="payee_auto");
  const groupeAVenir   = lignes.filter(l=>!l.override?.epargneCet && l.statut==="futur");

  // Couleurs par statut — contraste fort partout (pas de gris clair sur clair)
  const statutStyle = {
    futur:          {bg:"#f8fafc", border:"#e2e8f0", badge:"#64748b", badgeTc:"#fff",     icon:"🔜", label:"À venir"},
    prise:          {bg:"#f0fdf4", border:"#86efac", badge:"#16a34a", badgeTc:"#fff",     icon:"✅", label:"Prise"},
    attente:        {bg:"#fef3c7", border:"#f59e0b", badge:"#d97706", badgeTc:"#fff",     icon:"⏳", label:"En attente"},
    payee:          {bg:"#eff6ff", border:"#bfdbfe", badge:"#3b82f6", badgeTc:"#fff",     icon:"💶", label:"Payée"},
    payee_auto:     {bg:"#eff6ff", border:"#bfdbfe", badge:"#3b82f6", badgeTc:"#fff",     icon:"💶", label:"Payée auto"},
    perdue:         {bg:"#fef2f2", border:"#fecaca", badge:"#dc2626", badgeTc:"#fff",     icon:"❌", label:"PERDUE"},
    perdue_probable:{bg:"#fff7ed", border:"#fed7aa", badge:"#ea580c", badgeTc:"#fff",     icon:"⚠️", label:"Prob. perdue"},
  };

  const canEdit = isOwnProfile || isAdmin;

  const labelPriseLe = (l) => {
    if(!l.priseLe) return null;
    const d = new Date(l.priseLe).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"2-digit"});
    if(l.priseType==="RP")    return `${d} 🩷RC`;
    if(l.priseType==="code")  return `${d} 🩷${l.code}`;
    if(l.priseType==="manuel") return `${d} ✎`;
    return d;
  };

  // Carte détaillée d'une fête, réutilisée pour l'année en cours (year) et le report N-1 (yearMoins1)
  const renderFeteCard = (l, targetYear) => {
    // Une fête épargnée au CET prime toujours sur son statut réglementaire
    // habituel (déjà vrai pour le badge, voir plus bas) — le fond de la
    // carte doit suivre pareil (08/08, demandé par Olivier : "le fonds
    // devrait passé en vert comme les autres traité, ca semble plus
    // coherent") : sans ça, une fête encore "en attente" au moment où elle a
    // été épargnée gardait un fond ambre malgré le badge violet "Épargnée
    // CET", ce qui donnait une carte à l'aspect contradictoire.
    const s = l.override?.epargneCet ? statutStyle.prise : (statutStyle[l.statut]||statutStyle.futur);
    const editKey = `${targetYear}:${l.code}`;
    const isEditing = editingCode===editKey;
    const motifVisible = motifOuvert===editKey;
    const priseLe = labelPriseLe(l);
    return(
      <div key={editKey} style={{
        borderBottom:"1px solid #f1f5f9",
        background:s.bg,
      }}>
        {/* Ligne principale */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px"}}>

          {/* Badge code fête */}
          <span style={{
            background:"#ec4899",color:"#fff",
            borderRadius:8,padding:"5px 10px",
            fontFamily:"monospace",fontSize:13,fontWeight:800,
            flexShrink:0,minWidth:44,textAlign:"center",
          }}>🩷{l.code}</span>

          {/* Nom + date fête */}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:700,color:"#1e293b",
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {l.label}
              {l.estDimanche&&<span style={{fontSize:11,color:"#dc2626",marginLeft:6,fontWeight:800}}>⚠️Dim.</span>}
            </div>
            <div style={{fontSize:11,color:"#475569",marginTop:2,display:"flex",gap:7,flexWrap:"wrap"}}>
              <span style={{fontFamily:"monospace"}}>
                {new Date(l.dateFete).toLocaleDateString("fr-FR",{
                  weekday:"short",day:"2-digit",month:"2-digit",
                  year:targetYear!==year?"2-digit":undefined
                })}
              </span>
              <span style={{color:"#64748b"}}>→</span>
              <span style={{
                fontWeight:700,
                color:today>l.limiteDate&&!l.priseLe?"#dc2626":"#475569"
              }}>
                {new Date(l.limiteDate).toLocaleDateString("fr-FR",{
                  day:"2-digit",month:"short",
                  year:parseInt(l.limiteDate.slice(0,4))!==year?"numeric":undefined
                })}
              </span>
            </div>
            {l.paiementAnticipe?.moisDemande&&!l.paiementAnticipe?.moisVu&&!l.priseLe&&
              <div style={{fontSize:11,color:"#059669",fontWeight:800,marginTop:3,whiteSpace:"normal"}}>⏩ Anticipé demandé</div>}
          </div>

          {/* Statut badge — une fête épargnée au CET (07/08) prime toujours
              sur le badge réglementaire habituel, quel que soit l.statut.
              Perdue pour maladie (14/08) : distincte d'une perte réglementaire
              (dimanche) pour qu'on comprenne d'où vient la perte au coup d'œil. */}
          <span style={{
            background:l.override?.epargneCet?"#ede9fe":l.override?.perdueMaladie?"#fef2f2":s.badge,
            color:l.override?.epargneCet?"#5b21b6":l.override?.perdueMaladie?"#991b1b":s.badgeTc,
            borderRadius:20,padding:"5px 12px",
            fontSize:12,fontWeight:700,whiteSpace:"nowrap",flexShrink:0,
          }}>
            {l.override?.epargneCet ? "🏦 Épargnée CET" : l.override?.perdueMaladie ? "🤒 Perdue (maladie)" : <>{s.icon} {s.label}</>}
            {l.statut==="payee"&&!l.override?.epargneCet&&` ${MOIS_NOMS[l.moisPaye-1]}`}
            {l.statut==="payee_auto"&&!l.override?.epargneCet&&` ${MOIS_NOMS[l.moisPaye-1]}${l.anneePaye!==year?` ${l.anneePaye}`:""}`}
          </span>
        </div>

        {/* Ligne prise le + actions */}
        <div style={{display:"flex",alignItems:"center",gap:8,
          padding:"0 14px 11px",flexWrap:"wrap"}}>

          {/* Prise le */}
          {isEditing?(
            <div style={{display:"flex",gap:6,alignItems:"center",flex:1,flexWrap:"wrap"}}>
              <input type="date" defaultValue={l.priseLe||""}
                onChange={e=>setEditVal(e.target.value)}
                style={{border:"1px solid #cbd5e1",borderRadius:7,padding:"6px 9px",
                  fontSize:13,outline:"none",flex:1,minHeight:34,minWidth:120}}/>
              <button onClick={()=>setManualDate(l.code,editVal,targetYear)}
                style={{background:"#16a34a",color:"#fff",border:"none",
                  borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:13,minHeight:34}}>✓</button>
              {/* Bouton Effacer explicite : le picker natif iOS (roue) n'a pas
                  de bouton "Effacer" contrairement a desktop/Android — sans
                  ca, impossible de revenir a une date vide une fois choisie. */}
              {l.priseLe&&<button onClick={()=>setManualDate(l.code,"",targetYear)}
                title="Effacer la date"
                style={{background:"#fef2f2",color:"#b91c1c",border:"1px solid #fecaca",
                  borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:13,minHeight:34}}>🗑 Effacer</button>}
              <button onClick={()=>setEditingCode(null)}
                style={{background:"#f1f5f9",color:"#475569",border:"1px solid #cbd5e1",
                  borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:13,minHeight:34}}>✕</button>
            </div>
          ):(
            <div style={{flex:1,fontSize:12}}>
              {l.override?.epargneCet
                ? <span style={{color:"#5b21b6",fontWeight:700}}>
                    🏦 Épargnée au CET — {l.override.epargneCet.sousCompte==="courant"?"Compte courant":"Compte fin d'activité"}
                    <span style={{color:"#94a3b8",fontWeight:500,fontSize:11,marginLeft:6}}>(annuler depuis 🏦 CET)</span>
                  </span>
              : priseLe
                ? <span style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{color:"#16a34a",fontWeight:700}}>{priseLe}</span>
                    {canEdit&&<button onClick={()=>setManualDate(l.code,"",targetYear)}
                      title="Annuler cette prise et revenir au calcul automatique (paiement)"
                      style={{background:"none",border:"none",color:"#b91c1c",
                        fontSize:11,fontWeight:700,cursor:"pointer",padding:0,
                        textDecoration:"underline"}}>✕ Annuler la prise</button>}
                  </span>
                : l.statut==="payee"
                  ? <span>
                      <span style={{color:"#2563eb",fontWeight:700}}>
                        💶 Fiche de paie {MOIS_NOMS[l.moisPaye-1]}{l.anneePaye!==year?` ${l.anneePaye}`:""}
                      </span>
                      {l.paiementAnticipe?.moisVu&&
                        <span style={{color:"#059669",fontWeight:700,fontSize:11,marginLeft:6}}>⏩ Anticipé confirmé</span>}
                    </span>
                : l.statut==="payee_auto"
                  ? <div>
                      <div style={{color:"#2563eb",fontWeight:700,fontSize:12}}>
                        💶 Paiement fiche de paie {MOIS_NOMS[l.moisPaye-1]}{l.anneePaye!==year?` ${l.anneePaye}`:""}
                      </div>
                      <div style={{color:"#b45309",fontWeight:700,fontSize:11,marginTop:3,
                        display:"flex",alignItems:"center",gap:4}}>
                        ⚠️ À vérifier sur votre fiche de paie de {MOIS_NOMS[l.moisPaye-1]}{l.anneePaye!==year?` ${l.anneePaye}`:""}
                      </div>
                    </div>
                  : <span style={{color:"#475569",fontStyle:"italic"}}>Non renseigné</span>
              }
            </div>
          )}

          {/* Boutons actions — icone + legende toujours visible (05/08, demande
              par Olivier) : auparavant icone seule + title au survol, invisible
              au doigt sur mobile ("il faut passer la souris... sur le tel on a
              rien"). Option 2 retenue (icone en haut, legende minuscule en
              dessous) pour rester compact et garder les 5 boutons alignes sur
              une seule ligne meme a l'etroit. title conserve en plus, pour le
              survol desktop. */}
          {canEdit&&!isEditing&&<div style={{display:"flex",gap:6,flexShrink:0}}>
            <button onClick={()=>{setEditingCode(editKey);setEditVal(l.priseLe||"");}}
              title="Modifier la date de prise"
              style={{background:"#f1f5f9",border:"1px solid #cbd5e1",borderRadius:8,
                padding:"6px 4px",cursor:"pointer",width:52,
                display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={{fontSize:15}}>📅</span>
              <span style={{fontSize:9,fontWeight:600,color:"#475569"}}>Date</span>
            </button>
            <button onClick={()=>setManualPayee(l.code,!l.estPayee,targetYear)}
              title={l.estPayee?"Non payé":"Marquer payé"}
              style={{background:l.estPayee?"#dbeafe":"#f1f5f9",
                border:`1.5px solid ${l.estPayee?"#93c5fd":"#cbd5e1"}`,
                borderRadius:8,padding:"6px 4px",cursor:"pointer",width:52,
                display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={{fontSize:15}}>💶</span>
              <span style={{fontSize:9,fontWeight:600,color:"#475569"}}>Payé</span>
            </button>
            {/* Perte pour cause de maladie (14/08, demandé par Olivier) — masqué
                si la fête est déjà prise ou épargnée au CET (incohérent avec
                "perdue"), annulable via le même bouton "↺ Annuler" ci-dessous
                (qui efface tout override, ou en re-cliquant ce bouton). */}
            {!l.priseLe && !l.override?.epargneCet && <button
              onClick={()=>toggleMaladiePerdue(l.code,targetYear)}
              title={l.override?.perdueMaladie?"Retirer la perte maladie":"Marquer perdue pour cause de maladie"}
              style={{background:l.override?.perdueMaladie?"#fee2e2":"#f1f5f9",
                border:`1.5px solid ${l.override?.perdueMaladie?"#fca5a5":"#cbd5e1"}`,
                borderRadius:8,padding:"6px 4px",cursor:"pointer",width:52,
                display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={{fontSize:15}}>🤒</span>
              <span style={{fontSize:9,fontWeight:600,color:"#475569"}}>Maladie</span>
            </button>}
            {/* Bouton réinitialiser — visible seulement si une correction manuelle a été posée sur cette fête */}
            {(l.override?.priseLe!==undefined||l.override?.estPayee!==undefined||l.override?.perdueMaladie!==undefined)&&<button
              onClick={()=>setResetConfirmOuvert(resetConfirmOuvert===editKey?null:editKey)}
              title="Annuler la correction manuelle et revenir au calcul automatique"
              style={{background:resetConfirmOuvert===editKey?"#ffedd5":"#fff7ed",
                border:`1.5px solid ${resetConfirmOuvert===editKey?"#f97316":"#fdba74"}`,borderRadius:8,
                padding:"6px 4px",cursor:"pointer",width:52,
                display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                color:"#c2410c"}}>
              <span style={{fontSize:15}}>↺</span>
              <span style={{fontSize:9,fontWeight:600}}>Annuler</span>
            </button>}
            {/* Bouton motif réglementaire */}
            {l.motifReglementaire&&<button
              onClick={()=>setMotifOuvert(motifVisible?null:editKey)}
              title="Motif réglementaire"
              style={{background:motifVisible?"#fce7f3":"#f1f5f9",
                border:`1.5px solid ${motifVisible?"#f9a8d4":"#cbd5e1"}`,
                borderRadius:8,padding:"6px 4px",cursor:"pointer",width:52,
                display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                color:motifVisible?"#9d174d":"#64748b"}}>
              <span style={{fontSize:15}}>📋</span>
              <span style={{fontSize:9,fontWeight:600}}>Motif</span>
            </button>}
            {/* Paiement anticipé — annulable, sans effet sur le calcul tant que "vu sur la feuille" n'est pas confirmé */}
            <button onClick={()=>{
                const paiementVisible = paiementOuvert===editKey;
                setPaiementOuvert(paiementVisible?null:editKey);
                setPaiementMoisVal(l.paiementAnticipe?.moisDemande||l.paiementAnticipe?.moisVu||"");
              }}
              title="Paiement anticipé"
              style={{background:paiementOuvert===editKey?"#ecfdf5":l.paiementAnticipe?.moisVu?"#ecfdf5":l.paiementAnticipe?.moisDemande?"#fffbeb":"#f1f5f9",
                border:`1.5px solid ${paiementOuvert===editKey||l.paiementAnticipe?"#6ee7b7":"#cbd5e1"}`,
                borderRadius:8,padding:"6px 4px",cursor:"pointer",width:52,
                display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                color:l.paiementAnticipe?.moisVu?"#047857":l.paiementAnticipe?.moisDemande?"#b45309":"#64748b"}}>
              <span style={{fontSize:15}}>⏩</span>
              <span style={{fontSize:9,fontWeight:600}}>Anticipé</span>
            </button>
          </div>}
        </div>

        {/* Incohérence : fête marquée prise (planning) ET paiement anticipé encore en
            attente — les deux ne peuvent pas coexister (soit RC pris, soit payée),
            il faut choisir. Signalé par Olivier le 14/07 : ce cas pouvait se produire
            silencieusement (ex: fête tapée directement dans le planning après avoir
            demandé un paiement anticipé) sans qu'il soit jamais demandé de trancher. */}
        {l.priseLe && l.paiementAnticipe?.moisDemande && !l.paiementAnticipe?.moisVu && (
          <div style={{
            margin:"0 14px 12px", background:"#fef3c7", border:"1.5px solid #f59e0b",
            borderRadius:8, padding:"10px 13px",
          }}>
            <div style={{fontSize:12,color:"#78350f",fontWeight:700,marginBottom:8,lineHeight:1.5}}>
              ⚠️ Vous avez demandé un paiement par anticipation pour la fête "{l.label}". Si vous confirmez que cette fête est prise, votre demande de paiement par anticipation sera annulée dans le tableau des fêtes.
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={()=>annulerPaiementAnticipe(l.code,targetYear)}
                style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:7,
                  padding:"6px 12px",cursor:"pointer",fontSize:13,minHeight:34,fontWeight:700}}>
                ✓ Confirmer la fête (annule le paiement anticipé)
              </button>
              <button onClick={()=>setManualDate(l.code,"",targetYear)}
                style={{background:"#f1f5f9",color:"#475569",border:"1px solid #cbd5e1",borderRadius:7,
                  padding:"6px 12px",cursor:"pointer",fontSize:13,minHeight:34}}>
                ✕ Annuler la prise (garde le paiement anticipé)
              </button>
            </div>
          </div>
        )}

        {/* Motif réglementaire déroulant */}
        {motifVisible&&l.motifReglementaire&&<div style={{
          margin:"0 14px 12px",
          background:l.estPerdue?"#fef2f2":l.code==="VN"?"#faf5ff":"#f8fafc",
          borderRadius:8,padding:"10px 13px",
          fontSize:12,lineHeight:1.55,
          color:l.estPerdue?"#991b1b":l.code==="VN"?"#6b21a8":"#334155",
          border:`1.5px solid ${l.estPerdue?"#fecaca":l.code==="VN"?"#e9d5ff":"#cbd5e1"}`,
        }}>
          {l.estPerdue&&<div style={{fontWeight:800,fontSize:13,marginBottom:4}}>❌ PERDUE</div>}
          {l.motifReglementaire}
        </div>}

        {/* Confirmation avant réinitialisation complète — annulable, pour éviter
            une perte accidentelle (ex: paiement anticipé confirmé effacé sans le vouloir) */}
        {resetConfirmOuvert===editKey&&<div style={{
          margin:"0 14px 12px",background:"#fff7ed",border:"1.5px solid #fdba74",
          borderRadius:8,padding:"10px 13px",
        }}>
          <div style={{fontSize:12,color:"#7c2d12",fontWeight:700,marginBottom:8}}>
            ↺ Annuler TOUTES les corrections manuelles de "{l.label}" (date de prise, paiement, paiement anticipé) et revenir au calcul 100% automatique ?
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{resetManuel(l.code,targetYear);setResetConfirmOuvert(null);}}
              style={{background:"#c2410c",color:"#fff",border:"none",borderRadius:7,
                padding:"6px 12px",cursor:"pointer",fontSize:13,minHeight:34}}>Oui, annuler tout</button>
            <button onClick={()=>setResetConfirmOuvert(null)}
              style={{background:"#f1f5f9",color:"#475569",border:"1px solid #cbd5e1",borderRadius:7,
                padding:"6px 12px",cursor:"pointer",fontSize:13,minHeight:34}}>Non, garder</button>
          </div>
        </div>}

        {/* Paiement anticipé déroulant */}
        {paiementOuvert===editKey&&<div style={{
          margin:"0 14px 12px",background:"#ecfdf5",border:"1.5px solid #6ee7b7",
          borderRadius:8,padding:"10px 13px",
        }}>
          <div style={{fontSize:12,fontWeight:800,color:"#047857",marginBottom:8}}>⏩ Paiement anticipé</div>
          {!l.paiementAnticipe?.moisDemande ? (
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:"#334155"}}>Mois où le paiement doit avoir lieu :</span>
              <input type="month" value={paiementMoisVal} onChange={e=>setPaiementMoisVal(e.target.value)}
                style={{border:"1px solid #6ee7b7",borderRadius:7,padding:"6px 9px",fontSize:13,minHeight:34}}/>
              <button onClick={()=>demanderPaiementAnticipe(l.code,paiementMoisVal,targetYear)}
                disabled={!paiementMoisVal}
                style={{background:"#059669",color:"#fff",border:"none",borderRadius:7,
                  padding:"6px 12px",cursor:paiementMoisVal?"pointer":"default",fontSize:13,minHeight:34,
                  opacity:paiementMoisVal?1:.5}}>Demander</button>
            </div>
          ) : !l.paiementAnticipe?.moisVu ? (
            <div>
              <div style={{fontSize:12,color:"#334155",marginBottom:8}}>
                Demandé pour <b>{MOIS_NOMS[parseInt(l.paiementAnticipe.moisDemande.slice(5,7),10)-1]} {l.paiementAnticipe.moisDemande.slice(0,4)}</b>.
                Le calcul de la fête reste inchangé tant que ce n'est pas confirmé.
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:"#334155"}}>Vu sur feuille de paie de :</span>
                <input type="month" value={paiementMoisVal} onChange={e=>setPaiementMoisVal(e.target.value)}
                  style={{border:"1px solid #6ee7b7",borderRadius:7,padding:"6px 9px",fontSize:13,minHeight:34}}/>
                <button onClick={()=>confirmerVuFeuillePaie(l.code,paiementMoisVal,targetYear)}
                  disabled={!paiementMoisVal}
                  style={{background:"#059669",color:"#fff",border:"none",borderRadius:7,
                    padding:"6px 12px",cursor:paiementMoisVal?"pointer":"default",fontSize:13,minHeight:34,
                    opacity:paiementMoisVal?1:.5}}>✓ Confirmer</button>
                <button onClick={()=>{annulerPaiementAnticipe(l.code,targetYear);setPaiementOuvert(null);}}
                  style={{background:"#fef2f2",color:"#b91c1c",border:"1px solid #fecaca",borderRadius:7,
                    padding:"6px 12px",cursor:"pointer",fontSize:13,minHeight:34}}>✕ Annuler</button>
              </div>
            </div>
          ) : (
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:"#047857",fontWeight:700}}>
                ✅ Vu sur feuille de paie de {MOIS_NOMS[parseInt(l.paiementAnticipe.moisVu.slice(5,7),10)-1]} {l.paiementAnticipe.moisVu.slice(0,4)}
              </span>
              <button onClick={()=>{annulerPaiementAnticipe(l.code,targetYear);setPaiementOuvert(null);}}
                style={{background:"#fef2f2",color:"#b91c1c",border:"1px solid #fecaca",borderRadius:7,
                  padding:"6px 12px",cursor:"pointer",fontSize:13,minHeight:34}}>✕ Annuler</button>
            </div>
          )}
        </div>}
      </div>
    );
  };

  const groupeStyle = {
    aTraiter: {bg:"#fff7ed", border:"#fed7aa", text:"#9a3412"},
    perdues:  {bg:"#fef2f2", border:"#fecaca", text:"#991b1b"},
    reglees:  {bg:"#f0fdf4", border:"#bbf7d0", text:"#166534"},
    aVenir:   {bg:"#f8fafc", border:"#e2e8f0", text:"#334155"},
  };
  const renderGroupe = (titre, icone, items, style) => items.length>0 && (
    <div>
      <div style={{fontSize:13,fontWeight:800,color:style.text,background:style.bg,
        border:`1px solid ${style.border}`,borderRadius:8,padding:"7px 11px",marginBottom:8}}>
        {icone} {titre} ({items.length})
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:0,border:"1px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}>
        {items.map(l=>renderFeteCard(l, year))}
      </div>
    </div>
  );

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:560,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
        <div style={{background:"linear-gradient(135deg,#831843,#9d174d)",padding:"18px 20px",display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",position:"sticky",top:0}}>
          <div style={{flex:"1 1 auto",minWidth:0}}>
            <div style={{color:"#fff",fontSize:16,fontWeight:800,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🩷 Fêtes légales {year}</div>
            <div style={{color:"rgba(255,255,255,.9)",fontSize:11,marginTop:2,fontWeight:600}}>Réf. GRH00143</div>
          </div>
          {availableYears&&onYearChange&&<YearSwitcher year={year} availableYears={availableYears} onChange={onYearChange}/>}
          <button onClick={onClose} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer",opacity:.9,flexShrink:0}}>✕</button>
        </div>

        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:16}}>

          {lignes.length===0 && fetesReportN1.length===0 && (
            <div style={{fontSize:12,color:"#475569",textAlign:"center",padding:12}}>Aucune fête à afficher.</div>
          )}

          {/* Épargner directement au CET depuis Fêtes (07/08, demandé par
              Olivier — RCF, repos compensateur de fêtes). Contrairement aux
              autres compteurs, on ne saisit pas un simple nombre de jours :
              l'agent choisit précisément QUELLE fête est épargnée (suivi fin
              demandé) — widget dédié, voir CetView.jsx EpargneFetesCetWidget.
              feteOptions inclut l'année en cours ET le report N-1 (chaque
              fête garde sa propre année, celle qui compte pour l'affichage
              "🏦 Épargnée au CET" dans les deux vues) — exclut les fêtes déjà
              épargnées et celles perdues (non éligibles, demandé par Olivier
              : "lorsqu'une fête est dans les fete perdu [...] elle ne peut
              pas etre mise en epargne"). */}
          <EpargneFetesCetWidget agent={agent} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} year={year} fetes={feteOptions}/>

          {renderGroupe("À traiter", "⚠️", groupeATraiter, groupeStyle.aTraiter)}
          {renderGroupe("Réglées", "✅", groupeReglees, groupeStyle.reglees)}
          {renderGroupe("À venir", "🔜", groupeAVenir, groupeStyle.aVenir)}
          {renderGroupe("Perdues", "❌", groupePerdues, groupeStyle.perdues)}

          {/* ── Report N-1 (fêtes de fin d'année précédente encore en délai) ── */}
          {fetesReportN1.length>0&&<div style={{borderTop:"2px solid #e2e8f0",paddingTop:14}}>
            <div onClick={()=>setOuvertN1(o=>!o)}
              style={{background:"#fdf2f8",border:"1px solid #fbcfe8",borderRadius:8,padding:"9px 12px",
                display:"flex",alignItems:"center",gap:8,cursor:"pointer",userSelect:"none"}}>
              <span style={{fontSize:13,fontWeight:800,color:"#9d174d",flex:1}}>
                📋 Report {yearMoins1} ({fetesReportN1.length})
              </span>
              <span style={{fontSize:11,fontWeight:600,color:"#9d174d"}}>
                {ouvertN1?"Masquer":"Afficher"}
              </span>
              <span style={{color:"#9d174d",fontSize:13,fontWeight:700,transition:"transform .2s",
                display:"inline-block",transform:ouvertN1?"rotate(0deg)":"rotate(-90deg)"}}>▼</span>
            </div>
            {ouvertN1&&<div style={{display:"flex",flexDirection:"column",gap:0,border:"1px solid #e2e8f0",borderRadius:10,overflow:"hidden",marginTop:8}}>
              {fetesReportN1.map(l=>renderFeteCard(l, yearMoins1))}
            </div>}
          </div>}

          {/* ── Légende ── */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",borderTop:"1px solid #e2e8f0",paddingTop:12}}>
            {[
              {bg:"#16a34a",l:"Prise"},
              {bg:"#f59e0b",l:"Attente"},
              {bg:"#3b82f6",l:"Payée"},
              {bg:"#dc2626",l:"Perdue"},
              {bg:"#ea580c",l:"Prob. perdue"},
              {bg:"#64748b",l:"À venir"},
            ].map(({bg,l})=>(
              <span key={l} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11}}>
                <span style={{width:10,height:10,borderRadius:"50%",background:bg,flexShrink:0}}/>
                <span style={{color:"#334155",fontWeight:600}}>{l}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MÉMO PAUSES FIGÉES ──────────────────────────────────────────────────────
// ─── MODULE PAUSE FIGÉE ──────────────────────────────────────────────────────
// Refonte du 17/07 (demandée par Olivier) : n'est plus un bandeau accordéon
// toujours affiché, mais une carte compteur cliquable comme les autres
// (voir DashboardCompteurs, card "PF"), ouvrant cette modale. Le mot "FIA" a
// disparu de l'interface — le mécanisme sous-jacent (mois de constatation +
// bascule "validé") est inchangé, juste renommé. Une pause "validée" ici
// alimente automatiquement le solde TC de +1h30 (voir computeDashboardTC,
// tcData passé en prop pour afficher le détail plafond/heures sup par pause).
function PauseFigeeDashboardModal({agent, schedule, pausesData, loading, loadError, recharger, tcData, year, availableYears, onYearChange, onClose}){
  const [showCal, setShowCal] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const agentId = agent?.cp || agent?.immatriculation || agent?.id;
  const start = `${year}-01-01`, end = `${year}-12-31`;
  // Erreur d'action (ajout/retrait/validation) — distincte de loadError (erreur
  // du chargement initial, géré par le parent). Sans ça, un échec silencieux
  // (ex: token perdu) laissait l'agent sans aucun retour : l'action semblait
  // n'avoir rien fait, sans explication ni possibilité de réessayer (17/07).
  const [actionError, setActionError] = useState(null);

  const allDates = useMemo(()=>{
    const obj = {};
    (pausesData||[]).forEach(p=>{
      const dk = String(p.date_jour).slice(0,10);
      if(dk>=start && dk<=end) obj[dk] = true;
    });
    return obj;
  },[pausesData, start, end]);
  const fiaMois = useMemo(()=>{
    const obj = {};
    (pausesData||[]).forEach(p=>{ if(p.mois_fia) obj[String(p.date_jour).slice(0,10)] = String(p.mois_fia).slice(0,7); });
    return obj;
  },[pausesData]);
  const fiaDone = useMemo(()=>{
    const obj = {};
    (pausesData||[]).forEach(p=>{ if(p.fia_done) obj[String(p.date_jour).slice(0,10)] = true; });
    return obj;
  },[pausesData]);

  const allDatesSorted = Object.keys(allDates).sort();
  const nbValideesAnnee = allDatesSorted.filter(dk=>fiaDone[dk]).length;

  const toggleDate = (dk) => {
    setActionError(null);
    if(allDates[dk]){
      api.pauses.delete(agentId, dk).then(recharger).catch(()=>setActionError("Erreur lors de la suppression de cette journée. Réessaie."));
    } else {
      api.pauses.add(agentId, dk).then(recharger).catch(()=>setActionError("Erreur lors de l'ajout de cette journée. Réessaie."));
    }
  };

  const setFiaMois = (dk, moisKey) => {
    setActionError(null);
    api.pauses.setFiaMois(agentId, dk, moisKey||null).then(recharger).catch(()=>setActionError("Erreur lors de la mise à jour du mois de constatation. Réessaie."));
  };
  const toggleFiaDone = (dk) => {
    setActionError(null);
    const nouveauDone = !fiaDone[dk];
    if(!nouveauDone){
      // On décoche une validation : on efface aussi le mois renseigné, pour
      // repartir vraiment de zéro (sinon la fiche restait affichée alors que
      // ce n'est plus confirmé).
      Promise.all([
        api.pauses.setFiaDone(agentId, dk, false),
        api.pauses.setFiaMois(agentId, dk, null),
      ]).then(recharger).catch(()=>setActionError("Erreur lors de la mise à jour. Réessaie."));
    } else {
      api.pauses.setFiaDone(agentId, dk, true).then(recharger).catch(()=>setActionError("Erreur lors de la validation. Réessaie."));
    }
  };

  // Tri des journées :
  // - En haut : journées EN ATTENTE de vérification — triées par date croissante (les plus urgentes en premier)
  // - En bas  : journées VALIDÉES — triées par mois de constatation décroissant (les plus récentes en premier)
  const {datesOrange, datesVertes} = useMemo(()=>{
    const orange = allDatesSorted.filter(dk => !fiaDone[dk]);
    const verte  = allDatesSorted.filter(dk =>  fiaDone[dk]);
    verte.sort((a,b)=>(fiaMois[b]||"").localeCompare(fiaMois[a]||""));
    return {datesOrange: orange, datesVertes: verte};
  },[allDatesSorted.join(","), JSON.stringify(fiaMois), JSON.stringify(fiaDone)]);

  const parMoisOrange = useMemo(()=>{
    const groupes = {};
    datesOrange.forEach(dk=>{
      const moisKey = dk.slice(0,7);
      if(!groupes[moisKey]) groupes[moisKey] = [];
      groupes[moisKey].push(dk);
    });
    return Object.entries(groupes).sort(([a],[b])=>a.localeCompare(b));
  },[datesOrange.join(",")]);

  const parMoisVert = useMemo(()=>{
    const groupes = {};
    datesVertes.forEach(dk=>{
      const moisKey = dk.slice(0,7);
      if(!groupes[moisKey]) groupes[moisKey] = [];
      groupes[moisKey].push(dk);
    });
    return Object.entries(groupes).sort(([,datesA],[,datesB])=>{
      const fiaA = fiaMois[datesA[0]]||"";
      const fiaB = fiaMois[datesB[0]]||"";
      return fiaB.localeCompare(fiaA);
    });
  },[datesVertes.join(","), JSON.stringify(fiaMois)]);

  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const daysList = Array.from({length:daysInMonth},(_,i)=>{
    const d = i+1;
    const dk = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = new Date(calYear,calMonth,d).getDay();
    return {dk, d, dow};
  });

  const JOURS = ["Di","Lu","Ma","Me","Je","Ve","Sa"];

  const moisOptions = useMemo(()=>{
    const opts = [];
    const now = new Date();
    const limite3ans = new Date(now.getFullYear()-3, now.getMonth(), 1);
    const debut = new Date(Math.max(
      new Date(2026, 0, 1).getTime(),
      limite3ans.getTime()
    ));
    const fin = new Date(now.getFullYear(), now.getMonth()+12, 1);
    let cur = new Date(debut.getFullYear(), debut.getMonth(), 1);
    while(cur <= fin){
      const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
      const label = `${MOIS_L[cur.getMonth()]} ${cur.getFullYear()}`;
      opts.push({key, label});
      cur.setMonth(cur.getMonth()+1);
    }
    return opts;
  },[]);

  const nbFiaDone = nbValideesAnnee;
  const nbFiaRestant = allDatesSorted.length - nbFiaDone;

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
        <div style={{background:"linear-gradient(135deg,#0f766e,#0C447C)",padding:"18px 20px",display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:1}}>
          <div style={{color:"#fff",fontSize:16,fontWeight:800,flex:"1 1 auto",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>⏸️ Pause Figée {year}</div>
          {availableYears&&onYearChange&&<YearSwitcher year={year} availableYears={availableYears} onChange={onYearChange}/>}
          <button onClick={onClose} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer",opacity:.8,flexShrink:0}}>✕</button>
        </div>

      {loading ? (
        <div style={{padding:"30px 20px",textAlign:"center",color:"#94a3b8",fontSize:13}}>Chargement des pauses figées…</div>
      ) : (
      <div>
      {loadError&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
        padding:"10px 14px",background:"#fee2e2",borderBottom:"1.5px solid #fca5a5"}}>
        <span style={{fontSize:12,fontWeight:600,color:"#991b1b"}}>{loadError}</span>
        <button onClick={recharger} style={{border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,
          fontWeight:700,cursor:"pointer",background:"#991b1b",color:"#fff",flexShrink:0}}>Réessayer</button>
      </div>}
      {actionError&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
        padding:"10px 14px",background:"#fee2e2",borderBottom:"1.5px solid #fca5a5"}}>
        <span style={{fontSize:12,fontWeight:600,color:"#991b1b"}}>⚠️ {actionError}</span>
        <button onClick={()=>setActionError(null)} style={{border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,
          fontWeight:700,cursor:"pointer",background:"#991b1b",color:"#fff",flexShrink:0}}>✕</button>
      </div>}

      <div style={{padding:"14px 18px",display:"flex",gap:10,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:110,background:"#f0fdfa",border:"1.5px solid #99f6e4",borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
          <div style={{fontSize:22,fontWeight:900,color:"#0f766e",lineHeight:1}}>{nbValideesAnnee}</div>
          <div style={{fontSize:10,fontWeight:700,color:"#134e4a",marginTop:3}}>validées {year}</div>
        </div>
        <div style={{flex:1,minWidth:110,background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
          <div style={{fontSize:22,fontWeight:900,color:"#c2410c",lineHeight:1}}>{nbFiaRestant}</div>
          <div style={{fontSize:10,fontWeight:700,color:"#7c2d12",marginTop:3}}>en attente</div>
        </div>
      </div>

      <div>
        {/* ── Bouton pour afficher/masquer le calendrier d'ajout ── */}
        <div style={{padding:"0 14px 12px"}}>
          <button onClick={()=>setShowCal(v=>!v)}
            style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              background:showCal?"#f1f5f9":"#0f766e",
              border:"none",color:showCal?"#334155":"#fff",
              borderRadius:10,padding:"12px 16px",
              cursor:"pointer",fontSize:14,fontWeight:700,minHeight:44}}>
            {showCal?"✕ Fermer le calendrier":"📅 Ajouter une ou plusieurs journées"}
          </button>
        </div>

        {/* ── Calendrier ajout ── */}
        {showCal&&<div style={{padding:"14px",borderBottom:"1px solid #e2e8f0",background:"#f0fdfa"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <button onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}}
              style={{border:"1.5px solid #7dd3fc",borderRadius:8,padding:"7px 14px",cursor:"pointer",
                background:"#fff",fontSize:15,fontWeight:700,color:"#0369a1",minHeight:38}}>‹</button>
            <div style={{flex:1,textAlign:"center",fontWeight:800,fontSize:14,color:"#0369a1"}}>
              {MOIS_L[calMonth]} {calYear}
            </div>
            <button onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}}
              style={{border:"1.5px solid #7dd3fc",borderRadius:8,padding:"7px 14px",cursor:"pointer",
                background:"#fff",fontSize:15,fontWeight:700,color:"#0369a1",minHeight:38}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:5}}>
            {JOURS.map(j=><div key={j} style={{textAlign:"center",fontSize:11,fontWeight:800,color:"#475569"}}>{j}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
            {Array.from({length:firstDow}).map((_,i)=><div key={`e${i}`}/>)}
            {daysList.map(({dk,d,dow})=>{
              const isWE=dow===0||dow===6;
              const isSel=!!allDates[dk];
              return(
                <button key={dk} onClick={()=>toggleDate(dk)}
                  style={{borderRadius:9,minHeight:48,
                    border:isSel?"2.5px solid #0C447C":"1.5px solid #cbd5e1",
                    background:isSel?"#0C447C":isWE?"#e2e8f0":"#fff",
                    color:isSel?"#fff":isWE?"#475569":"#1e293b",
                    cursor:"pointer",padding:"10px 0",fontSize:15,
                    fontWeight:isSel?800:600,textAlign:"center"}}>
                  {d}
                </button>
              );
            })}
          </div>
          <div style={{fontSize:11,color:"#475569",fontWeight:600,marginTop:9,textAlign:"center"}}>
            Appuie sur un jour pour ajouter/retirer · 1h30 TC par jour
          </div>
        </div>}

        {/* ── Jours triés : en attente en haut, validées en bas ── */}
        {(()=>{
          const renderGroupe = (moisKey, dates, isVert) => {
            const [annee, mois] = moisKey.split("-").map(Number);
            const nbMin = dates.length * 90;
            const h = Math.floor(nbMin/60);
            const m2 = nbMin%60;
            const fiaRef = isVert ? fiaMois[dates[0]] : null;
            const fiaLabel = fiaRef
              ? `Constaté ${MOIS_L[parseInt(fiaRef.slice(5,7))-1]} ${fiaRef.slice(0,4)}`
              : null;
            return(
              <div key={`${isVert?"v":"o"}-${moisKey}`} style={{borderBottom:"1px solid #f1f5f9"}}>
                <div style={{
                  padding:"7px 14px",
                  background:isVert?"#E1F5EE":"#FAECE7",
                  display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,
                }}>
                  <span style={{fontSize:12,fontWeight:700,color:isVert?"#04342C":"#712B13"}}>
                    {MOIS_L[mois-1]} {annee}
                  </span>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {fiaLabel&&<span style={{fontSize:10,background:"#9FE1CB",color:"#04342C",
                      borderRadius:6,padding:"2px 7px",fontWeight:600}}>✅ {fiaLabel}</span>}
                    <span style={{fontSize:11,color:isVert?"#0F6E56":"#993C1D",fontWeight:700}}>
                      {dates.length} j · {h}h{String(m2).padStart(2,'0')}
                    </span>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:0}}>
                  {dates.map(dk=>{
                    const jourLabel = new Date(dk).toLocaleDateString("fr-FR",{weekday:"long",day:"2-digit",month:"long"});
                    const moisFia = fiaMois[dk]||"";
                    const done = !!fiaDone[dk];
                    const rappel = getPlanningRappel(schedule, agentId, dk);
                    const overflow = done ? tcData?.detailPauses?.[dk] : null;
                    return(
                      <div key={dk} style={{
                        display:"flex",alignItems:"center",gap:8,
                        padding:"9px 14px 9px 12px",
                        borderBottom:"1px solid #f8fafc",
                        borderLeft:`4px solid ${done?"#1D9E75":"#D85A30"}`,
                        background:done?"#E1F5EE":"#FAECE7",
                      }}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:600,
                            color:done?"#04342C":"#712B13",
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {done&&<span style={{marginRight:4}}>✅</span>}
                            {jourLabel}
                          </div>
                          <div style={{fontSize:11,fontWeight:600,marginTop:3,
                            color:rappel?(done?"#0F6E56":"#993C1D"):"#94a3b8",fontStyle:rappel?"normal":"italic"}}>
                            {rappel ? `📋 ${rappel}` : "Planning vide ce jour-là"}
                          </div>
                          {overflow&&overflow.horsPlafond>0&&<div style={{fontSize:10,fontWeight:700,color:"#b45309",marginTop:4,
                            background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"3px 7px",display:"inline-block"}}>
                            ⚠️ {minToHM(overflow.horsPlafond)} non ajoutées (plafond TC) — à vérifier en heures sup
                          </div>}
                          <div style={{display:"flex",alignItems:"center",gap:7,marginTop:7,flexWrap:"wrap"}}>
                            <span style={{fontSize:12,color:done?"#04342C":"#712B13",fontWeight:600,whiteSpace:"nowrap"}}>
                              Mois de constatation :
                            </span>
                            <select value={moisFia} disabled={!done}
                              title={!done?"Marque d'abord cette pause comme vérifiée pour pouvoir choisir un mois":""}
                              onChange={e=>setFiaMois(dk,e.target.value)}
                              style={{fontSize:13,
                                border:`1px solid ${done?"#5DCAA5":"#e2e8f0"}`,
                                borderRadius:8,padding:"6px 9px",minHeight:36,
                                background:done?"#fff":"#f1f5f9",
                                color:done?"#04342C":"#94a3b8",fontWeight:500,
                                cursor:done?"pointer":"not-allowed",outline:"none",maxWidth:180}}>
                              <option value="">— Sélectionner le mois —</option>
                              {moisOptions.map(o=>(
                                <option key={o.key} value={o.key}>{o.label}</option>
                              ))}
                            </select>
                            {moisFia&&<span style={{fontSize:12,
                              background:done?"#9FE1CB":"#F0997B",
                              color:done?"#04342C":"#712B13",borderRadius:7,padding:"3px 8px",fontWeight:600}}>
                              Fiche {moisFia.slice(5,7)}/{moisFia.slice(0,4)}
                            </span>}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:7,flexShrink:0,alignItems:"center"}}>
                          <button onClick={()=>toggleFiaDone(dk)}
                            title={done?"Repasser en attente":"Marquer vérifié — ajoute 1h30 au TC"}
                            style={{background:done?"#1D9E75":"#fff",
                              border:`1px solid ${done?"#0F6E56":"#F0997B"}`,
                              color:done?"#fff":"#712B13",
                              borderRadius:9,padding:"10px 13px",cursor:"pointer",
                              fontSize:13,fontWeight:600,whiteSpace:"nowrap",minHeight:42}}>
                            {done?"✓ Validée":"Vérifié ?"}
                          </button>
                          <button onClick={()=>toggleDate(dk)} title="Retirer cette journée"
                            style={{background:"#fff",border:`1px solid ${done?"#9FE1CB":"#F0997B"}`,
                              color:done?"#04342C":"#993C1D",borderRadius:9,padding:"10px 14px",
                              cursor:"pointer",fontSize:16,fontWeight:600,minHeight:42,minWidth:42}}>×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          };

          const hasData = allDatesSorted.length > 0;
          if(!hasData) return !showCal&&(
            <div style={{padding:"18px",textAlign:"center",fontSize:12,color:"#64748b",fontWeight:500}}>
              Aucune pause figée enregistrée pour {year}.
            </div>
          );

          return(
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {parMoisOrange.length>0&&<>
                <div style={{padding:"5px 14px",background:"#FAECE7",
                  borderBottom:"1px solid #F0997B"}}>
                  <span style={{fontSize:10,fontWeight:700,color:"#712B13",letterSpacing:.5}}>
                    ⏳ EN ATTENTE DE VÉRIFICATION ({datesOrange.length})
                  </span>
                </div>
                {parMoisOrange.map(([moisKey,dates])=>renderGroupe(moisKey,dates,false))}
              </>}

              {parMoisVert.length>0&&<>
                <div style={{padding:"5px 14px",background:"#E1F5EE",
                  borderBottom:"1px solid #5DCAA5",
                  borderTop:parMoisOrange.length>0?"2px solid #e2e8f0":"none"}}>
                  <span style={{fontSize:10,fontWeight:700,color:"#04342C",letterSpacing:.5}}>
                    ✅ VALIDÉES ({datesVertes.length})
                  </span>
                </div>
                {parMoisVert.map(([moisKey,dates])=>renderGroupe(moisKey,dates,true))}
              </>}
            </div>
          );
        })()}
      </div>
      </div>
      )}
      </div>
    </div>
  );
}



// ─── BARRE DE SAISIE RAPIDE ──────────────────────────────────────────────────
function BarreSaisieRapide({barreConfig, setBarreConfig, codeActif, setCodeActif,
  getColor, getTc, showConfig, setShowConfig, CODES_BARRE}){

  const [showFetesMenu, setShowFetesMenu] = useState(false);
  const anneeCourante = new Date().getFullYear();
  // Dates fêtes de l'année courante pour afficher les dates dans le menu
  const datesFetes = getDatesFetesAnnee(anneeCourante);

  // Est-ce qu'un code fête est actif ?
  const isFeteActif = codeActif && CODES_FETES[codeActif];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {/* Barre principale */}
      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
        {barreConfig.map(c=>{
          // Bouton spécial FETES
          if(c === "FETES"){
            return(
              <div key="FETES" style={{position:"relative"}}>
                <button
                  onClick={()=>{setShowFetesMenu(v=>!v); if(isFeteActif) setCodeActif(null);}}
                  style={{
                    display:"inline-flex",alignItems:"center",gap:5,
                    background: isFeteActif||showFetesMenu ? getColor("F1") : getColor("F1")+"33",
                    color: isFeteActif||showFetesMenu ? getTc("F1") : getColor("F1"),
                    border:`2px solid ${getColor("F1")}`,
                    borderRadius:10,padding:"7px 13px",cursor:"pointer",
                    fontSize:12,fontWeight:800,minHeight:38,
                    boxShadow: isFeteActif?`0 0 0 3px ${getColor("F1")}44`:"none",
                    position:"relative",
                  }}>
                  {isFeteActif&&<span style={{
                    position:"absolute",top:-4,right:-4,
                    width:10,height:10,borderRadius:"50%",
                    background:"#6366f1",border:"2px solid #fff",
                  }}/>}
                  🩷 {isFeteActif ? codeActif : "Fêtes"} ▾
                </button>

                {/* Overlay fermeture */}
                {showFetesMenu&&<div
                  onClick={()=>setShowFetesMenu(false)}
                  style={{position:"fixed",inset:0,zIndex:999,background:"rgba(0,0,0,.3)"}}
                />}
                {/* Menu déroulant fêtes — bottom-sheet fixed */}
                {showFetesMenu&&<div style={{
                  position:"fixed",left:0,right:0,bottom:0,
                  background:"#fff",border:"none",
                  borderRadius:"16px 16px 0 0",
                  boxShadow:"0 -4px 24px rgba(0,0,0,.2)",
                  zIndex:1000,maxHeight:"65vh",overflowY:"auto",
                }}>
                  {/* Header */}
                  <div style={{padding:"12px 16px 8px",background:getColor("F1")+"22",
                    display:"flex",alignItems:"center",justifyContent:"space-between",
                    borderRadius:"16px 16px 0 0",position:"sticky",top:0}}>
                    <span style={{fontSize:12,fontWeight:800,color:getColor("F1"),letterSpacing:.5}}>
                      🩷 SÉLECTIONNER UNE FÊTE
                    </span>
                    <button onClick={()=>setShowFetesMenu(false)}
                      style={{background:getColor("F1")+"22",border:"none",
                        borderRadius:8,width:30,height:30,cursor:"pointer",
                        fontSize:16,color:getColor("F1"),display:"flex",
                        alignItems:"center",justifyContent:"center"}}>✕</button>
                  </div>
                  {Object.entries(CODES_FETES).map(([code, label])=>{
                    const dateFete = datesFetes[code];
                    const isActif = codeActif===code;
                    if(!dateFete) return null; // VN conditionnel
                    return(
                      <button key={code}
                        onClick={()=>{
                          setCodeActif(isActif?null:code);
                          setShowFetesMenu(false);
                        }}
                        style={{
                          display:"flex",alignItems:"center",gap:8,
                          width:"100%",background:isActif?"#fce7f3":"#fff",
                          border:"none",borderBottom:"1px solid #fdf2f8",
                          padding:"8px 12px",cursor:"pointer",textAlign:"left",
                        }}>
                        <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                          <span style={{
                            background:getColor("F1"),color:getTc("F1"),
                            borderRadius:6,padding:"2px 8px",
                            fontFamily:"monospace",fontSize:11,fontWeight:800,
                            letterSpacing:.5,
                          }}>{code}</span>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>{label}</div>
                          <div style={{fontSize:10,color:"#94a3b8"}}>
                            {new Date(dateFete).toLocaleDateString("fr-FR",{weekday:"long",day:"2-digit",month:"long"})}
                          </div>
                        </div>
                        {isActif&&<span style={{color:getColor("F1"),fontWeight:800,fontSize:16}}>✓</span>}
                      </button>
                    );
                  })}
                </div>}
              </div>
            );
          }

          // Bouton standard
          const couleur = getColor(c);
          const tc = getTc(c);
          const isActif = codeActif===c;
          const label = CODES_BARRE.find(x=>x.c===c)?.l||c;
          return(
            <button key={c}
              onClick={()=>{setCodeActif(isActif?null:c); setShowFetesMenu(false);}}
              style={{
                display:"inline-flex",alignItems:"center",gap:5,
                background: isActif ? couleur : couleur+"22",
                color: isActif ? tc : couleur,
                border:`2px solid ${couleur}`,
                borderRadius:10,padding:"7px 13px",cursor:"pointer",
                fontSize:12,fontWeight:800,minHeight:38,
                boxShadow: isActif?"0 0 0 3px "+couleur+"44":"none",
                transition:"all .15s",position:"relative",
              }}>
              {isActif&&<span style={{
                position:"absolute",top:-4,right:-4,
                width:10,height:10,borderRadius:"50%",
                background:"#6366f1",border:"2px solid #fff",
              }}/>}
              {label}
            </button>
          );
        })}

        {/* Bouton EFFACER — toujours visible */}
        <button
          onClick={()=>{setCodeActif(codeActif==="EFFACER"?null:"EFFACER"); setShowFetesMenu(false);}}
          style={{
            background: codeActif==="EFFACER" ? "#dc2626" : "#fef2f2",
            color: codeActif==="EFFACER" ? "#fff" : "#dc2626",
            border:`2px solid ${codeActif==="EFFACER"?"#dc2626":"#fecaca"}`,
            borderRadius:10,padding:"7px 12px",cursor:"pointer",
            fontSize:11,fontWeight:800,minHeight:38,
            boxShadow: codeActif==="EFFACER"?"0 0 0 3px #fca5a5":"none",
            whiteSpace:"nowrap",
          }}>
          🗑 Effacer
        </button>

        {/* Annuler mode actif */}
        {codeActif&&codeActif!=="EFFACER"&&
          <button onClick={()=>{setCodeActif(null);setShowFetesMenu(false);}}
            style={{background:"#f1f5f9",color:"#64748b",border:"1.5px solid #e2e8f0",
              borderRadius:10,padding:"7px 10px",cursor:"pointer",fontSize:12,fontWeight:700,
              minHeight:38}}>
            ✕
          </button>}

        {/* Bouton config */}
        <button onClick={()=>{setShowConfig(v=>!v);setShowFetesMenu(false);}}
          title="Configurer la barre"
          style={{background:showConfig?"#1e293b":"#f1f5f9",
            color:showConfig?"#fff":"#64748b",
            border:"1.5px solid #e2e8f0",borderRadius:10,
            padding:"7px 10px",cursor:"pointer",fontSize:13,
            marginLeft:"auto",minHeight:38,fontWeight:700}}>
          ⚙️
        </button>
      </div>

      {/* Info mode actif */}
      {codeActif&&<div style={{
        fontSize:10,fontWeight:700,borderRadius:8,padding:"5px 10px",
        background: codeActif==="EFFACER" ? "#fef2f2" : "#eef2ff",
        color: codeActif==="EFFACER" ? "#dc2626" : "#6366f1",
        display:"flex",alignItems:"center",gap:6,
      }}>
        {codeActif==="EFFACER"
          ? "🗑 Mode effacement — tap sur un jour pour le vider"
          : `✏️ Saisie : ${CODES_FETES[codeActif]
              ? `🩷 ${codeActif} — ${CODES_FETES[codeActif]}`
              : CODES_BARRE.find(x=>x.c===codeActif)?.l||codeActif
            } — tap sur un jour pour appliquer`
        }
        <button onClick={()=>setCodeActif(null)}
          style={{background:"none",border:"none",cursor:"pointer",
            fontSize:12,color:"inherit",opacity:.6,padding:0,marginLeft:"auto"}}>✕</button>
      </div>}

      {/* Panneau de configuration */}
      {showConfig&&<div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",
        borderRadius:12,padding:"12px 14px"}}>
        <div style={{fontSize:11,fontWeight:800,color:"#1e293b",marginBottom:8}}>
          Choisir les codes à afficher dans la barre :
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {CODES_BARRE.map(({c,l})=>{
            const sel = barreConfig.includes(c);
            const couleur = c==="FETES"?getColor("F1"):getColor(c);
            const tc = c==="FETES"?"#fff":getTc(c);
            return(
              <button key={c}
                onClick={()=>setBarreConfig(prev=>
                  sel ? prev.filter(x=>x!==c) : [...prev,c]
                )}
                style={{
                  display:"inline-flex",alignItems:"center",gap:4,
                  background: sel ? couleur : "#fff",
                  color: sel ? tc : "#64748b",
                  border:`1.5px solid ${sel?couleur:"#e2e8f0"}`,
                  borderRadius:8,padding:"5px 11px",cursor:"pointer",
                  fontSize:11,fontWeight:sel?800:500,minHeight:34,
                }}>
                {sel&&"✓ "}{l}
              </button>
            );
          })}
        </div>
        <div style={{fontSize:9,color:"#94a3b8",marginTop:8}}>
          {barreConfig.length} code{barreConfig.length>1?"s":""} sélectionné{barreConfig.length>1?"s":""}
        </div>
      </div>}
    </div>
  );
}


// ─── HELPER RC FÊTES AGENDA ──────────────────────────────────────────────────
// Retourne la liste des codes fêtes dont ce jour est soit :
//   - le jour de la fête elle-même (code Fx saisi directement)
//   - le RC pris (RP dans le trimestre suivant détecté pour une fête donnée)
// Utilisé pour afficher la pastille RC-Fx dans l'agenda
function getRCFetesDuJour(agentId, dk, schedule, agentProfiles, yearAgent){
  const year = parseInt(dk.slice(0,4));
  const result = []; // [{code, label, type: "fete"|"RC"|"RC_manuel"}]
  const dejaPush = new Set(); // éviter doublons

  // 1. Code fête saisi directement — pas affiché en pastille (déjà visible via badge journée)
  const entry = schedule[`${agentId}-${dk}`];
  if(entry?.equipe && CODES_FETES[entry.equipe]){
    dejaPush.add(entry.equipe); // marquer comme déjà traité sans ajouter la pastille
  }

  const datesFetes = getDatesFetesAnnee(year);

  // 2. Date de prise saisie MANUELLEMENT dans le tableau des fêtes (fetesTracking)
  // Si l'agent a saisi ce jour comme date de prise d'une fête → on l'affiche
  const trackingAnnee = agentProfiles[agentId]?.fetesTracking?.[year] || {};
  Object.entries(trackingAnnee).forEach(([code, data])=>{
    if(!CODES_FETES[code]) return;
    if(data?.priseLe === dk && !dejaPush.has(code)){
      result.push({
        code,
        label: CODES_FETES[code],
        type: data.priseType === "manuel" ? "RC_manuel" : "RC",
      });
      dejaPush.add(code);
    }
  });

 
  return result;
}

function PersonalView({agent,schedule,setSchedule,onImportDP,agentProfiles,setAgentProfiles,onFetePaye,isAdmin,currentUser,echangesCount,echangesOuvertesIds,onOpenEchanges,onOpenFormation}){
  // echangesDismissedIds (24/08) : par identifiant de demande, pas par simple
  // compte -- l'ancienne version (echangesDismissedCount) cachait le bandeau
  // "pour toujours" tant que le nombre total de demandes ouvertes ne
  // redepassait pas le chiffre au moment de la fermeture, meme des semaines
  // apres, meme si c'est toujours la MEME demande jamais cloturee qui reste
  // ouverte (signale par Olivier : demande bien ouverte en base, mais
  // bandeau invisible sur son telephone). Fermer ne masque plus desormais
  // que les demandes precises deja vues -- une demande encore ouverte reste
  // affichee tant qu'elle n'a pas ete individuellement fermee, et une
  // NOUVELLE demande (id different) reactive toujours le bandeau meme si le
  // total redescend au meme chiffre qu'avant.
  const [echangesDismissedIds,setEchangesDismissedIds]=usePersist("echangesDismissedIds",[]);
  const echangesVisibles=(echangesOuvertesIds||[]).filter(id=>!echangesDismissedIds.includes(id));
  const [showHab,setShowHab]=useState(false);
  const [showHabRoul,setShowHabRoul]=useState(false);
  const [dayPopup,setDayPopup]=useState(null); // {dk, entry}
  // Fêtes déjà "prises" ou "payées" cette année-là (code -> message d'explication), pour
  // griser dans le popup les codes fête déjà réglés et éviter d'en saisir un doublon ou de
  // recréer une "prise" sur une fête déjà payée (signalé par Olivier le 14/07 : rien
  // n'empêchait de re-sélectionner une fête déjà réglée, ce qui recréait l'incohérence
  // prise+payée résolue plus tôt dans la journée).
  const fetesPrises = useMemo(()=>{
    if(!dayPopup || !agent) return {};
    const yr = parseInt(dayPopup.dk.slice(0,4));
    const { lignes: lignesFete } = computeFetesLignes(agent, schedule, agentProfiles, yr);
    const map = {};
    lignesFete.forEach(l=>{
      if(l.override?.epargneCet){
        map[l.code] = `${l.code} (${l.label}) a déjà été épargnée au CET. Va dans Compteurs → CET pour l'annuler d'abord si tu veux la reprendre autrement.`;
      } else if(l.priseLe && l.priseLe !== dayPopup.dk){
        map[l.code] = `${l.code} (${l.label}) est déjà prise le ${new Date(l.priseLe+"T12:00:00").toLocaleDateString("fr-FR")}. Va dans Compteurs → Fêtes pour l'annuler d'abord si tu veux la déplacer.`;
      } else if(!l.priseLe && (l.statut==="payee"||l.statut==="payee_auto")){
        map[l.code] = `${l.code} (${l.label}) a déjà été enregistrée comme payée (${MOIS_NOMS[l.moisPaye-1]}${l.anneePaye!==yr?` ${l.anneePaye}`:""}). Va dans Compteurs → Fêtes pour la mettre à jour si ce n'est pas correct.`;
      }
    });
    return map;
  }, [dayPopup, agent, schedule, agentProfiles]);
  const [monthOff,setMonthOff]=useState(0);
  const personalDateJumpRef=useRef();
  const jumpToMonthDate=(dateStr)=>{
    const target=new Date(dateStr+"T12:00:00");
    const today=new Date();
    const diffMonths=(target.getFullYear()*12+target.getMonth())-(today.getFullYear()*12+today.getMonth());
    setMonthOff(diffMonths);
  };
  const swipeMonth=useSwipeHandlers(()=>setMonthOff(m=>m+1),()=>setMonthOff(m=>m-1));
  const [showColorPicker,setShowColorPicker]=useState(false);
  // agentColors : stocké dans agentProfiles pour sync Supabase + réactivité immédiate.
  // Source unique de vérité : agentProfiles[agent.id].agentColors — plus d'état
  // parallèle séparé (l'ancien `agentCouleurs` dupliqué au niveau App a été
  // supprimé le 17/07 : il pouvait se désynchroniser entre appareils et, combiné
  // à un garde-fou de sauvegarde bogué, empêchait une réinitialisation de la
  // palette de vraiment persister côté serveur — voir résolus du 17/07).
  const agKeyColors=agent?.immatriculation||agent?.cp||agent?.id;
  const agentColors = agentProfiles[agKeyColors]?.agentColors || {};

  // Setter : met à jour agentProfiles directement (→ Supabase via l'autosave
  // générique). Lit toujours l'état frais dans l'updater (p[agKeyColors]),
  // jamais une variable capturée au rendu — voir feedback_stale_closure_setters.
  const setAgentColors = (updater) => {
    setAgentProfiles(p=>{
      const current = p[agKeyColors]?.agentColors || {};
      const next = typeof updater==="function" ? updater(current) : updater;
      return {...p,[agKeyColors]:{...(p[agKeyColors]||{}),agentColors:next||{}}};
    });
  };

  // v2 - Couleur effective pour un code
  const getColor=(code)=>{
    const colors = agentColors || {};

    if(colors[code]) return colors[code];
    // Fêtes légales F1..VN → couleur perso de F1 ou défaut rose
    if(CODES_FETES[code]) return colors["F1"] || "#ff82e8";
    // Couleur par défaut connue
    if(DEFAULT_COLORS[code]) return DEFAULT_COLORS[code];
    // Fallback EQUIPES
    return EQ[code]?.color||"#f8fafc";
  };
  const getTc=(code)=>getTextColor(getColor(code));

  // Accès aux données privées = agent connecté uniquement
  const isOwnProfile = currentUser?.agent?.id === agent?.id;

  // Modifier l'équipe d'un jour (supporte equipe2 pour double période)
  const setDay=(dk,code,isSecond=false)=>{
    if(!agent)return;
    setSchedule(prev=>{
      const next={...prev};
      const key=`${agent.id}-${dk}`;
      if(isSecond){
        if(code){ next[key]={...(next[key]||{}),equipe2:code}; }
        else { if(next[key]){const {equipe2,...rest}=next[key];next[key]=rest;} }
      } else {
        if(code){
          const eq = EQ[code]||EQ_COLORS[code]||null;

          // Règle vue équipe :
          // prive:false → visible en vue équipe : M/AM/N/J/JF + FOR + DISPO + postes jsCode
          // prive:true  → privé : RP/RU/CA/MA/ABS/FETE…
          const CODES_PUBLICS = new Set(["M","AM","N","J","JF","FOR","DISPO"]);
          const isPrive = !CODES_PUBLICS.has(code) && !CODES_FETES[code]===false;

          // Déterminer si c'est un jsCode de poste (PICCL-, PICCLO…)
          const allPostes3x8 = [...POSTES_PRCI_3x8,...POSTES_PAR_3x8];
          const posteMatch = allPostes3x8.find(p=>
            p.M===code||p.AM===code||p.N===code
          );
          const equipeBase = posteMatch
            ? (posteMatch.M===code?"M":posteMatch.AM===code?"AM":"N")
            : (eq?.equipe||code);

          // Poste HAB réserviste (journée)
          const posteHabJ = HAB_PRCI.concat(HAB_PAR).find(p=>p.code===code&&p.type==="J");

          if(posteMatch){
            // jsCode 3×8 (PICCL-, PICCLO, PICCLX…) → equipe M/AM/N, prive:false
            next[key]={
              ...(next[key]||{}),
              equipe: equipeBase,
              jsCode: code,
              horaires: EQ[equipeBase]?.heures||"",
              prive: false,
            };
          } else if(posteHabJ){
            // Poste journée réserviste → equipe J, prive:false
            const posJ = POSTES_JOURNEE.find(p=>p.jsCode===code);
            next[key]={
              ...(next[key]||{}),
              equipe:"J",
              jsCode:code,
              horaires:posJ?.horaires||"",
              prive:false,
            };
          } else {
            // Code standard (M,AM,N,J,RP,CA…)
            const eqData = eq||{prive:false,heures:""};
            // Appliquer la règle prive selon le code
            const priveEffectif = CODES_PUBLICS.has(code) ? false : (eqData.prive||true);
            next[key]={
              ...(next[key]||{}),
              equipe:code,jsCode:code,
              horaires:eqData.heures||"",
              prive: priveEffectif,
            };
          }
        } else { delete next[key]; }
      }
      // Sync Supabase directe
      setTimeout(()=>{
        const agCp = agent.immatriculation || agent.cp || agent.id;
 if(next[key]) api.planning.saveEntry(agCp, dk, next[key]);
        else api.planning.deleteEntry(agCp, dk);
      }, 0);
      return next;
    });
  };
  const _today=new Date();
  const _monthDate=new Date(_today.getFullYear(),_today.getMonth()+monthOff,1);
  const curYear=_monthDate.getFullYear();
  const curMonth=_monthDate.getMonth();
  const monthDates=useMemo(()=>getMonthDates(curYear,curMonth),[curYear,curMonth]);
  const firstDay=useMemo(()=>firstDayOfMonth(curYear,curMonth),[curYear,curMonth]);
  // Numérotation des congés (Phase 2 refonte Congés, 15/07 — étendue le 06/08
  // pour inclure les congés "Demandés" dans la MÊME série cumulative que les
  // congés accordés) : 1er congé de l'année (accordé OU demandé) = n°1, le
  // suivant n°2, etc., tous triés ensemble par date chronologique — recalculé
  // à la volée à chaque rendu (jamais stocké). Olivier a confirmé
  // explicitement vouloir un recalcul complet à chaque changement, même si un
  // jour demandé plus tôt dans l'année décale le numéro de jours déjà
  // accordés plus tard ("le tout est de savoir où on en est"). Un jour
  // demandé affiche son numéro entre parenthèses (voir ZONE 1 plus bas) ; un
  // jour accordé garde le MÊME numéro sans parenthèses dès qu'il bascule
  // (aucune renumérotation à la transition, la série est déjà unique).
  // Volontairement basé sur le calendrier civil de la case affichée (comme
  // avant), pas sur le total "Pris" du tableau de bord (qui tient compte des
  // reports A+1).
  // 13/08 (Olivier, "CA 22 (2026) s'il est placé en report sur 2027") : un
  // jour physiquement daté sur curYear mais REPORTÉ (décompté du budget de
  // l'année précédente via congesReports/rpReports/ruReports) ne doit plus
  // occuper de rang dans la série locale de curYear — il n'entame pas son
  // budget, "on garde les compteurs juste sur l'année A+1" (série locale
  // correcte, non gonflée par un jour qui ne lui appartient pas). Réutilise
  // computeCompteurAvecDetail (même logique que les tableaux de bord Congés/
  // RP/RU : tousJours exclut déjà, pour l'année demandée, les jours
  // revendiqués par l'année précédente) plutôt que de dupliquer ce calcul.
  // Le jour reporté affiche à la place le numéro qu'il occupe réellement dans
  // la série de l'année qui le revendique, avec cette année entre
  // parenthèses pour lever l'ambiguïté — jamais un numéro "local" à curYear,
  // qui donnerait à tort l'impression qu'il compte sur le budget de curYear.
  const congeToutNumeros=useMemo(()=>{
    const reportsVersAnneePrec=agentProfiles?.[agent?.id]?.congesReports?.[curYear-1]||[];
    const localTousJours=computeCompteurAvecDetail(agent,schedule,agentProfiles,curYear,["CA","CP"],"congesReports",null,false).tousJours;
    const accordes=localTousJours.map(d=>({date:d,statut:"accorde"}));
    // 13/08 (Olivier) : un jour "Demandé" physiquement dans curYear mais DÉJÀ
    // revendiqué par curYear-1 (report en attente, pas encore accordé — voir
    // ajouterReport) n'occupe plus de rang dans la série locale de curYear
    // non plus, exactement comme un jour accordé reporté — il sera géré par
    // l'override ci-dessous, avec son propre badge sablier.
    const demandes=getCongesDemandeesAnnee(agent,agentProfiles,schedule,curYear)
      .filter(d=>!reportsVersAnneePrec.includes(d))
      .map(d=>({date:d,statut:"demande"}));
    // 23/08 (Olivier, revenu sur le correctif du 22/08 après l'avoir vu en
    // conditions réelles sur le compte d'Audrey BATY : "je veux que les
    // conges note comme accordes est le bon numero (y compris les reports)
    // sinon il ne vont pas piger [...] ce qui est sur le planning doit avoir
    // le bon chiffre. il faut que tu trouve autre chose pour suivre le CA
    // refusé") : un jour refusé N'occupe PLUS aucun rang dans la série —
    // ni locale, ni pour positionner un report. Le correctif du 22/08
    // (compter le refus comme un rang réservé mais invisible, "n°10 sauté")
    // réglait bien l'incohérence entre les 2 séries, mais créait un nouveau
    // problème côté lisibilité : un agent qui ne voit QUE les numéros
    // affichés sur son planning (accordés + reportés) tombe sur une suite
    // avec un trou (9 puis 11) sans comprendre pourquoi, puisque le refus
    // n'a lui-même jamais de badge. La bonne source de suivi d'un refus
    // reste la liste "❌ Refusées" du tableau de bord Congés (déjà
    // existante, indépendante de cette numérotation) — pas une place réservée
    // dans la séquence des numéros visibles sur le calendrier.
    const combine=[...accordes,...demandes].sort((a,b)=>a.date<b.date?-1:1);
    const m={};
    combine.forEach((it,i)=>{ m[it.date]={numero:i+1,statut:it.statut}; });
    if(reportsVersAnneePrec.length){
      // Série complète de l'année qui revendique le report : accordés +
      // demandés SEULEMENT (23/08 — les refusés n'y comptent plus, voir
      // commentaire ci-dessus, pour rester cohérent avec la série locale).
      const prevAccordes=computeCompteurAvecDetail(agent,schedule,agentProfiles,curYear-1,["CA","CP"],"congesReports",null,false).tousJours;
      const prevDemandes=getCongesDemandeesAnnee(agent,agentProfiles,schedule,curYear-1);
      // Un report encore "Demandé" (pas accordé) est physiquement daté HORS de
      // curYear-1 (dans curYear) — invisible à getCongesDemandeesAnnee(curYear-1),
      // qui ne scanne que les dates physiquement dans cette année. Il doit
      // pourtant occuper un rang dans la série de curYear-1 (c'est justement ce
      // qu'on cherche à positionner) : ajouté explicitement ici, jamais compté
      // deux fois avec prevAccordes (celui-ci ne contient que les reports déjà
      // accordés, via reportsValides dans computeCompteurAvecDetail).
      const reportsEncoreDemandes=reportsVersAnneePrec.filter(d=>{
        const v=schedule[`${agent.id}-${d}`];
        const estAccorde=v?.equipe==="CA"||v?.equipe==="CP"||v?.equipe2==="CA"||v?.equipe2==="CP";
        return !estAccorde;
      });
      const prevCombine=[...prevAccordes,...prevDemandes,...reportsEncoreDemandes].sort();
      reportsVersAnneePrec.forEach(d=>{
        if(!d.startsWith(String(curYear))) return;
        const idx=prevCombine.indexOf(d);
        if(idx<0) return;
        // Statut RÉEL du jour reporté (accordé ou encore demandé) déterminé
        // depuis son propre état courant — un report peut être ajouté sur un
        // jour encore "Demandé" (voir ajouterReport, 13/08), le badge doit
        // rester le sablier tant qu'il n'est pas accordé.
        const v=schedule[`${agent.id}-${d}`];
        const estAccorde=v?.equipe==="CA"||v?.equipe==="CP"||v?.equipe2==="CA"||v?.equipe2==="CP";
        const t=agentProfiles?.[agent?.id]?.congesDemandes?.[d];
        const estDemande=!estAccorde && t && t.statut==="demande";
        if(!estAccorde && !estDemande) return; // report orphelin (jour refusé/vide depuis) -> pas de badge
        m[d]={numero:idx+1,statut:estAccorde?"accorde":"demande",anneeReport:curYear-1};
      });
    }
    return m;
  },[agent,schedule,agentProfiles,curYear]);
  // Numérotation RQ (04/08) : pas de mécanisme de report par date pour ce
  // compteur (solde roulant, voir DETAIL_CONFIG.RQ) — numéroté tel quel, sur
  // toutes les occurrences, aucun cas de report à gérer ici.
  const rqNumeros=useMemo(()=>{
    const jours=getJoursCodesAnnee(agent,schedule,curYear,["RQ"]).sort();
    const m={};
    jours.forEach((d,i)=>{ m[d]=i+1; });
    return m;
  },[agent,schedule,curYear]);
  // Numérotation RU (04/08, étendue le 13/08 pour le report — même principe
  // exact que congeToutNumeros ci-dessus, RU ayant lui aussi un reportKey).
  const ruNumeros=useMemo(()=>{
    const localTousJours=computeCompteurAvecDetail(agent,schedule,agentProfiles,curYear,["RU"],"ruReports",null,false).tousJours;
    const m={};
    localTousJours.forEach((d,i)=>{ m[d]={numero:i+1}; });
    const reportsVersAnneePrec=agentProfiles?.[agent?.id]?.ruReports?.[curYear-1]||[];
    if(reportsVersAnneePrec.length){
      const prevTousJours=computeCompteurAvecDetail(agent,schedule,agentProfiles,curYear-1,["RU"],"ruReports",null,false).tousJours;
      reportsVersAnneePrec.forEach(d=>{
        if(!d.startsWith(String(curYear))) return;
        const idx=prevTousJours.indexOf(d);
        if(idx>=0) m[d]={numero:idx+1,anneeReport:curYear-1};
      });
    }
    return m;
  },[agent,schedule,agentProfiles,curYear]);
  // Numérotation RP+RPP (04/08, demandé par Olivier ; report ajouté le
  // 13/08) : RP et RPP comptent ensemble dans une seule numérotation
  // cumulative (comme le compteur), mais le numéro n'est affiché que sur le
  // DERNIER RP ou RPP de chaque mois civil de la série LOCALE (ex: 7 RP + 3
  // RPP en janvier -> seul le dernier des deux affiche "n°10") — un jour
  // reporté vers l'année précédente n'appartient plus à cette série locale
  // (donc jamais concerné par la règle "dernier du mois"), il est toujours
  // affiché, avec son propre numéro dans la série de l'année qui le
  // revendique et cette année entre parenthèses.
  const rpNumeros=useMemo(()=>{
    const localTousJours=computeCompteurAvecDetail(agent,schedule,agentProfiles,curYear,["RP","RPP"],"rpReports",null,false).tousJours;
    const m={};
    localTousJours.forEach((d,i)=>{
      const mois=d.slice(0,7);
      const moisSuivant=localTousJours[i+1]?.slice(0,7);
      if(mois!==moisSuivant) m[d]={numero:i+1};
    });
    const reportsVersAnneePrec=agentProfiles?.[agent?.id]?.rpReports?.[curYear-1]||[];
    if(reportsVersAnneePrec.length){
      const prevTousJours=computeCompteurAvecDetail(agent,schedule,agentProfiles,curYear-1,["RP","RPP"],"rpReports",null,false).tousJours;
      reportsVersAnneePrec.forEach(d=>{
        if(!d.startsWith(String(curYear))) return;
        const idx=prevTousJours.indexOf(d);
        if(idx>=0) m[d]={numero:idx+1,anneeReport:curYear-1};
      });
    }
    return m;
  },[agent,schedule,agentProfiles,curYear]);
  // Numérotation VT (05/08, étendue le 06/08 pour inclure les VT "Demandés"
  // dans la MÊME série cumulative que les VT accordés — exactement le même
  // principe que congeToutNumeros ci-dessous pour les Congés, sur demande
  // explicite d'Olivier ("le même fonctionnement pour les demande accord et
  // refus"). Seule différence assumée avec Congés : l'affichage du numéro
  // reste sur la convention propre à VT (cumul annuel, mais numéro affiché
  // uniquement sur le DERNIER VT — accordé ou demandé — de chaque mois civil,
  // "tu garde juste le compteur de fin de mois pour l'affichage").
  const vtDemandeesSet=useMemo(()=> new Set(getJoursVTDemandeesAnnee(agent,agentProfiles,schedule,curYear)), [agent,agentProfiles,schedule,curYear]);
  const vtToutNumeros=useMemo(()=>{
    const accordes=getJoursCodesAnnee(agent,schedule,curYear,["VT"]).map(d=>({date:d,statut:"accorde"}));
    const demandes=[...vtDemandeesSet].map(d=>({date:d,statut:"demande"}));
    // 23/08 (Olivier, revenu sur le correctif du 22/08 — voir congeToutNumeros
    // ci-dessus pour Congés, même principe/même revirement) : un VT refusé
    // n'occupe plus aucun rang dans la série — un agent qui ne voit que ce
    // qui est réellement sur son planning doit tomber sur une suite continue,
    // sans trou réservé à un refus invisible. Le suivi d'un VT refusé reste
    // la liste "❌ Refusées" du tableau de bord VT (déjà existante).
    const combine=[...accordes,...demandes].sort((a,b)=>a.date<b.date?-1:1);
    const m={};
    combine.forEach((it,i)=>{
      const mois=it.date.slice(0,7);
      const moisSuivant=combine[i+1]?.date.slice(0,7);
      if(mois!==moisSuivant) m[it.date]={numero:i+1,statut:it.statut};
    });
    return m;
  },[agent,schedule,agentProfiles,curYear,vtDemandeesSet]);
  // Numérotation Maladie (05/08, demandé par Olivier, même principe que
  // RP+RPP/VT ci-dessus) : cumul annuel, numéro affiché uniquement sur le
  // DERNIER jour de maladie de chaque mois civil.
  const maNumeros=useMemo(()=>{
    const jours=getJoursCodesAnnee(agent,schedule,curYear,["MA"]).sort();
    const m={};
    jours.forEach((d,i)=>{
      const mois=d.slice(0,7);
      const moisSuivant=jours[i+1]?.slice(0,7);
      if(mois!==moisSuivant) m[d]=i+1;
    });
    return m;
  },[agent,schedule,curYear]);
  // Numérotation Grève (05/08, demandé par Olivier : "en différenciant DA,
  // DB, DC") : même principe cumul/dernier-du-mois que RP+RPP/VT/Maladie,
  // mais CHACUN des 3 codes a sa propre série indépendante (pas combinés
  // comme RP+RPP) — reflète que DA/DB/DC sont des types de grève distincts,
  // pas des variantes d'un même repos.
  const greveNumeros=useMemo(()=>{
    const calc=(code)=>{
      const jours=getJoursGreveAnnee(agent,schedule,curYear,code).sort();
      const m={};
      jours.forEach((d,i)=>{
        const mois=d.slice(0,7);
        const moisSuivant=jours[i+1]?.slice(0,7);
        if(mois!==moisSuivant) m[d]=i+1;
      });
      return m;
    };
    return {DA:calc("DA"), DB:calc("DB"), DC:calc("DC")};
  },[agent,schedule,curYear]);
  const [showQuit,setShowQuit]=useState(false);
  // ── SAISIE RAPIDE ──────────────────────────────────────────────────────────
  // codeActif : code en cours de saisie (null = mode cycle classique)
  const [codeActif, setCodeActif] = useState(null);
  // barreConfig : codes affichés dans la barre (persisté par agent)
  const barreConfigKey = `barreRapide_${agent?.id}`;
  const [barreConfig, setBarreConfig] = usePersist(barreConfigKey,
    ["M","AM","N","J","RP","RU","FETES"]);
  const [showBarreConfig, setShowBarreConfig] = useState(false);
  // Tous les codes disponibles pour la barre
  const CODES_BARRE = [
    {c:"M",l:"Matinée"},{c:"AM",l:"Soirée"},{c:"N",l:"Nuit"},{c:"J",l:"Journée"},
    {c:"JF",l:"Fête"},{c:"RP",l:"RP"},{c:"RU",l:"RU"},{c:"RQ",l:"RQ"},
    {c:"TC",l:"TC"},{c:"TY",l:"TY"},{c:"RN",l:"RN"},{c:"NU",l:"NU"},
    {c:"CA",l:"Congés"},{c:"MA",l:"Maladie"},
    {c:"ABS",l:"Absent"},{c:"VT",l:"VT"},{c:"VM",l:"VM"},
    {c:"FOR",l:"Formation"},{c:"DISPO",l:"Dispo"},
    {c:"FETES",l:"🩷 Fêtes"}, // bouton spécial ouvrant le menu fêtes
  ];
  const currentYear=new Date().getFullYear();
  const [compteurYear,setCompteurYear]=useState(currentYear);

  if(!agent)return(<div style={{textAlign:"center",padding:"60px 20px",color:"#94a3b8"}}>
    <div style={{fontSize:40,marginBottom:12}}>👤</div>
    <div style={{fontSize:15,fontWeight:600,color:"#475569"}}>Sélectionne ton profil</div>
  </div>);

  const fam=FAMILLES[agent.famille];
 const agKey=agent.immatriculation||agent.cp||agent.id;
const profile=agentProfiles[agKey]||{};
const setProfile=u=>setAgentProfiles(p=>({...p,[agKey]:{...(p[agKey]||{}),...u}}));
  const hasPin=!!profile.pinHash;
  const ROULEMENTS=["Roulement 3×8","Journée"];
  const nbHab=Object.keys(profile.habilitations||{}).length;
  const nbValid=Object.values(profile.habilitations||{}).filter(v=>v==="HC").length;
  const postesDetectes=[...new Set(Object.entries(schedule).filter(([k])=>k.startsWith(agent.id+"-")).map(([,v])=>v?.poste||v?.jsCode).filter(Boolean))];

  return(<div style={{display:"flex",flexDirection:"column",gap:18}}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

    {/* ── BANDEAU PROFIL ÉTENDU ── */}
   
<AgentHeader agent={agent} profile={profile} compteurYear={compteurYear} setCompteurYear={setCompteurYear} onImportDP={onImportDP} onCouleurs={()=>setShowColorPicker(true)} onHabilitations={()=>setShowHab(true)} onRoulementChange={r=>setProfile({roulement:r})} onReservisteChange={v=>setProfile({isReserve:v})} isOwnProfile={isOwnProfile}/>
    {typeof onOpenEchanges==="function"&&echangesVisibles.length>0&&<div style={{display:"flex",alignItems:"stretch",gap:6,border:"1.5px solid #fdba74",background:"#fef3c7",borderRadius:12,padding:"4px 4px 4px 16px"}}>
      <button onClick={onOpenEchanges} style={{display:"flex",alignItems:"center",justifyContent:"space-between",border:"none",background:"none",cursor:"pointer",fontSize:14,fontWeight:700,color:"#1e293b",flex:1,padding:"8px 0",textAlign:"left"}}>
        <span>🔄 Échanges</span>
        <span style={{background:"#f59e0b",color:"#fff",borderRadius:10,padding:"2px 9px",fontSize:12,fontWeight:700,marginRight:8}}>{echangesVisibles.length}</span>
      </button>
      <button onClick={()=>setEchangesDismissedIds(prev=>[...new Set([...prev,...echangesVisibles])])} title="Masquer ce bandeau" style={{border:"none",background:"none",cursor:"pointer",fontSize:17,color:"#94a3b8",padding:"0 10px"}}>✕</button>
    </div>}
    {/* En-tete simplifiee (04/08, demande par Olivier) : plus de bascule Mois/Semaine/Planning
        (les 2 autres vues retirees, voir CLAUDE.md resolus du 04/08) - nom du mois complet
        toujours visible, navigation par flecheS precedent/suivant (avant : uniquement le
        calendrier natif via showPicker(), pas pratique a la souris) + bouton "Aujourd'hui". */}
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {/* Import PDF au-dessus de la date sur mobile (19/08, Olivier), en
          dessous sur desktop -- ordre visuel piloté par CSS (.f2ppmp-nav-row/
          .f2ppmp-import-row, voir theme.css), le DOM/JSX ne bouge pas. */}
      <div className="f2ppmp-nav-row" style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:2}}>
          <button onClick={()=>setMonthOff(m=>m-1)} aria-label="Mois précédent" style={NAV_ARROW_STYLE}>‹</button>
          <button onClick={()=>{try{personalDateJumpRef.current.showPicker();}catch(e){personalDateJumpRef.current&&personalDateJumpRef.current.click();}}} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,width:150,flexShrink:0,border:"none",background:"none",cursor:"pointer"}}>
            <span style={{fontSize:"clamp(13px,1.6vw,16px)",fontWeight:700,color:"var(--text-primary)",whiteSpace:"nowrap"}}>{MOIS_L[curMonth]} {curYear}</span>
            <span style={{fontSize:11,color:"var(--text-muted)"}}>▾</span>
          </button>
          <button onClick={()=>setMonthOff(m=>m+1)} aria-label="Mois suivant" style={NAV_ARROW_STYLE}>›</button>
        </div>
        <button onClick={()=>{setMonthOff(0);window.dispatchEvent(new CustomEvent("f2ppmp:scrolltoday"));}} style={{display:"flex",alignItems:"center",gap:5,border:"1.5px solid #6366f1",background:monthOff===0?"#f1f5f9":"#eef2ff",color:monthOff===0?"#475569":"#4f46e5",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:"clamp(12px,1.4vw,15px)",fontWeight:700,flexShrink:0}}>Aujourd'hui</button>
      </div>
      {/* 22/08 (Olivier : "dans la version tel met le bouton [export] a droite
          d'import, sur la meme ligne") -- nowrap + overflow-x:auto sur ce
          seul conteneur (jamais la page entière) pour garantir les 2
          boutons sur une seule ligne même sur un petit écran, "Importer
          bulletin de commande" étant intrinsèquement trop long pour
          rétrécir sans devenir illisible. */}
      {isOwnProfile && <div className="f2ppmp-import-row" style={{display:"flex",alignItems:"flex-start",gap:10,flexWrap:"nowrap",overflowX:"auto",paddingBottom:2}}>
        <BulletinImportButton agentCp={agent.immatriculation||agent.cp||agent.id} onImported={()=>{
          const agCp=agent.immatriculation||agent.cp||agent.id;
          api.planning.getSchedule(agCp).then(entries=>{ if (entries) setSchedule(prev=>reconcileSchedule(prev, agCp, entries)); });
        }}/>
        <ExportIcsButton agent={agent} schedule={schedule} curMonth={curMonth} curYear={curYear}/>
      </div>}
    </div>

    <input ref={personalDateJumpRef} type="date" onChange={e=>{if(e.target.value)jumpToMonthDate(e.target.value);}} style={{position:"absolute",width:0,height:0,opacity:0,pointerEvents:"none",border:"none"}}/>
    {/* ── VUE MOIS (seule vue restante depuis le 04/08, voir CLAUDE.md) ── */}
    <>

      {/* Grille mensuelle */}
      <div onTouchStart={swipeMonth.onTouchStart} onTouchEnd={swipeMonth.onTouchEnd} style={{background:"var(--bg-card)",border:"1.5px solid var(--border)",borderRadius:14,overflow:"hidden"}}>
        {/* En-têtes jours */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"var(--bg-page)",borderBottom:"1px solid var(--border)"}}>
          {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(d=>(
            <div key={d} style={{padding:"6px 4px",textAlign:"center",fontSize:"clamp(9px,1.2vw,13px)",fontWeight:800,color:"var(--text-secondary)",letterSpacing:.3}}>{d}</div>
          ))}
        </div>
        {/* Jours du mois */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,padding:6}}>
          {/* Cases vides avant le 1er */}
          {Array.from({length:firstDay},(_,i)=><div key={`e${i}`}/>)}
          {/* Jours */}
          {monthDates.map(dk=>{
            const en=schedule[`${agent.id}-${dk}`];
            const code=en?.equipe;const eq=code?EQ_COLORS[code]:null;
            const isPrive=en?.prive||eq?.prive||false;
            const showData=isOwnProfile||!isPrive;
            const isToday=dk===TODAY;
            const dayNum=parseInt(dk.slice(8));
            const dow=new Date(dk).getDay();
            const isWE=dow===0||dow===6;
            let bg=isWE?"#f8fafc":"#f8fafc";
            if(en?.finNuit&&!en?.equipe) bg="#eff6ff";
            else if(en&&showData&&code) bg=getColor(code);
            // ── Cases logique nuit simplifiée ──
            // Règles:
            // - Case avec nuit soir : badge journée haut + badge Nuit+poste bas
            // - Case nuit suivante (finNuit+equipe2) : haut blanc + badge Nuit+poste bas
            // - Case après dernière nuit (finNuit seul) : entièrement blanche
            const hasDebutNuit = !!(en?.equipe2 === "N" && showData);
            const isNuitSuivante = !!(en?.finNuit && en?.equipe2 === "N" && showData);
            const isDescente = !!(en?.finNuit && !en?.equipe2 && showData);
            const couleurNuit = getColor("N");
            const tcNuit = getTc("N");
            const posteNuitLabel = en?.jsCode2 ? (getPosteLabelFromCode(en.jsCode2) || en.jsCode2) : null;
            // "DISPO" retiré de ce blocklist le 23/08 (même raison que
            // client.js/saveEntry) : c'est désormais un vrai jsCode de poste
            // (nouveau bouton "Journée"), son libellé doit s'afficher comme
            // celui de n'importe quel autre poste sous la case.
            const posteLabel = en?.jsCode && !["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","NU","TC","TY","RN","JF"].includes(en.jsCode) ? (getPosteLabelFromCode(en.jsCode) || en.jsCode) : null;

            const isNuitSeuleCell = code === "N" && !en?.equipe2 && !en?.finNuit;
            return <div key={dk}
              onClick={()=>{ if(isOwnProfile) setDayPopup({dk, entry:en||null}); }}
              style={{
                background:"var(--bg-card)",
                border:isToday?"2px solid #6366f1":"1px solid var(--border)",
                borderRadius:10, cursor:"pointer",
                position:"relative",
                boxShadow:isToday?"0 0 0 3px #eef2ff":"0 1px 3px rgba(0,0,0,.04)",
 padding:"4px 3px 5px", minHeight:76,
                display:"flex", flexDirection:"column", gap:3,
justifyContent: "flex-start",
                minWidth:0, overflow:"hidden",
              }}>
       {/* Numéro du jour */}
              <div style={{fontSize:"clamp(13px,1.8vw,18px)",fontWeight:isToday?800:700,
                color:isToday?"#6366f1":isWE?"#b45309":"var(--text-primary)",
                lineHeight:1.3, marginBottom:1}}>{dayNum}</div>

              {/* ZONE 1 — 🌙 descente de nuit + ✊ grève + 📝 note perso (toujours en haut) */}
              {en?.finNuit&&<div style={{
                background:"#f0f9ff", color:"#0369a1",
                borderRadius:5, padding:"2px 6px",
                fontSize:10, fontWeight:700,
                display:"inline-flex", alignItems:"center", gap:4,
                alignSelf:"flex-start",
              }}>
                🌙
              </div>}
              {/* Grève (DA/DB/DC, 04/08) : independant de equipe/equipe2, se
                  combine avec n'importe quelle journee - couleur dediee et
                  personnalisable ("GREVE"), separee du reste de la palette
                  depuis le 04/08 (demande d'Olivier, auparavant alignee sur
                  "Absent"). Numerotation ajoutee le 05/08 : cumul annuel par
                  code (DA/DB/DC differencies, pas combines), numero affiche
                  uniquement sur le dernier jour du mois pour CE code precis. */}
              {isOwnProfile&&en?.greve&&<div style={{
                background:getColor("GREVE"), color:getTc("GREVE"),
                borderRadius:5, padding:"2px 6px",
                fontSize:10, fontWeight:700,
                display:"flex", flexDirection:"column",
                alignSelf:"flex-start",
              }}>
                <span style={{display:"inline-flex",alignItems:"center",gap:4}}>✊ {en.greve}</span>
                {greveNumeros[en.greve]?.[dk]&&<span style={{fontSize:"clamp(6px,2vw,9px)",opacity:.85,fontWeight:600,display:"block"}}>n°{greveNumeros[en.greve][dk]}</span>}
              </div>}
              {/* Formation (09/08) : meme principe que greve — periode
                  independante, toujours ajoutee EN PLUS du contenu existant
                  du jour (jamais bloquee par un jour deja occupe). L'agent
                  valide sa participation en liberant le reste de la journee,
                  ou retire ce badge (popup) pour decliner. */}
              {isOwnProfile&&en?.formation&&<div style={{
                background:getColor("FOR"), color:getTc("FOR"),
                borderRadius:5, padding:"2px 6px",
                fontSize:10, fontWeight:700,
                display:"flex", flexDirection:"column",
                alignSelf:"flex-start",
              }}>
                <span style={{display:"inline-flex",alignItems:"center",gap:4}}>🎓 Formation</span>
                <span style={{fontSize:"clamp(6px,2vw,9px)",opacity:.85,fontWeight:600,display:"block"}}>{en.formation}</span>
              </div>}
              {/* Congé demandé (06/08) : seul statut Demandé/Refusé/Accordé qui
                  peut s'afficher A CÔTÉ d'une case déjà remplie (contrairement
                  à Accordé, qui écrit directement CA et occupe toute la case,
                  et à Refusé, jamais affiché ici — juste un suivi dans le
                  popup Congés). Numéro entre parenthèses : même série
                  cumulative que les congés accordés (congeToutNumeros
                  ci-dessus), ne change pas quand le jour bascule en accordé. */}
              {isOwnProfile&&congeToutNumeros[dk]?.statut==="demande"&&<div style={{
                background:getColor("CA"), color:getTc("CA"),
                border:`1.5px dashed ${getTc("CA")}`,
                borderRadius:5, padding:"2px 6px",
                fontSize:10, fontWeight:700,
                display:"inline-flex", alignItems:"center", gap:4,
                alignSelf:"flex-start",
              }}>
                ⏳ CA (n°{congeToutNumeros[dk].numero}){congeToutNumeros[dk].anneeReport?` (${congeToutNumeros[dk].anneeReport})`:""}
              </div>}
              {/* VT demandé (06/08, même principe que Congés ci-dessus) — le
                  badge s'affiche toujours pour un VT en attente, le numéro
                  n'apparaît que sur le dernier VT (accordé ou demandé) du
                  mois civil (vtToutNumeros conserve la convention "fin de
                  mois" propre à VT, cf. commentaire plus haut). */}
              {isOwnProfile&&vtDemandeesSet.has(dk)&&<div style={{
                background:getColor("VT"), color:getTc("VT"),
                border:`1.5px dashed ${getTc("VT")}`,
                borderRadius:5, padding:"2px 6px",
                fontSize:10, fontWeight:700,
                display:"inline-flex", alignItems:"center", gap:4,
                alignSelf:"flex-start",
              }}>
                ⏳ VT{vtToutNumeros[dk]?.statut==="demande" ? ` (n°${vtToutNumeros[dk].numero})` : ""}
              </div>}
              {isOwnProfile&&en?.notePerso&&!code&&<div style={{
                background:getColor("NOTE"), color:"#fff",
                borderRadius:5, padding:"2px 5px",
                fontSize:8, fontWeight:700, lineHeight:1.25,
                display:"flex", alignItems:"flex-start", gap:3,
                alignSelf:"stretch", width:"100%", boxSizing:"border-box",
              }}>
                📝 <span style={{overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",flex:1,minWidth:0}}>{en.notePerso}</span>
              </div>}

       {/* ZONE 2 — Utilisation journée (milieu) */}
              {code&&showData&&code!=="N"&&code!=="RPP"&&<div style={{
                background:getColor(code), color:getTc(code),
                borderRadius:5, padding:CODES_FETES[code]?"4px 7px":"2px 3px",
                fontSize:"clamp(7px,2.3vw,10px)", fontWeight:700, lineHeight:1.35,
                display:"flex", flexDirection:"column",
                minWidth:0,
              }}>
                <span lang="fr" style={CODES_FETES[code]||code==="CA"||code==="CP"
                  ? {fontSize:14,fontWeight:800,display:"block",whiteSpace:"nowrap"}
                  : {display:"block",whiteSpace:"normal",overflowWrap:"break-word"}}>{CODES_FETES[code]?("🩷 "+code):(code==="CA"||code==="CP")?("🏖️ "+code):avecCesure(EQ_COLORS[code]?.label||code)}</span>
                {(code==="CA"||code==="CP")&&congeToutNumeros[dk]&&<span style={{fontSize:"clamp(6px,2vw,9px)",opacity:.85,fontWeight:600,display:"block"}}>n°{congeToutNumeros[dk].numero}{congeToutNumeros[dk].anneeReport?` (${congeToutNumeros[dk].anneeReport})`:""}</span>}
                {code==="RU"&&ruNumeros[dk]&&<span style={{fontSize:"clamp(6px,2vw,9px)",opacity:.85,fontWeight:600,display:"block"}}>n°{ruNumeros[dk].numero}{ruNumeros[dk].anneeReport?` (${ruNumeros[dk].anneeReport})`:""}</span>}
                {code==="RQ"&&rqNumeros[dk]&&<span style={{fontSize:"clamp(6px,2vw,9px)",opacity:.85,fontWeight:600,display:"block"}}>n°{rqNumeros[dk]}</span>}
                {code==="RP"&&rpNumeros[dk]&&<span style={{fontSize:"clamp(6px,2vw,9px)",opacity:.85,fontWeight:600,display:"block"}}>n°{rpNumeros[dk].numero}{rpNumeros[dk].anneeReport?` (${rpNumeros[dk].anneeReport})`:""}</span>}
                {code==="VT"&&vtToutNumeros[dk]&&<span style={{fontSize:"clamp(6px,2vw,9px)",opacity:.85,fontWeight:600,display:"block"}}>n°{vtToutNumeros[dk].numero}</span>}
                {code==="MA"&&maNumeros[dk]&&<span style={{fontSize:"clamp(6px,2vw,9px)",opacity:.85,fontWeight:600,display:"block"}}>n°{maNumeros[dk]}</span>}
                {posteLabel&&<span lang="fr" style={{fontSize:"clamp(6px,2vw,9px)",opacity:.85,fontWeight:500,display:"block",whiteSpace:"normal",overflowWrap:"break-word"}}>{posteLabel}</span>}
                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:8,fontWeight:700,color:"#fff",background:getColor("NOTE"),borderRadius:4,padding:"1px 4px",marginTop:1,display:"block",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>📝 {en.notePerso}</span>}
              </div>}

              {/* ZONE 2bis — RPP : badge rond dédié, palette dissociée de RP */}
              {code==="RPP"&&showData&&<div title={isOwnProfile?(en?.notePerso||""):""} style={{
                display:"flex", alignItems:"center", justifyContent:"center",
                width:26, height:26, borderRadius:"50%",
                background:getColor("RPP"), color:getTc("RPP"),
                fontSize:9, fontWeight:800, alignSelf:"center",
                flexShrink:0, margin:"2px auto",
              }}>
                RPP
              </div>}
              {code==="RPP"&&showData&&rpNumeros[dk]&&<span style={{fontSize:"clamp(6px,2vw,9px)",opacity:.85,fontWeight:600,display:"block",textAlign:"center"}}>n°{rpNumeros[dk].numero}{rpNumeros[dk].anneeReport?` (${rpNumeros[dk].anneeReport})`:""}</span>}
              {code==="RPP"&&showData&&isOwnProfile&&en?.notePerso&&<span style={{
                fontSize:8, color:"#fff", fontWeight:700,
                background:getColor("NOTE"), borderRadius:4, padding:"1px 5px",
                textAlign:"center", display:"block", margin:"0 auto",
              }}>📝 {en.notePerso}</span>}

              {/* ZONE 3 — Nuit (toujours en bas) */}
              {(code==="N"||en?.equipe2==="N")&&showData&&<div style={{
                background:getColor("N"), color:getTc("N"),
                borderRadius:5, padding:"2px 5px",
                fontSize:"clamp(7px,2.3vw,10px)", fontWeight:700, lineHeight:1.35,
                display:"flex", flexDirection:"column",
                minWidth:0,
              }}>
                <span style={{display:"block",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Nuit</span>
                {(code==="N"?posteLabel:posteNuitLabel)&&<span lang="fr" style={{fontSize:"clamp(6px,2vw,9px)",opacity:.85,fontWeight:500,display:"block",whiteSpace:"normal",overflowWrap:"break-word"}}>{code==="N"?posteLabel:posteNuitLabel}</span>}
              </div>}

              {/* Pastilles RC fêtes */}
              {(()=>{
                const rcFetes = getRCFetesDuJour(agent.id, dk, schedule, agentProfiles, parseInt(dk.slice(0,4)));
                if(!rcFetes.length) return null;
                return <div style={{display:"flex",flexWrap:"wrap",gap:1,marginTop:1}}>
                  {rcFetes.map(f=>(
                    <span key={f.code}
                      title={`${f.type==="fete"?"Fête prise":f.type==="RC_manuel"?"RC manuel":"RC"} : ${f.label}`}
                      style={{
                        fontSize:7,fontWeight:800,
                        background:"#ec4899",color:"#fff",
                        borderRadius:4,padding:"0px 3px",
                        border:"1px solid #db2777",
                        whiteSpace:"nowrap",
                      }}>
                      {f.code}{f.type==="RC_manuel"?" ✎":""}
                    </span>
                  ))}
                </div>;
              })()}

            </div>;
          })}
        </div>
      </div>

      {/* Info tap */}
      <div style={{fontSize:10,color:codeActif?"#6366f1":"#94a3b8",textAlign:"center",fontWeight:codeActif?700:400}}>
        {codeActif ? `✏️ Mode saisie : tap sur un jour pour appliquer "${codeActif}" — tap à nouveau pour effacer` : ""}
      </div>
    </>
    {showColorPicker&&<ColorCustomizer
      agentColors={agentColors}
      setAgentColors={setAgentColors}
      onClose={()=>{
          setShowColorPicker(false);
          // Sauvegarde explicite et INCONDITIONNELLE à la fermeture (17/07) — l'ancien
          // garde-fou `if(length>0)` ignorait silencieusement une réinitialisation
          // (palette vidée à {}), qui ne partait donc jamais vers le serveur : au
          // rechargement suivant, l'ancienne palette personnalisée revenait, donnant
          // l'impression que "ça ne tient pas". L'autosave générique (App, sur
          // agentProfiles) couvre déjà ce cas, mais cet appel explicite garantit une
          // sauvegarde immédiate et déterministe, sans dépendre de son timing.
          const agKeyS=agent?.immatriculation||agent?.cp||agent?.id;
          api.profil.save(agKeyS, {agentColors});
        }}/>}

    {dayPopup&&<DayEditPopup
      date={dayPopup.dk}
      entry={dayPopup.entry}
      agent={agent}
      agentProfiles={agentProfiles}
      fetesPrises={fetesPrises}
      onSave={async (newEntry)=>{
        const agCp=agent.immatriculation||agent.cp||agent.id;
        const dk=dayPopup.dk;
        const prevEntry = schedule[agCp+'-'+dk] || {};
        // Garder finNuit existant si pas modifie
        const equipeFinale = newEntry.equipe !== undefined ? (newEntry.equipe||null) : (prevEntry.equipe||null);
        const fullEntry={
          equipe:   equipeFinale,
          // Preserver la nuit existante si le popup ne la modifie pas
          equipe2:  newEntry.equipe2 !== undefined ? (newEntry.equipe2||null) : (prevEntry.equipe2||null),
          // Code court local (ex: "ASMP") : c'est ce format que le backend attend
          // pour code_poste (voir api.planning.saveEntry / convertirCodePosteVersJsCode).
          jsCode:   newEntry.jsCode !== undefined ? (newEntry.jsCode||null) : (prevEntry.jsCode||null),
          jsCode2:  newEntry.jsCodeNuit !== undefined ? (newEntry.jsCodeNuit||null) : (prevEntry.jsCode2||null),
          horaires: newEntry.horaires !== undefined ? (newEntry.horaires||null) : (prevEntry.horaires||null),
          prive:    newEntry.prive||false,
          finNuit:  newEntry.finNuit !== undefined ? newEntry.finNuit : (prevEntry.finNuit||false),
          notePerso: newEntry.notePerso !== undefined ? (newEntry.notePerso||null) : (prevEntry.notePerso||null),
          greve:    newEntry.greve !== undefined ? (newEntry.greve||null) : (prevEntry.greve||null),
          formation: newEntry.formation !== undefined ? (newEntry.formation||null) : (prevEntry.formation||null),
          impressionAt: null,
        };
        // Sauvegarder localement
        setDayPopup(null);
        // Si tout vide (pas d'equipe, pas de nuit, pas de finNuit, pas de note, pas de greve, pas de formation) : supprimer la case
        const hasContent = !!(fullEntry.equipe || fullEntry.equipe2 || fullEntry.finNuit || fullEntry.notePerso || fullEntry.greve || fullEntry.formation);
        if(!hasContent) {
          setSchedule(prev=>{const n={...prev};delete n[agCp+'-'+dk];return n;});
          try { await api.planning.deleteEntry(agCp, dk); } catch(e){}
          return;
        }
        // Affichage optimiste : traduire le code court (ex: "ASMP") vers le jsCode
        // canonique (ex: "PAASMJ", celui que renverra le backend au rechargement)
        // pour eviter le flash d'un libelle tronque avant la resynchronisation.
        // Le code court brut, lui, reste dans fullEntry pour la sauvegarde backend.
        setSchedule(prev=>({...prev,[agCp+'-'+dk]:{
          ...fullEntry,
          jsCode:  fullEntry.jsCode  ? (convertirCodePosteVersJsCode(fullEntry.jsCode, equipeFinale) || fullEntry.jsCode)   : null,
          jsCode2: fullEntry.jsCode2 ? (convertirCodePosteVersJsCode(fullEntry.jsCode2, 'N')          || fullEntry.jsCode2) : null,
        }}));
        // Sauvegarder en base, PUIS seulement recharger depuis Railway pour
        // synchroniser (jamais avant confirmation, sinon on risque de
        // recuperer l'ancienne version et d'ecraser silencieusement l'affichage
        // correct si la sauvegarde met plus de 500ms a aboutir).
        try {
          await api.planning.saveEntry(agCp, dk, fullEntry);
          // Descente de nuit auto (14/08, Olivier : "le jour suivant une nuit,
          // il faut mettre d'office la descente de nuit le lendemain [...] et
          // qu'elle puisse etre annule en solo" / "remettre ou enlever a
          // volonte") : dès qu'une nuit est enregistrée sur ce jour, on
          // pré-coche "🌙 Descente de nuit" sur le lendemain — mais UNIQUEMENT
          // si ce lendemain n'a encore AUCUNE donnée (jamais écrasé un jour
          // déjà saisi, même juste finNuit=false) — une fois posé, le toggle
          // reste entièrement sous contrôle de l'agent via le popup normal
          // (déjà éditable à volonté, aucun changement nécessaire côté
          // DayEditPopup), y compris le re-créer après l'avoir retiré.
          const aUneNuit = fullEntry.equipe==='N' || fullEntry.equipe2==='N';
          if(aUneNuit){
            const dNext = new Date(dk+'T12:00:00'); dNext.setDate(dNext.getDate()+1);
            const dkNext = `${dNext.getFullYear()}-${String(dNext.getMonth()+1).padStart(2,'0')}-${String(dNext.getDate()).padStart(2,'0')}`;
            const keyNext = agCp+'-'+dkNext;
            if(!schedule[keyNext]){
              const entreeFinNuit = {equipe:null, equipe2:null, jsCode:null, jsCode2:null, horaires:null, prive:true, finNuit:true, notePerso:null, greve:null, formation:null, impressionAt:null};
              setSchedule(prev=> prev[keyNext] ? prev : {...prev, [keyNext]: entreeFinNuit});
              // Attendu AVANT le getSchedule/reconcile ci-dessous : sinon
              // reconcileSchedule (qui supprime toute cle locale absente de
              // la reponse serveur) pourrait effacer cette entree optimiste
              // si le fetch revient avant que cette sauvegarde soit confirmee.
              try { await api.planning.saveEntry(agCp, dkNext, entreeFinNuit); }
              catch(e){ console.error('Erreur auto descente de nuit:', e); }
            }
          }
          api.planning.getSchedule(agCp).then(entries=>{if(entries)setSchedule(prev=>reconcileSchedule(prev, agCp, entries));});
        } catch(e) {
          console.error('Erreur save:', e);
          // La sauvegarde reseau a echoue : annuler l'affichage optimiste
          // (revenir a prevEntry) plutot que de laisser une case "fausse" qui
          // donne l'illusion que c'est enregistre. Bug reel constate le 04/08
          // : deux RP saisis sur telephone restes affiches (meme apres
          // rechargement complet, via le cache local) sans jamais avoir
          // atteint le serveur, decouverts seulement en comparant avec l'ordi.
          setSchedule(prev=>{
            const n={...prev};
            const hadPrev = prevEntry && (prevEntry.equipe||prevEntry.equipe2||prevEntry.finNuit||prevEntry.notePerso||prevEntry.greve||prevEntry.formation);
            if(hadPrev) n[agCp+'-'+dk]=prevEntry; else delete n[agCp+'-'+dk];
            return n;
          });
          alert("⚠️ La sauvegarde du "+dk+" n'a pas abouti (problème réseau ?). Ta saisie n'a PAS été enregistrée — la case a été remise comme avant. Réessaie dès que la connexion est meilleure.\n\nErreur : "+e.message);
        }
      }}
      onDelete={async (type)=>{
        const agCp=agent.immatriculation||agent.cp||agent.id;
        const dk=dayPopup.dk;
        const entry = schedule[agCp+'-'+dk] || {};
        setDayPopup(null);



        try {
          if(type==='journee') {
            // Garder la nuit, effacer juste la journée
            const newEntry = {...entry, equipe:null, jsCode:null, horaires:null};
            setSchedule(prev=>({...prev,[agCp+'-'+dk]:newEntry}));
            await api.planning.saveEntry(agCp, dk, newEntry);
          } else if(type==='nuit') {
            // Effacer la nuit + nettoyer le lendemain
            const newEntry = {...entry, equipe2:null, jsCode2:null};
            if(!newEntry.equipe && !newEntry.finNuit) {
              setSchedule(prev=>{const n={...prev};delete n[agCp+'-'+dk];return n;});
              await api.planning.deleteEntry(agCp, dk);
            } else {
              setSchedule(prev=>({...prev,[agCp+'-'+dk]:newEntry}));
              await api.planning.saveEntry(agCp, dk, newEntry);
            }

          } else {
            // Effacer tout
            setSchedule(prev=>{const n={...prev};delete n[agCp+'-'+dk];return n;});
            await api.planning.deleteEntry(agCp, dk);

          }
        } catch(e) {
          console.error('Erreur delete:', e);
          // Meme principe que onSave : annuler l'effacement optimiste plutot
          // que de laisser une case vide/modifiee alors que rien n'a ete
          // confirme cote serveur.
          const hadPrev = entry && (entry.equipe||entry.equipe2||entry.finNuit||entry.notePerso||entry.greve||entry.formation);
          setSchedule(prev=>{
            const n={...prev};
            if(hadPrev) n[agCp+'-'+dk]=entry; else delete n[agCp+'-'+dk];
            return n;
          });
          alert("⚠️ La suppression du "+dk+" n'a pas abouti (problème réseau ?). La case a été remise comme avant. Réessaie dès que la connexion est meilleure.\n\nErreur : "+e.message);
        }
      }}
      onClose={()=>setDayPopup(null)}
      // Congés Demandé/Refusé saisis directement depuis le popup de saisie
      // (06/08) : n'écrit jamais dans schedule, alimente le même suivi
      // congesDemandes que le popup Congés (voir CongesDashboardModal) —
      // tombstone null explicite pour "retirer" (JSON_MERGE_PATCH, comme
      // partout ailleurs sur ce champ), sauvegarde automatique via l'effet
      // générique agentProfiles déjà en place (avec alerte si échec réseau).
      onCongeStatutChange={(dk, statut, jourEtaitVide)=>{
        const todayIso = new Date().toISOString().slice(0,10);
        setAgentProfiles(prev=>{
          const curr = prev[agent.id]?.congesDemandes?.[dk];
          let next;
          if(statut==="demande"){
            next = { statut:"demande", dateDemande: curr?.dateDemande || todayIso, jourEtaitVide };
          } else if(statut==="refuse"){
            next = { statut:"refuse", dateDemande: curr?.dateDemande||null, dateRefus: todayIso, jourEtaitVide };
          } else {
            next = null;
          }
          return {...prev, [agent.id]:{...(prev[agent.id]||{}), congesDemandes:{...(prev[agent.id]?.congesDemandes||{}), [dk]: next}}};
        });
      }}
      // VT Demandé/Refusé (06/08, même mécanisme que Congés ci-dessus).
      onVtStatutChange={(dk, statut, jourEtaitVide)=>{
        const todayIso = new Date().toISOString().slice(0,10);
        setAgentProfiles(prev=>{
          const curr = prev[agent.id]?.vtTracking?.[dk];
          let next;
          if(statut==="demande"){
            next = { statut:"demande", dateDemande: curr?.dateDemande || todayIso, jourEtaitVide };
          } else if(statut==="refuse"){
            next = { statut:"refuse", dateDemande: curr?.dateDemande||null, dateRefus: todayIso, jourEtaitVide };
          } else {
            next = null;
          }
          return {...prev, [agent.id]:{...(prev[agent.id]||{}), vtTracking:{...(prev[agent.id]?.vtTracking||{}), [dk]: next}}};
        });
      }}
    />}
    {showHab&&<HabilitationsModal
      agent={agent}
      habilitations={profile.habilitations||{}}
      suggestedPostes={postesDetectes}
  onSave={hab=>{setProfile({habilitations:hab});setShowHab(false);const agCp2=agent.immatriculation||agent.cp||agent.id;api.profil.setHabilitations(agCp2,Object.entries(hab).filter(([,v])=>v==="HC").map(([c])=>({code_poste:c,date_debut:new Date().toISOString().slice(0,10)}))).then(()=>api.profil.get(agCp2).then(p=>{if(p&&p.habilitations)setProfile({habilitations:p.habilitations});})).catch(()=>{});}}
      onClose={()=>setShowHab(false)}/>}

    {showHabRoul&&<HabilitationsRoulementModal
      agent={agent}
      habilitations={profile.habilitations||{}}
      onSave={hab=>{setProfile({habilitations:hab});setShowHabRoul(false);}}
      onClose={()=>setShowHabRoul(false)}/>}
    {/* Tableau de bord compteurs */}
    {agent&&<DashboardCompteurs agent={agent} schedule={schedule} setSchedule={setSchedule} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles}
        isOwnProfile={isOwnProfile} isAdmin={isAdmin} onOpenFormation={onOpenFormation}/>}
  </div>);
}

// ─── MODULE DEMANDE DE CONGÉS ────────────────────────────────────────────────

const NATURES_ABSENCE = [
  "Congé Annuel","Congé de Maladie","Congé Maternité/Paternité",
  "Repos Compensateur","Formation","Congé Exceptionnel","Autre",
];

// Génère le HTML du formulaire SNCF pour impression/PDF
function generateFormulaireSNCF(data, agent) {
  const fmt = (d) => d ? new Date(d).toLocaleDateString("fr-FR") : "___/___/______";
  const nbJours = (d1, d2) => {
    if(!d1||!d2) return "___";
    const diff = Math.round((new Date(d2)-new Date(d1))/(1000*60*60*24))+1;
    return diff > 0 ? diff : "___";
  };
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:10px;color:#000;background:#fff}
  .page{width:210mm;min-height:297mm;padding:8mm 10mm;position:relative}
  .title{text-align:center;font-size:14px;font-weight:bold;text-decoration:underline;margin-bottom:4px}
  .subtitle{text-align:center;font-size:8px;margin-bottom:8px}
  .header-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:6px;font-size:8px}
  .border-box{border:1px solid #000;padding:3px 5px}
  .section{border:1px solid #000;margin-bottom:4px}
  .section-title{background:#000;color:#fff;font-weight:bold;font-size:9px;padding:2px 6px;text-transform:uppercase}
  .field-row{display:flex;align-items:baseline;gap:6px;padding:3px 6px;border-bottom:1px solid #ccc;font-size:9px}
  .field-row:last-child{border-bottom:none}
  .field-label{flex-shrink:0;color:#333}
  .field-value{border-bottom:1px solid #000;flex:1;min-width:60px;font-weight:bold;padding:0 2px}
  .field-value.wide{flex:2}
  .absence-grid{display:grid;grid-template-columns:auto auto auto auto 1fr;gap:4px;align-items:center;padding:4px 6px;font-size:9px}
  .stamp-zone{border:1px solid #000;min-height:40px;padding:4px;font-size:8px;color:#666;text-align:center;display:flex;align-items:center;justify-content:center}
  .signature-line{border-bottom:1px solid #000;height:30px;margin-top:4px}
  .ref{font-size:7px;color:#666}
  .demanded{background:#fff3cd;border:2px solid #f59e0b;border-radius:4px;padding:6px 10px;margin-bottom:6px;font-size:10px}
  @media print{body{margin:0}.no-print{display:none}}
</style>
</head>
<body>
<div class="page">
  <div class="ref">0.000L0503 · Fde 1 3971</div>
  <div class="title">DEMANDE D'AUTORISATION D'ABSENCE</div>
  <div class="subtitle">NOTA IMPORTANT : Le présent imprimé ne doit pas être ouvert dans le cas de congé supplémentaire sans solde<br/>Voir au verso les instructions utiles</div>

  <div class="header-grid">
    <div class="border-box">Classement : <strong>ES</strong></div>
    <div class="border-box">K &nbsp; M <sup>+</sup> 12</div>
    <div class="border-box">Nombre de points de priorité : _____<br/>Date et heure de réception : <strong>${new Date(data.datedemande||Date.now()).toLocaleDateString("fr-FR")} ${data.heuredemande||""}</strong></div>
  </div>

  <div class="section">
    <div class="section-title">DEMANDEUR</div>
    <div class="field-row">
      <span class="field-label">NOM :</span><span class="field-value">${agent?.nom||""}</span>
      <span class="field-label">PRÉNOM :</span><span class="field-value">${agent?.prenom||""}</span>
      <span class="field-label">Immatriculation S.N.C.F. :</span><span class="field-value">${data.immatriculation||""}</span>
    </div>
    <div class="field-row">
      <span class="field-label">GRADE :</span><span class="field-value">${agent?.grade||""}</span>
      <span class="field-label">Unité d'affectation :</span><span class="field-value wide">${agent?.fam||""} PMP</span>
    </div>
    <div class="field-row">
      <span class="field-label">Établissement :</span><span class="field-value wide">${data.etablissement||"Eic PSo"}</span>
    </div>
    <div style="padding:4px 6px;font-size:9px">
      <div class="field-row">
        <span class="field-label">Absence 1<sup>re</sup> du</span>
        <span class="field-value">${fmt(data.debut1)}</span>
        <span class="field-label">inclus au</span>
        <span class="field-value">${fmt(data.fin1)}</span>
        <span class="field-label">inclus, soit</span>
        <span class="field-value" style="max-width:40px">${nbJours(data.debut1,data.fin1)}</span>
        <span class="field-label">jours</span>
      </div>
      ${data.debut2?`<div class="field-row">
        <span class="field-label">Absence 2<sup>e</sup> du</span>
        <span class="field-value">${fmt(data.debut2)}</span>
        <span class="field-label">inclus au</span>
        <span class="field-value">${fmt(data.fin2)}</span>
        <span class="field-label">inclus, soit</span>
        <span class="field-value" style="max-width:40px">${nbJours(data.debut2,data.fin2)}</span>
        <span class="field-label">jours</span>
      </div>`:""}
    </div>
  </div>

  <div class="section">
    <div class="section-title">CHEF DIRECT — AVIS</div>
    <div class="field-row">
      <span class="field-label">Agent à remplacer ?</span>
      <span style="border:1px solid #000;padding:1px 6px;margin:0 4px">OUI</span>
      <span style="border:1px solid #000;padding:1px 6px">NON</span>
      <span class="field-label" style="margin-left:10px">Horaire du service à assurer :</span>
      <span class="field-value wide"></span>
    </div>
    <div class="field-row">
      <span class="field-label">Référence du Poste (n° TS) :</span>
      <span class="field-value"></span>
      <span class="field-label" style="margin-left:10px">Jours de repos :</span>
      <span class="field-value"></span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:4px 6px">
      <div class="stamp-zone">AVIS</div>
      <div class="stamp-zone">VISA</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">DÉCISION ÉTABLISSEMENT</div>
    <div style="padding:4px 6px;font-size:9px">
      <div style="display:flex;gap:10px;margin-bottom:4px">
        <label style="display:flex;align-items:center;gap:4px"><input type="checkbox"/> Absence ne pouvant être autorisée</label>
        <label style="display:flex;align-items:center;gap:4px"><input type="checkbox"/> Accordée du ___________ inclus au ___________ inclus</label>
      </div>
      <div>suivant décompte ci-dessous :</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-top:6px">
        ${["R","F","C","SS","CS",""].map(l=>`<div class="border-box" style="min-height:20px;text-align:center">${l}______J</div>`).join("")}
      </div>
    </div>
    <div style="padding:4px 6px">
      <div class="stamp-zone" style="min-height:50px">Cachet et signature de l'établissement</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">NOTIFICATION</div>
    <div style="padding:4px 6px;font-size:9px">
      Congé restant à prendre : _____ jours — Le __________ — Le chef d __________
    </div>
  </div>

  <div class="no-print" style="margin-top:10px;text-align:center">
    <button onclick="window.print()" style="background:#1e293b;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;margin-right:10px">🖨️ Imprimer / Sauvegarder PDF</button>
    <button onclick="window.close()" style="background:#f1f5f9;color:#475569;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer">Fermer</button>
  </div>
</div>
</body>
</html>`;
}

// Composant formulaire demande de congés
function DemandeCongesModal({agent, onClose, onSubmit}) {
  const [form, setForm] = useState({
    immatriculation: "", etablissement: "Eic PSo",
    debut1: "", fin1: "", debut2: "", fin2: "",
    nature: "Congé Annuel", motif: "",
    mailChef: "", datedemande: new Date().toISOString().slice(0,10),
    heuredemande: new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}),
  });
  const [step, setStep] = useState("form"); // "form" | "preview" | "sent"
  const fam = FAM[agent?.fam];

  const nbJours = (d1, d2) => {
    if(!d1||!d2) return 0;
    return Math.round((new Date(d2)-new Date(d1))/(1000*60*60*24))+1;
  };
  const total = nbJours(form.debut1,form.fin1) + nbJours(form.debut2,form.fin2);

  const openPDF = () => {
    const html = generateFormulaireSNCF(form, agent);
    const w = window.open("","_blank","width=900,height=700");
    w.document.write(html);
    w.document.close();
  };

  const sendMail = () => {
    const sujet = encodeURIComponent(`Demande d'absence - ${agent?.prenom} ${agent?.nom} - du ${form.debut1} au ${form.fin1}`);
    const corps = encodeURIComponent(
`Bonjour,

Je vous adresse ma demande d'autorisation d'absence.

Agent : ${agent?.prenom} ${agent?.nom}
Grade : ${agent?.grade}
Unité : ${agent?.fam} PMP

Absence du ${form.debut1} au ${form.fin1} inclus (${nbJours(form.debut1,form.fin1)} jours)
${form.debut2?`Absence du ${form.debut2} au ${form.fin2} inclus (${nbJours(form.debut2,form.fin2)} jours)`:""}
Nature : ${form.nature}
${form.motif?`Motif : ${form.motif}`:""}

Total : ${total} jour(s)

Cordialement,
${agent?.prenom} ${agent?.nom}`
    );
    window.open(`mailto:${form.mailChef}?subject=${sujet}&body=${corps}`);
  };

  const confirmer = () => {
    // Stockage JSON uniquement — pas de fichier PDF (généré à la volée)
    // Taille estimée par demande : ~300 octets JSON
    onSubmit({
      id: Date.now().toString(),
      debut1: form.debut1, fin1: form.fin1,
      debut2: form.debut2 || null, fin2: form.fin2 || null,
      nb_jours: total,
      nature: form.nature, statut: "DEMANDE",
      datedemande: form.datedemande,
      motif: form.motif || null,
      // mailChef utilisé uniquement pour mailto: — jamais stocké
    });
    setStep("sent");
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.7)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:12,backdropFilter:"blur(4px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:540,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,.3)",overflow:"hidden"}}>
        {/* Header */}
        <div style={{background:`linear-gradient(135deg,${fam?.color||"#1e293b"},#334155)`,padding:"16px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <div style={{fontSize:24}}>📋</div>
          <div style={{flex:1}}>
            <div style={{color:"#fff",fontSize:14,fontWeight:800}}>Demande d'Autorisation d'Absence</div>
            <div style={{color:"rgba(255,255,255,.6)",fontSize:11}}>{agent?.prenom} {agent?.nom} · {agent?.grade}</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:8,width:28,height:28,cursor:"pointer",fontSize:14}}>✕</button>
        </div>

        {step==="form" && (
          <div style={{overflowY:"auto",flex:1,padding:18,display:"flex",flexDirection:"column",gap:14}}>
            {/* Ref SNCF */}
            <div style={{background:"#f8fafc",borderRadius:10,padding:"8px 12px",fontSize:10,color:"#64748b",display:"flex",justifyContent:"space-between"}}>
              <span>Formulaire 0.000L0503 · Fde 1 3971</span>
              <span>Classement ES · K · M<sup>+</sup>12</span>
            </div>

            {/* Infos agent */}
            <div style={{background:"#eff6ff",borderRadius:10,padding:"10px 14px",fontSize:12}}>
              <div style={{fontWeight:700,color:"#1e40af",marginBottom:4}}>Informations agent</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                <div><span style={{color:"#64748b"}}>Nom : </span><strong>{agent?.nom}</strong></div>
                <div><span style={{color:"#64748b"}}>Prénom : </span><strong>{agent?.prenom}</strong></div>
                <div><span style={{color:"#64748b"}}>Grade : </span><strong>{agent?.grade}</strong></div>
                <div><span style={{color:"#64748b"}}>Unité : </span><strong>{agent?.fam} PMP</strong></div>
              </div>
            </div>

            {/* Immatriculation */}
            <div>
              <label style={{fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>IMMATRICULATION S.N.C.F.</label>
              <input value={form.immatriculation} onChange={e=>setForm(p=>({...p,immatriculation:e.target.value}))}
                placeholder="Ex: 168401861B"
                style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            </div>

            {/* Nature */}
            <div>
              <label style={{fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>NATURE DE L'ABSENCE</label>
              <select value={form.nature} onChange={e=>setForm(p=>({...p,nature:e.target.value}))}
                style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13,outline:"none"}}>
                {NATURES_ABSENCE.map(n=><option key={n}>{n}</option>)}
              </select>
            </div>

            {/* Période 1 */}
            <div style={{background:"#fff7ed",borderRadius:10,padding:"12px 14px",border:"1px solid #fed7aa"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#c2410c",marginBottom:8}}>1ère PÉRIODE D'ABSENCE</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div>
                  <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:3}}>Du (inclus)</label>
                  <div style={{display:"flex",gap:4}}>
                    <input type="date" value={form.debut1} onChange={e=>setForm(p=>({...p,debut1:e.target.value}))}
                      style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 8px",fontSize:13,outline:"none"}}/>
                    {/* Effacer explicite : le picker natif iOS n'a pas de bouton pour revenir a vide */}
                    {form.debut1&&<button type="button" onClick={()=>setForm(p=>({...p,debut1:""}))} title="Effacer"
                      style={{border:"1.5px solid #e2e8f0",borderRadius:8,background:"#f8fafc",color:"#64748b",cursor:"pointer",padding:"0 8px",fontSize:13,flexShrink:0}}>×</button>}
                  </div>
                </div>
                <div>
                  <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:3}}>Au (inclus)</label>
                  <div style={{display:"flex",gap:4}}>
                    <input type="date" value={form.fin1} onChange={e=>setForm(p=>({...p,fin1:e.target.value}))}
                      style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 8px",fontSize:13,outline:"none"}}/>
                    {form.fin1&&<button type="button" onClick={()=>setForm(p=>({...p,fin1:""}))} title="Effacer"
                      style={{border:"1.5px solid #e2e8f0",borderRadius:8,background:"#f8fafc",color:"#64748b",cursor:"pointer",padding:"0 8px",fontSize:13,flexShrink:0}}>×</button>}
                  </div>
                </div>
              </div>
              {form.debut1&&form.fin1&&<div style={{marginTop:8,fontSize:12,color:"#c2410c",fontWeight:700,textAlign:"center"}}>
                → {nbJours(form.debut1,form.fin1)} jour(s)
              </div>}
            </div>

            {/* Période 2 (optionnelle) */}
            <details>
              <summary style={{fontSize:11,color:"#64748b",cursor:"pointer",userSelect:"none",listStyle:"none",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:10,background:"#f1f5f9",borderRadius:6,padding:"2px 8px",fontWeight:700}}>+ 2ème période (optionnel)</span>
              </summary>
              <div style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",border:"1px solid #e2e8f0",marginTop:6}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div>
                    <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:3}}>Du (inclus)</label>
                    <div style={{display:"flex",gap:4}}>
                      <input type="date" value={form.debut2} onChange={e=>setForm(p=>({...p,debut2:e.target.value}))}
                        style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 8px",fontSize:13,outline:"none"}}/>
                      {form.debut2&&<button type="button" onClick={()=>setForm(p=>({...p,debut2:""}))} title="Effacer"
                        style={{border:"1.5px solid #e2e8f0",borderRadius:8,background:"#fff",color:"#64748b",cursor:"pointer",padding:"0 8px",fontSize:13,flexShrink:0}}>×</button>}
                    </div>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:3}}>Au (inclus)</label>
                    <div style={{display:"flex",gap:4}}>
                      <input type="date" value={form.fin2} onChange={e=>setForm(p=>({...p,fin2:e.target.value}))}
                        style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 8px",fontSize:13,outline:"none"}}/>
                      {form.fin2&&<button type="button" onClick={()=>setForm(p=>({...p,fin2:""}))} title="Effacer"
                        style={{border:"1.5px solid #e2e8f0",borderRadius:8,background:"#fff",color:"#64748b",cursor:"pointer",padding:"0 8px",fontSize:13,flexShrink:0}}>×</button>}
                    </div>
                  </div>
                </div>
              </div>
            </details>

            {/* Motif */}
            <div>
              <label style={{fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>MOTIF (optionnel)</label>
              <textarea value={form.motif} onChange={e=>setForm(p=>({...p,motif:e.target.value}))}
                placeholder="Précisions éventuelles…" rows={2}
                style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13,outline:"none",resize:"vertical",boxSizing:"border-box"}}/>
            </div>

            {/* Mail chef */}
            <div>
              <label style={{fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>EMAIL DU CHEF DIRECT</label>
              <input type="email" value={form.mailChef} onChange={e=>setForm(p=>({...p,mailChef:e.target.value}))}
                placeholder="chef.direct@sncf.fr"
                style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            </div>

            {/* Résumé */}
            {form.debut1&&form.fin1&&<div style={{background:"#fef3c7",borderRadius:10,padding:"10px 14px",border:"1px solid #fde68a",fontSize:12,color:"#92400e"}}>
              <strong>Résumé :</strong> {agent?.prenom} {agent?.nom} · {form.nature}<br/>
              Du <strong>{new Date(form.debut1).toLocaleDateString("fr-FR")}</strong> au <strong>{new Date(form.fin1).toLocaleDateString("fr-FR")}</strong> · <strong>{total} jour(s)</strong> au total
            </div>}

            {/* Actions */}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={openPDF} disabled={!form.debut1||!form.fin1}
                style={{background:form.debut1&&form.fin1?"#1e3a8a":"#e2e8f0",color:form.debut1&&form.fin1?"#fff":"#94a3b8",border:"none",borderRadius:10,padding:"11px 0",cursor:form.debut1&&form.fin1?"pointer":"not-allowed",fontSize:13,fontWeight:700}}>
                🖨️ Voir / Imprimer le formulaire SNCF
              </button>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <button onClick={sendMail} disabled={!form.debut1||!form.fin1||!form.mailChef}
                  style={{background:form.debut1&&form.fin1&&form.mailChef?"#0891b2":"#e2e8f0",color:form.debut1&&form.fin1&&form.mailChef?"#fff":"#94a3b8",border:"none",borderRadius:10,padding:"10px 0",cursor:"pointer",fontSize:12,fontWeight:700}}>
                  ✉️ Envoyer par mail
                </button>
                <button onClick={confirmer} disabled={!form.debut1||!form.fin1}
                  style={{background:form.debut1&&form.fin1?"#ea580c":"#e2e8f0",color:form.debut1&&form.fin1?"#fff":"#94a3b8",border:"none",borderRadius:10,padding:"10px 0",cursor:"pointer",fontSize:12,fontWeight:700}}>
                  📅 Mettre à jour l'agenda
                </button>
              </div>
            </div>
          </div>
        )}

        {step==="sent" && (
          <div style={{flex:1,padding:24,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,textAlign:"center"}}>
            <div style={{fontSize:48}}>✅</div>
            <div style={{fontSize:16,fontWeight:800,color:"#1e293b"}}>Demande enregistrée</div>
            <div style={{fontSize:13,color:"#64748b",lineHeight:1.6}}>
              Ton agenda a été mis à jour.<br/>
              Un <strong style={{color:"#ea580c"}}>bandeau orange</strong> "Congé demandé" apparaît<br/>sur les jours concernés.
            </div>
            <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:12,padding:"12px 16px",fontSize:12,color:"#c2410c",fontWeight:600}}>
              📋 En attente de validation par le chef direct
            </div>
            <div style={{display:"flex",gap:8,width:"100%"}}>
              <button onClick={openPDF} style={{flex:1,background:"#1e3a8a",color:"#fff",border:"none",borderRadius:10,padding:"10px 0",cursor:"pointer",fontSize:12,fontWeight:700}}>🖨️ PDF SNCF</button>
              <button onClick={onClose} style={{flex:1,background:"#f1f5f9",color:"#475569",border:"none",borderRadius:10,padding:"10px 0",cursor:"pointer",fontSize:12,fontWeight:700}}>Fermer</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Génère la Notification de Décision SNCF (format officiel après accord)
function generateNotificationAccord(demande, agent, accord) {
  const fmt = (d) => d ? new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";
  const fmtH = (d, h) => d ? `${fmt(d)} ${h||"00:00"}` : "—";
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11px;color:#000;background:#fff}
  .page{width:210mm;min-height:120mm;padding:12mm 14mm}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
  .date{font-size:10px;color:#333}
  .title{font-size:13px;font-weight:bold;text-transform:uppercase;text-align:center;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:12px}
  .ref{font-size:10px;color:#666;margin-bottom:10px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #000}
  .cell{padding:5px 8px;border-right:1px solid #000;border-bottom:1px solid #000;font-size:10px}
  .cell:nth-child(2n){border-right:none}
  .cell:last-child,.cell:nth-last-child(2){border-bottom:none}
  .label{font-weight:bold;font-size:9px;color:#444;display:block;margin-bottom:2px}
  .section-title{background:#1e3a8a;color:#fff;font-weight:bold;font-size:10px;padding:4px 8px;margin:10px 0 0}
  .decision{font-size:16px;font-weight:bold;text-align:center;padding:8px;border:2px solid #000;margin-top:10px;letter-spacing:2px}
  .footer{font-size:8px;color:#666;text-align:center;margin-top:16px;border-top:1px solid #ccc;padding-top:6px}
  .no-print{margin-top:10px;text-align:center}
  @media print{.no-print{display:none}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div style="font-size:9px;color:#666">475335</div>
      <div style="font-size:10px">${new Date(accord.dateAccord||Date.now()).toLocaleDateString("fr-FR")}</div>
    </div>
    <div class="title" style="flex:1;margin:0 20px">NOTIFICATION DE DEMANDE D'ABSENCE</div>
    <div style="width:60px"></div>
  </div>

  <div class="section-title">DEMANDEUR</div>
  <div class="grid">
    <div class="cell"><span class="label">Nom :</span>${agent?.nom||""} ${agent?.prenom||""} ${agent?.immatriculation||""}</div>
    <div class="cell"><span class="label">Grade :</span>${agent?.grade||""}</div>
    <div class="cell"><span class="label">UOP :</span>${agent?.fam||""} PMP — 674903 PRCI</div>
    <div class="cell"><span class="label">Établissement :</span>EIC PARIS SUD OUEST</div>
  </div>

  <div class="section-title">PÉRIODE</div>
  <div class="grid">
    <div class="cell"><span class="label">Du :</span>${fmtH(demande?.debut1,"00:00")}</div>
    <div class="cell"><span class="label">Au :</span>${fmtH(demande?.fin1,"24:00")}</div>
    <div class="cell"><span class="label">Déposée le :</span>${fmt(demande?.datedemande)}</div>
    <div class="cell"><span class="label">Nature :</span>${demande?.nature||"Congé annuel"}</div>
  </div>

  <div class="section-title">DÉCOMPTE</div>
  <div class="grid">
    <div class="cell"><span class="label">Nature :</span>${demande?.nature||"Congé annuel"}</div>
    <div class="cell"><span class="label">Durée :</span>${demande?.nb_jours||"—"} jour(s)</div>
    <div class="cell" style="grid-column:span 2"><span class="label">Solde / Unité SNCF :</span></div>
  </div>

  <div class="decision">DÉCISION : ${accord.accorde?"ACCORDÉE":"REFUSÉE"}</div>

  <div class="footer">SOCIÉTÉ NATIONALE DES CHEMINS DE FER FRANÇAIS — Page : 1</div>

  <div class="no-print" style="margin-top:12px;text-align:center">
    <button onclick="window.print()" style="background:#1e3a8a;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;margin-right:8px">🖨️ Imprimer / PDF</button>
    <button onclick="window.close()" style="background:#f1f5f9;color:#475569;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer">Fermer</button>
  </div>
</div>
</body>
</html>`;
}

// Composant pour importer l'accord de congés (photo/PDF)
function AccordCongesModal({agent, demande, onClose, onAccord}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = async(e) => {
    const file = e.target.files[0]; if(!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async() => {
      const b64 = reader.result.split(",")[1];
      const mt = file.type === "application/pdf" ? "application/pdf" : file.type;
      try {
        const res = await fetch("/api/claude", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            model:"claude-sonnet-4-20250514", max_tokens:500,
            messages:[{role:"user",content:[
              {type:"document",source:{type:"base64",media_type:mt,data:b64}},
              {type:"text",text:`Tu analyses une Notification de Décision SNCF pour ${agent?.prenom} ${agent?.nom}.
Ce document est soit une "NOTIFICATION DE DEMANDE D'ABSENCE" accordée/refusée, soit une "DEMANDE D'AUTORISATION D'ABSENCE" avec décision.

Extrais TOUTES les informations. Retourne UNIQUEMENT un JSON valide sans markdown :
{
  "accorde": true,
  "debut": "YYYY-MM-DD",
  "fin": "YYYY-MM-DD",
  "dateAccord": "YYYY-MM-DD",
  "nb_jours_total": 8,
  "decompte": {
    "CA": 5,
    "RP": 2,
    "F": 0,
    "C": 1,
    "SS": 0,
    "CS": 0,
    "RU": 0
  },
  "periodes_completes": true,
  "note": "Congé annuel + Repos périodique"
}
Règles :
- "periodes_completes" = true si la période accordée correspond exactement à la période demandée par l'agent (${agent?.prenom} ${agent?.nom}).
- Décompte : CA=Congés (Congé Annuel), RP=Repos Périodique, F=Fête, C=Compensateur, SS=Sans Solde, CS=Congé Spécial, RU=Repos Utilisation.
- Si refusé : {"accorde":false,"motif":"...","dateAccord":"YYYY-MM-DD"}`}
            ]}]
          })
        });
        const data = await res.json();
        const raw = data.content?.map(c=>c.text||"").join("")||"";
        const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
        setResult(parsed);
      } catch(e) { setResult({error: e.message}); }

    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.7)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:12,backdropFilter:"blur(4px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:420,boxShadow:"0 24px 60px rgba(0,0,0,.3)",overflow:"hidden"}}>
        <div style={{background:"linear-gradient(135deg,#16a34a,#14532d)",padding:"16px 20px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:22}}>✅</div>
          <div style={{flex:1}}>
            <div style={{color:"#fff",fontSize:14,fontWeight:800}}>Importer l'accord de congés</div>
            <div style={{color:"rgba(255,255,255,.6)",fontSize:11}}>{agent?.prenom} {agent?.nom}</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:8,width:28,height:28,cursor:"pointer",fontSize:14}}>✕</button>
        </div>
        <div style={{padding:18,display:"flex",flexDirection:"column",gap:14}}>
          {!result&&!loading&&<>
            <p style={{fontSize:13,color:"#475569",margin:0}}>
              Upload la photo ou le PDF de l'accord signé. L'IA va lire la décision et mettre à jour ton agenda.
            </p>
            <label style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,border:"2px dashed #86efac",borderRadius:14,padding:"20px",cursor:"pointer",background:"#f0fdf4"}}>
              <span style={{fontSize:28}}>📸</span>
              <span style={{fontSize:12,fontWeight:600,color:"#16a34a"}}>Photo ou PDF de l'accord</span>
              <input type="file" accept="image/*,.pdf" capture="environment" style={{display:"none"}} onChange={handleFile}/>
            </label>
          </>}
          {loading&&<div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{width:40,height:40,border:"4px solid #e2e8f0",borderTopColor:"#16a34a",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 12px"}}/>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{fontSize:13,color:"#64748b"}}>Analyse du document…</div>
          </div>}
          {result&&!result.error&&(()=>{
            // Vérifier si la période accordée correspond à la période demandée
            const periodeOK = result.periodes_completes !== false &&
              (!demande?.debut1 || result.debut === demande.debut1) &&
              (!demande?.fin1   || result.fin   === demande.fin1);
            const decompte = result.decompte || {};
            const typeLabels = {CA:"Congés",RP:"Repos Périodique",F:"Fête",C:"Compensateur",SS:"Sans Solde",CS:"Congé Spécial",RU:"Repos Utilisation"};
            return <>
              {/* Alerte si période partielle */}
              {result.accorde && !periodeOK && <div style={{background:"#fef3c7",borderRadius:10,padding:"10px 14px",border:"1.5px solid #fde68a",fontSize:12,color:"#92400e",marginBottom:8}}>
                ⚠️ <strong>Attention :</strong> la période accordée ({result.debut} → {result.fin}) ne correspond pas exactement à la demande initiale ({demande?.debut1} → {demande?.fin1}). Vérifie avant de confirmer.
              </div>}

              {/* Résultat principal */}
              <div style={{background:result.accorde?"#d1fae5":"#fee2e2",borderRadius:10,padding:"12px 14px",border:`1.5px solid ${result.accorde?"#6ee7b7":"#fca5a5"}`}}>
                <div style={{fontSize:13,fontWeight:800,color:result.accorde?"#065f46":"#991b1b",marginBottom:8}}>
                  {result.accorde?"✅ Congé ACCORDÉ":"❌ Congé REFUSÉ"}
                  {result.accorde&&periodeOK&&<span style={{fontSize:10,background:"#bbf7d0",borderRadius:8,padding:"1px 8px",marginLeft:8}}>✓ Période complète</span>}
                </div>
                {result.accorde?<>
                  <div style={{fontSize:12,color:"#065f46",marginBottom:4}}>
                    Du <strong>{result.debut&&new Date(result.debut).toLocaleDateString("fr-FR")}</strong> au <strong>{result.fin&&new Date(result.fin).toLocaleDateString("fr-FR")}</strong>
                  </div>
                  <div style={{fontSize:12,color:"#065f46",marginBottom:8}}>
                    Accordé le <strong>{result.dateAccord&&new Date(result.dateAccord).toLocaleDateString("fr-FR")}</strong> · <strong>{result.nb_jours_total||result.nb_jours}</strong> jour(s)
                  </div>
                  {/* Décompte détaillé */}
                  {Object.keys(decompte).filter(k=>decompte[k]>0).length>0&&(
                    <div style={{background:"rgba(255,255,255,.6)",borderRadius:8,padding:"8px 10px"}}>
                      <div style={{fontSize:10,fontWeight:800,color:"#065f46",marginBottom:5,letterSpacing:.5}}>DÉCOMPTE PAR TYPE</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                        {Object.entries(decompte).filter(([,v])=>v>0).map(([k,v])=>(
                          <span key={k} style={{fontSize:10,background:"#fff",border:"1px solid #6ee7b7",borderRadius:8,padding:"2px 8px",fontWeight:700,color:"#065f46"}}>
                            {typeLabels[k]||k} : <strong>{v}j</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>:<div style={{fontSize:12,color:"#991b1b"}}>Motif : {result.motif}</div>}
              </div>

              {/* Actions */}
              <div style={{display:"flex",gap:8,flexDirection:"column"}}>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{onAccord({...result,decompte,periodeOK});onClose();}}
                    style={{flex:1,background:result.accorde?"#16a34a":"#dc2626",color:"#fff",border:"none",borderRadius:10,padding:"11px 0",cursor:"pointer",fontSize:13,fontWeight:700}}>
                    {result.accorde?"✓ Mettre à jour l'agenda":"✓ Marquer comme refusé"}
                  </button>
                  <button onClick={()=>setResult(null)} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:10,padding:"11px 12px",cursor:"pointer",fontSize:12}}>↺</button>
                </div>
                {result.accorde&&<button onClick={()=>{
                  const html=generateNotificationAccord(demande,agent,result);
                  const w=window.open("","_blank","width=800,height=600");
                  w.document.write(html);w.document.close();
                }} style={{background:"#1e3a8a",color:"#fff",border:"none",borderRadius:10,padding:"10px 0",cursor:"pointer",fontSize:12,fontWeight:700}}>
                  🖨️ Notification officielle SNCF
                </button>}
              </div>
            </>;
          })()}
          {result?.error&&<div style={{background:"#fee2e2",borderRadius:10,padding:12,fontSize:12,color:"#991b1b"}}>
            Erreur : {result.error}<br/>
            <button onClick={()=>setResult(null)} style={{marginTop:8,background:"#fff",border:"1px solid #fca5a5",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11}}>Réessayer</button>
          </div>}
        </div>
      </div>
    </div>
  );
}

// ─── ÉCHANGES ─────────────────────────────────────────────────────────────────

function EchangesView({agents,currentAgent}){
  const [echanges,setEchanges]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [form,setForm]=useState({date:"",creneaux:[],urgent:false,motif:""});
  const [cloturantId,setCloturantId]=useState(null);
  const [cloturantCp,setCloturantCp]=useState("");

  const CRENEAUX=[["matin","Matin"],["journee","Journée"],["soiree","Soirée"],["nuit","Nuit"],["indifferent","Indifférent"]];

  const charger=useCallback(()=>{
    api.echanges.getAll().then(rows=>{setEchanges(rows||[]);setLoading(false);}).catch(()=>setLoading(false));
  },[]);

  useEffect(()=>{
    charger();
    const idInterval=setInterval(charger,45000);
    return ()=>clearInterval(idInterval);
  },[charger]);

  if(!currentAgent)return(<div style={{textAlign:"center",padding:"62px 22px",color:"#94a3b8"}}><div style={{fontSize:42,marginBottom:12}}>🔄</div><div style={{fontSize:17,fontWeight:600,color:"#475569"}}>Sélectionne ton profil</div></div>);

  const toggleVal=(arr,v)=>arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];

  const resetForm=()=>{setForm({date:"",creneaux:[],urgent:false,motif:""});setEditingId(null);setShowForm(false);};

  const soumettre=async()=>{
    if(!form.date){alert("Choisis une date.");return;}
    try{
      if(editingId){
        await api.echanges.update(editingId,{date_jour:form.date,creneaux_souhaites:form.creneaux,urgent:form.urgent,motif:form.motif||null});
      }else{
        await api.echanges.create({date_jour:form.date,creneaux_souhaites:form.creneaux,urgent:form.urgent,motif:form.motif||null});
      }
      resetForm();
      charger();
    }catch(e){alert(e.message||"Erreur lors de l'enregistrement.");}
  };

  const ouvrirEdition=(e)=>{
    setEditingId(e.id);
    const d=(e.date_jour||"").split("T")[0];
    setForm({date:d,creneaux:(e.creneaux_souhaites||"").split(",").filter(Boolean),urgent:!!e.urgent,motif:e.motif||""});
    setShowForm(true);
  };

  const interesser=async(id)=>{
    try{await api.echanges.toggleInteret(id);charger();}catch(e){alert(e.message||"Erreur.");}
  };

  const supprimer=async(id)=>{
    if(!window.confirm("Supprimer cette demande d'échange ?"))return;
    try{await api.echanges.delete(id);charger();}catch(e){alert(e.message||"Erreur.");}
  };

  // 24/08 (demande d'Olivier : "que les echanges de journee se note
  // automatiquement dans le planning cps") : si la demande porte assez
  // d'info pour retrouver le code CPS exact (code_equipe/famille -- absents
  // sur une demande deja ouverte avant ce correctif), la cloture ecrit
  // automatiquement l'echange dans CPS Officiel (meme mecanisme qu'un
  // echange signale a la main, meme bouton d'annulation ✕ ouvert a
  // n'importe quel agent connecte -- pas seulement demandeur/accepteur).
  // Sinon (vieille demande), on retombe sur l'ancien pense-bete manuel --
  // jamais bloquant, la cloture elle-meme reste toujours possible.
  const cloturer=async(id)=>{
    if(!cloturantCp){alert("Choisis avec qui tu as échangé.");return;}
    const echange=echanges.find(e=>e.id===id);
    // resolveJsCode (24/08, cas reel signale par Olivier : "message trop
    // ancienne" affiche a tort sur une demande flambant neuve) -- un jour
    // capture depuis un planning importe via "declare previsionnel" a deja
    // son code_poste au format canonique ("PICCLO") plutot que le code court
    // local ("CCL") attendu par convertirCodePosteVersJsCode seule -- garde
    // ce cas en plus du cas normal, jamais l'inverse.
    const jsCode=echange&&echange.code_equipe
      ? resolveJsCode(echange.code_poste,echange.code_equipe)
      : null;
    // familleReelle (24/08, cas reel trouve en testant) : la famille du
    // POSTE lui-meme (via POSTE_REGISTRY, deja construit ailleurs dans ce
    // fichier -- non ambigue pour un poste fixe, ex: PICCLO est forcement
    // PRCI) prime sur celle du DEMANDEUR capturee a la creation, qui peut
    // diverger (postes generiques multi-familles, renfort occasionnel...).
    // Sans ca, l'alea aurait pu se creer avec la mauvaise famille et ne
    // jamais s'afficher sur le bon poste dans CPS Officiel.
    const familleReelle=(jsCode&&POSTE_REGISTRY[jsCode]?.famille)||(echange&&echange.famille)||null;
    // Cote reciproque (24/08, signale par Olivier : "si on echange nos
    // journee il faut le message pour les 2 postes echanges [...] celui qui
    // accepte de faire la matinee laisse sa place a l'autre pour faire sa
    // soiree sinon il y a un poste non couvert") -- un vrai echange est un
    // troc : si cloturantCp (celui avec qui l'echange a eu lieu) avait
    // lui-meme un poste ce jour-la, ce poste doit aussi basculer vers le
    // demandeur, sinon il reste affiche comme "couvert par cloturantCp" alors
    // qu'il n'y est plus. Recherche best-effort (jamais bloquant).
    let jsCode2=null, familleReelle2=null;
    try{
      const jourReciproque=await api.echanges.posteDuJour(cloturantCp,echange.date_jour);
      if(jourReciproque&&jourReciproque.code_equipe){
        jsCode2=resolveJsCode(jourReciproque.code_poste,jourReciproque.code_equipe);
        familleReelle2=(jsCode2&&POSTE_REGISTRY[jsCode2]?.famille)||null;
      }
    }catch(e){/* best-effort, la cloture reste possible sans */}
    const auto=!!(jsCode&&familleReelle);
    const auto2=!!(jsCode2&&familleReelle2&&jsCode2!==jsCode);
    const message=auto&&auto2
      ? "L'échange sera noté automatiquement dans le planning CPS Officiel pour LES DEUX postes échangés (le tien et celui de l'agent avec qui tu as échangé) -- comme un échange signalé à la main, annulable par n'importe qui.\n\nConfirmer la clôture ?"
      : auto
      ? "L'échange sera noté automatiquement dans le planning CPS Officiel (comme un échange signalé à la main, annulable par n'importe qui).\n\nConfirmer la clôture ?"
      : "Cette demande ne peut pas être notée automatiquement dans CPS Officiel (poste non reconnu ou demande trop ancienne) -- n'oublie pas de l'indiquer toi-même.\n\nConfirmer la clôture ?";
    if(!window.confirm(message))return;
    try{await api.echanges.cloturer(id,cloturantCp,jsCode,familleReelle,auto2?jsCode2:null,auto2?familleReelle2:null);setCloturantId(null);setCloturantCp("");charger();}catch(e){alert(e.message||"Erreur.");}
  };

  const STATUT_STYLE={
    ouverte_urgent:{border:"#fca5a5",bg:"#fee2e2",tc:"#991b1b",label:"urgent"},
    ouverte:{border:"#fdba74",bg:"#fef3c7",tc:"#92400e",label:"ouverte"},
    cloturee:{border:"#86efac",bg:"#d1fae5",tc:"#065f46",label:"clôturée"},
    expiree:{border:"#e2e8f0",bg:"#f1f5f9",tc:"#94a3b8",label:"expirée"},
  };
  const styleFor=e=>e.statut==="ouverte"?(e.urgent?STATUT_STYLE.ouverte_urgent:STATUT_STYLE.ouverte):(STATUT_STYLE[e.statut]||STATUT_STYLE.expiree);

  const mesDemandes=echanges.filter(e=>e.cp_demandeur===currentAgent.id);
  const autresDemandes=echanges.filter(e=>e.cp_demandeur!==currentAgent.id);
  const listeAffichee=[...mesDemandes,...autresDemandes];

  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{fontSize:18,fontWeight:700,color:"#1e293b"}}>🔄 Échanges</div>
      <button onClick={()=>{resetForm();setShowForm(true);}} style={{background:"#1e293b",color:"#fff",border:"none",borderRadius:12,padding:"12px 20px",cursor:"pointer",fontSize:15,fontWeight:700}}>+ Nouvelle demande</button>
    </div>

    {showForm&&(<div style={{background:"#f8fafc",borderRadius:12,padding:"18px 20px",border:"1.5px solid #e2e8f0",display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:15,fontWeight:700,color:"#1e293b"}}>{editingId?"Modifier la demande":"Nouvelle demande d'échange"}</div>

      <div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:4}}>Journée à échanger</div>
        <div style={{display:"flex",gap:6}}>
          <input type="date" value={form.date} onChange={ev=>setForm(p=>({...p,date:ev.target.value}))} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:15,outline:"none"}}/>
          {form.date&&<button type="button" onClick={()=>setForm(p=>({...p,date:""}))} title="Effacer"
            style={{border:"1.5px solid #e2e8f0",borderRadius:8,background:"#f8fafc",color:"#64748b",cursor:"pointer",padding:"0 12px",fontSize:14}}>×</button>}
        </div>
      </div>

      <div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:6}}>Créneau recherché</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {CRENEAUX.map(c=>{const v=c[0],l=c[1];const actif=form.creneaux.includes(v);return(<button key={v} onClick={()=>setForm(p=>({...p,creneaux:toggleVal(p.creneaux,v)}))} style={{border:"1.5px solid "+(actif?"#1e293b":"#e2e8f0"),background:actif?"#1e293b":"#fff",color:actif?"#fff":"#475569",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:14,fontWeight:600}}>{l}</button>);})}
        </div>
      </div>

      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:15,color:"#475569",cursor:"pointer"}}>
        <input type="checkbox" checked={form.urgent} onChange={ev=>setForm(p=>({...p,urgent:ev.target.checked}))}/>
        Urgent (garde d'enfant, médical...)
      </label>

      <input value={form.motif} onChange={ev=>setForm(p=>({...p,motif:ev.target.value}))} placeholder="Motif (facultatif, visible par tous)" style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:15,outline:"none"}}/>

      <div style={{display:"flex",gap:8}}>
        <button onClick={soumettre} style={{flex:1,background:"#1e293b",color:"#fff",border:"none",borderRadius:9,padding:"9px 0",cursor:"pointer",fontSize:15,fontWeight:700}}>{editingId?"Enregistrer":"Publier la demande"}</button>
        <button onClick={resetForm} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:9,padding:"11px 14px",cursor:"pointer",fontSize:15}}>Annuler</button>
      </div>
    </div>)}

    {loading&&<div style={{textAlign:"center",padding:"32px 22px",color:"#94a3b8",fontSize:15}}>Chargement…</div>}
    {!loading&&listeAffichee.length===0&&<div style={{textAlign:"center",padding:"32px 22px",color:"#94a3b8",fontSize:15}}>Aucune demande en cours.</div>}

    {listeAffichee.map(e=>{
      const s=styleFor(e);
      const estDemandeur=e.cp_demandeur===currentAgent.id;
      const creneaux=(e.creneaux_souhaites||"").split(",").filter(Boolean);
            const dateAff=(e.date_jour||"").split("T")[0];
      const horaireTxt=e.heure_debut?(" · "+String(e.heure_debut).slice(0,5)+"–"+String(e.heure_fin||"").slice(0,5)):"";
      const rechercheTxt=creneaux.length?creneaux.join(", "):"indifférent";
            return(<div key={e.id} style={{background:"#fff",border:"1.5px solid "+s.border,borderRadius:12,padding:"15px 17px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Av initials={(e.prenom?e.prenom[0]:"")+(e.nom?e.nom[0]:"")} size={30}/>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{e.prenom} {e.nom}{estDemandeur?" (toi)":""}</div>
              <div style={{fontSize:12,color:"#94a3b8"}}>{dateAff}</div>
            </div>
          </div>
          <span style={{fontSize:12,background:s.bg,color:s.tc,borderRadius:10,padding:"5px 11px",fontWeight:700,textTransform:"uppercase"}}>{s.label}</span>
        </div>

        {e.statut==="ouverte"&&<div style={{fontSize:14,color:"#475569",marginBottom:6}}><b>{e.poste_label||e.code_poste||"Poste"}</b>{horaireTxt} → recherche {rechercheTxt}</div>}

        {e.statut==="cloturee"&&<div style={{fontSize:14,color:"#475569",marginBottom:6}}>Échangé avec <b>{e.echange_avec_prenom} {e.echange_avec_nom}</b></div>}

        {e.motif&&<div style={{fontSize:13,color:"#64748b",marginBottom:8,fontStyle:"italic"}}>"{e.motif}"</div>}

        {e.statut==="ouverte"&&<div style={{fontSize:13,color:"#94a3b8",marginBottom:8}}>{e.nb_interets>0?("Intéressé(s) : "+e.interesses_noms):"Aucun intéressé"}</div>}

        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {!estDemandeur&&e.statut==="ouverte"&&<button onClick={()=>interesser(e.id)} style={{border:"1.5px solid "+(e.mon_interet?"#1e293b":"#e2e8f0"),background:e.mon_interet?"#1e293b":"#f8fafc",color:e.mon_interet?"#fff":"#475569",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>{e.mon_interet?"✅ Intéressé":"🤝 Je suis intéressé"}</button>}

          {estDemandeur&&e.statut==="ouverte"&&cloturantId!==e.id&&<button onClick={()=>ouvrirEdition(e)} style={{border:"1.5px solid #e2e8f0",background:"#fff",color:"#475569",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>Modifier</button>}

          {estDemandeur&&e.statut==="ouverte"&&cloturantId===e.id&&<>
            <select value={cloturantCp} onChange={ev=>setCloturantCp(ev.target.value)} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 10px",fontSize:13}}>
              <option value="">Échangé avec…</option>
              {agents.filter(a=>a.id!==currentAgent.id).map(a=>(<option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>))}
            </select>
            <button onClick={()=>cloturer(e.id)} style={{border:"none",background:"#065f46",color:"#fff",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>Confirmer</button>
            <button onClick={()=>{setCloturantId(null);setCloturantCp("");}} style={{border:"none",background:"#f1f5f9",color:"#475569",borderRadius:9,padding:"8px 12px",cursor:"pointer",fontSize:13}}>✕</button>
          </>}

          {estDemandeur&&e.statut==="ouverte"&&cloturantId!==e.id&&<button onClick={()=>setCloturantId(e.id)} style={{border:"1.5px solid #86efac",background:"#d1fae5",color:"#065f46",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>Clôturer</button>}

          {estDemandeur&&<button onClick={()=>supprimer(e.id)} style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,marginLeft:"auto"}}>Supprimer</button>}
        </div>
      </div>);
    })}
  </div>);
}

function ProfilPersoView({currentAgent,onPartageChange,agentProfiles,setAgentProfiles}){
  const [pinActuel,setPinActuel]=useState("");
  const [pinNouveau,setPinNouveau]=useState("");
  const [pinConfirme,setPinConfirme]=useState("");
  const [msg,setMsg]=useState(null);
  const [busy,setBusy]=useState(false);
  const [partageActif,setPartageActif]=useState(!!currentAgent?.partage_previsionnel);
  const [partageBusy,setPartageBusy]=useState(false);
  const [partageMsg,setPartageMsg]=useState(null);
  // Module VT (09/08, demandé par Olivier) : masquable pour les agents à
  // temps plein qui ne l'utilisent pas. Actif par défaut (absent/undefined
  // = actif) — purement visuel, voir DashboardCompteurs.
  const vtActif=agentProfiles?.[currentAgent?.id]?.vtModuleActif!==false;
  const toggleVtModule=()=>{
    const nouvel=!vtActif;
    setAgentProfiles(prev=>({...prev,[currentAgent.id]:{...(prev[currentAgent.id]||{}),vtModuleActif:nouvel}}));
  };
  const [email,setEmail]=useState("");
  const [telephone,setTelephone]=useState("");
  const [fonction,setFonction]=useState("");
  const [visibleAnnuaire,setVisibleAnnuaire]=useState(true);
  const [coordBusy,setCoordBusy]=useState(false);
  const [coordMsg,setCoordMsg]=useState(null);
  const [coordLoadError,setCoordLoadError]=useState(false);
  const chargerCoordonnees=()=>{
    if(!currentAgent?.id)return;
    setCoordLoadError(false);
    api.agents.getById(currentAgent.id).then(full=>{
      setEmail(full?.email||"");
      setTelephone(full?.telephone||"");
      setFonction(full?.fonction||"");
      setVisibleAnnuaire(full?.annuaire_visible===undefined||full?.annuaire_visible===null?true:!!full.annuaire_visible);
    }).catch(()=>{setCoordLoadError(true);});
  };
  useEffect(()=>{ chargerCoordonnees(); },[currentAgent?.id]);
  if(!currentAgent)return(<div style={{textAlign:"center",padding:"60px 20px",color:"#94a3b8"}}><div style={{fontSize:40,marginBottom:12}}>🔄</div><div style={{fontSize:15,fontWeight:600,color:"#475569"}}>Sélectionne ton profil</div></div>);
  const soumettre=async()=>{
    setMsg(null);
    if(!/^\d{4}$/.test(pinNouveau)){setMsg({type:"error",text:"Le nouveau PIN doit faire 5 chiffres"});return;}
    if(pinNouveau!==pinConfirme){setMsg({type:"error",text:"Les deux PIN ne correspondent pas"});return;}
    setBusy(true);
    try{
      await api.auth.changePin(pinActuel,pinNouveau);
      setMsg({type:"success",text:"PIN modifié avec succès"});
      setPinActuel("");setPinNouveau("");setPinConfirme("");
    }catch(err){
      setMsg({type:"error",text:err.message||"Erreur lors du changement de PIN"});
    }
    setBusy(false);
  };
  const soumettreCoordonnees=async()=>{
    setCoordMsg(null);setCoordBusy(true);
    try{
      await api.annuaire.updateMesCoordonnees(currentAgent.id,{email,telephone,fonction});
      setCoordMsg({type:"success",text:"Coordonnées mises à jour"});
    }catch(err){
      setCoordMsg({type:"error",text:err.message||"Erreur lors de la mise à jour"});
    }
    setCoordBusy(false);
  };
  const toggleVisibleAnnuaire=async()=>{
    const nouvel=!visibleAnnuaire;
    setVisibleAnnuaire(nouvel);
    try{
      await api.annuaire.setVisible(currentAgent.id,nouvel);
    }catch(err){
      setVisibleAnnuaire(!nouvel);
      setCoordMsg({type:"error",text:"Erreur lors du changement de visibilité"});
    }
  };
  const togglePartage=async()=>{
    setPartageMsg(null);
    setPartageBusy(true);
    const nouvelEtat=!partageActif;
    try{
      await api.agents.setPartagePrevisionnel(currentAgent.id,nouvelEtat?1:0);
      setPartageActif(nouvelEtat);
      onPartageChange?.(nouvelEtat);
      setPartageMsg({type:"success",text:nouvelEtat?"Partage active":"Partage desactive"});
    }catch(err){
      setPartageMsg({type:"error",text:err.message||"Erreur lors de la mise a jour"});
    }
    setPartageBusy(false);
  };
  return(<div style={{display:"flex",flexDirection:"column",gap:14,maxWidth:420,margin:"0 auto"}}>
    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:18}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{width:44,height:44,borderRadius:"50%",background:"#0C447C",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:16}}>
          {currentAgent.prenom?.[0]}{currentAgent.nom?.[0]}
        </div>
        <div>
          <div style={{fontWeight:700,fontSize:15}}>{currentAgent.prenom} {currentAgent.nom}</div>
          <div style={{fontSize:12,color:"#64748b"}}>{currentAgent.grade} · CP {currentAgent.id}</div>
        </div>
      </div>
    </div>
    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:18}}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>📇 Mes coordonnées (Annuaire)</div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Visibles par tes collègues dans l'Annuaire, sauf si tu désactives ta visibilité ci-dessous.</div>
      {coordLoadError&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"9px 12px",borderRadius:9,background:"#fee2e2",border:"1.5px solid #fca5a5",marginBottom:10}}>
        <span style={{fontSize:12,fontWeight:600,color:"#991b1b"}}>Chargement impossible, réessaie.</span>
        <button onClick={chargerCoordonnees} style={{border:"none",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",background:"#991b1b",color:"#fff",flexShrink:0}}>Réessayer</button>
      </div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <input type="text" placeholder="Fonction (ex: Agent circulation)" value={fonction} onChange={e=>setFonction(e.target.value)}
          style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14}}/>
        <input type="tel" placeholder="Téléphone" value={telephone} onChange={e=>setTelephone(e.target.value)}
          style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14}}/>
        <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
          style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14}}/>
        {coordMsg&&<div style={{padding:"8px 10px",borderRadius:8,fontSize:13,fontWeight:600,
          background:coordMsg.type==="success"?"#d1fae5":"#fee2e2",
          color:coordMsg.type==="success"?"#065f46":"#991b1b"}}>{coordMsg.text}</div>}
        <button onClick={soumettreCoordonnees} disabled={coordBusy}
          style={{padding:"11px 0",border:"none",borderRadius:10,fontWeight:700,fontSize:14,cursor:coordBusy?"wait":"pointer",
          background:"#0C447C",color:"#fff"}}>
          {coordBusy?"…":"Enregistrer mes coordonnées"}
        </button>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:6,paddingTop:12,borderTop:"1px solid #f1f5f9"}}>
          <div style={{fontSize:13,fontWeight:600,color:"#334155"}}>Visible dans l'Annuaire</div>
          <button onClick={toggleVisibleAnnuaire}
            style={{width:48,height:28,borderRadius:14,border:"none",cursor:"pointer",
            background:visibleAnnuaire?"#0C447C":"#e2e8f0",position:"relative",transition:"background .15s"}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:"#fff",position:"absolute",top:3,
              left:visibleAnnuaire?23:3,transition:"left .15s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
          </button>
        </div>
      </div>
    </div>
    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:18}}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>🔑 Changer mon PIN</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <input type="password" inputMode="numeric" maxLength={4} placeholder="PIN actuel"
          value={pinActuel} onChange={e=>setPinActuel(e.target.value.replace(/\D/g,""))}
          style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14}}/>
        <input type="password" inputMode="numeric" maxLength={4} placeholder="Nouveau PIN (4 chiffres)"
          value={pinNouveau} onChange={e=>setPinNouveau(e.target.value.replace(/\D/g,""))}
          style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14}}/>
        <input type="password" inputMode="numeric" maxLength={4} placeholder="Confirmer le nouveau PIN"
          value={pinConfirme} onChange={e=>setPinConfirme(e.target.value.replace(/\D/g,""))}
          style={{padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14}}/>
        {msg&&<div style={{padding:"8px 10px",borderRadius:8,fontSize:13,fontWeight:600,
          background:msg.type==="success"?"#d1fae5":"#fee2e2",
          color:msg.type==="success"?"#065f46":"#991b1b"}}>{msg.text}</div>}
        <button onClick={soumettre} disabled={busy||!pinActuel||!pinNouveau||!pinConfirme}
          style={{padding:"11px 0",border:"none",borderRadius:10,fontWeight:700,fontSize:14,cursor:busy?"wait":"pointer",
          background:(!pinActuel||!pinNouveau||!pinConfirme)?"#e2e8f0":"#0C447C",
          color:(!pinActuel||!pinNouveau||!pinConfirme)?"#94a3b8":"#fff"}}>
          {busy?"…":"Valider"}
        </button>
      </div>
    </div>
    <SignaturePad agent={currentAgent} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles}/>
  <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:18}}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>Planning Previsionnel</div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Partager mon planning personnel public (M/AM/N/J/JF/FOR/DISPO) avec mes collegues dans la vue Planning Previsionnel.</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:13,fontWeight:600,color:"#334155"}}>Partager mon planning</div>
        <button onClick={togglePartage} disabled={partageBusy}
          style={{width:48,height:28,borderRadius:14,border:"none",cursor:partageBusy?"wait":"pointer",
          background:partageActif?"#0C447C":"#e2e8f0",position:"relative",transition:"background .15s"}}>
          <div style={{width:22,height:22,borderRadius:"50%",background:"#fff",position:"absolute",top:3,
            left:partageActif?23:3,transition:"left .15s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
        </button>
      </div>
      {partageMsg&&<div style={{marginTop:10,padding:"8px 10px",borderRadius:8,fontSize:13,fontWeight:600,
        background:partageMsg.type==="success"?"#d1fae5":"#fee2e2",
        color:partageMsg.type==="success"?"#065f46":"#991b1b"}}>{partageMsg.text}</div>}
    </div>
    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:18}}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>🕒 Module VT (temps partiel)</div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Pour les agents à temps partiel — affiche ou masque la case VT dans tes compteurs. Actif par défaut. Purement visuel : si tu la masques, tes données VT déjà enregistrées restent comptabilisées normalement.</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:13,fontWeight:600,color:"#334155"}}>Afficher la case VT</div>
        <button onClick={toggleVtModule}
          style={{width:48,height:28,borderRadius:14,border:"none",cursor:"pointer",
          background:vtActif?"#0C447C":"#e2e8f0",position:"relative",transition:"background .15s"}}>
          <div style={{width:22,height:22,borderRadius:"50%",background:"#fff",position:"absolute",top:3,
            left:vtActif?23:3,transition:"left .15s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
        </button>
      </div>
    </div>
  </div>);
}
// Postes CPS pouvant être liés à une fiche UO (3x8 = tourne M/AM/N, journee = poste unique J)
const OPTIONS_POSTES_CPS = [
  ...POSTES_PRCI_3x8.map(p=>({value:`3x8:${p.code}:PRCI`,label:`${p.label} (PRCI, tourne M/AM/N)`})),
  ...POSTES_PAR_3x8.map(p=>({value:`3x8:${p.code}:PAR`,label:`${p.label} (PAR, tourne M/AM/N)`})),
  ...POSTES_JOURNEE.map(p=>({value:`journee:${p.jsCode}:${p.famille}`,label:`${p.label} (${p.famille}, journée)`})),
];

// Lecture seule — ne modifie jamais cpsSchedule ni cpsAleas. Résout qui occupe
// actuellement un poste CPS lié à une fiche UO : correction manuelle (cpsAleas)
// en priorité, sinon détection automatique (cpsSchedule), sinon rien.
function resoudreTitulaireCps(uoRow,agents,cpsSchedule,cpsAleas){
  if(!uoRow.cps_type||!uoRow.cps_code||!uoRow.cps_famille) return null;
  const now=new Date();
  let jsCode=null, posteLabel=null, dateRef=now;
  if(uoRow.cps_type==="journee"){
    const def=POSTES_JOURNEE.find(p=>p.jsCode===uoRow.cps_code);
    jsCode=uoRow.cps_code; posteLabel=def?.label||null;
  }else{
    const heure=now.getHours()*60+now.getMinutes();
    const shiftKey=(heure>=1335||heure<370)?"N":(heure<845)?"M":"AM";
    // Nuit après minuit (00h00-06h09) appartient au service qui a commencé la
    // veille à 22h15 — sans ça, on cherchait le mauvais jour dans cpsAleas/
    // cpsSchedule entre minuit et 06h10 (18/07, trouvé en vérifiant le
    // mécanisme "titulaire dynamique" avec de vraies données CPS).
    if(shiftKey==="N"&&heure<370){ dateRef=new Date(now); dateRef.setDate(dateRef.getDate()-1); }
    const liste=uoRow.cps_famille==="PAR"?POSTES_PAR_3x8:POSTES_PRCI_3x8;
    const def=liste.find(p=>p.code===uoRow.cps_code);
    if(!def) return null;
    jsCode=def[shiftKey]; posteLabel=def.label;
    if(!jsCode) return null;
  }
  const dateKey=`${dateRef.getFullYear()}-${String(dateRef.getMonth()+1).padStart(2,"0")}-${String(dateRef.getDate()).padStart(2,"0")}`;
  const alea=(cpsAleas||[]).find(a=>a.js_code===jsCode && String(a.date_jour).slice(0,10)===dateKey && a.famille===uoRow.cps_famille);
  if(alea){
    if(alea.type==="non_tenu") return {statut:"non_tenu",noms:[]};
    const trouves=(alea.agents_concernes||[]).map(id=>(agents||[]).find(a=>a.id===id)).filter(Boolean);
    return {statut:"trouve",noms:trouves.map(a=>`${a.prenom} ${a.nom}`)};
  }
  const trouve=(agents||[]).find(a=>{
    const en=(cpsSchedule||{})[`${a.id}-${dateKey}`];
    return en&&(en.jsCode===jsCode||(posteLabel&&en.poste===posteLabel))&&!EQ[en.equipe]?.prive;
  });
  if(trouve) return {statut:"trouve",noms:[`${trouve.prenom} ${trouve.nom}`]};
  return {statut:"aucun",noms:[]};
}

function TitulaireUo({uo,agents,cpsSchedule,cpsAleas}){
  if(uo.cps_type){
    const live=resoudreTitulaireCps(uo,agents,cpsSchedule,cpsAleas);
    if(live&&live.statut==="trouve"&&live.noms.length){
      return(<>{live.noms.join(" / ")} <span style={{fontSize:10,color:"#16a34a",fontWeight:700}}>● En direct CPS</span></>);
    }
    return(<span style={{color:"#64748b",fontWeight:500}}>Titulaire non communiqué</span>);
  }
  return (uo.titulaire_prenom||uo.titulaire_nom)
    ? <>{uo.titulaire_prenom||""} {uo.titulaire_nom||""}</>
    : <span style={{color:"#64748b",fontWeight:500}}>Titulaire non communiqué</span>;
}
function AnnuaireView({currentAgent,isAdmin,agents,cpsSchedule,cpsAleas}){
  const [recherche,setRecherche]=useState("");
  const [accesRapide,setAccesRapide]=useState([]);
  const [uo,setUo]=useState([]);
  const [agentsAnnuaire,setAgentsAnnuaire]=useState([]);
  const [loading,setLoading]=useState(true);
  const [activeTab,setActiveTab]=useState(()=>localStorage.getItem("f2ppmp_annuaire_tab")||"agents");
  const [gererAcces,setGererAcces]=useState(false);
  const [editAccesId,setEditAccesId]=useState(null);
  const [nouvelAcces,setNouvelAcces]=useState(false);
  const [editUoId,setEditUoId]=useState(null);
  const [nouvelUo,setNouvelUo]=useState(false);
  const [expandedUo,setExpandedUo]=useState([]);
  const toggleExpandUo=(id)=>{
    setExpandedUo(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  };

  const [loadError,setLoadError]=useState(null);
  const recharger=()=>{
    setLoadError(null);
    Promise.all([
      api.annuaire.getAccesRapide(),
      api.annuaire.getUo(),
      api.annuaire.getAgents(),
    ]).then(([acces,uoRows,agts])=>{
      setAccesRapide(acces||[]);
      setUo(uoRows||[]);
      setAgentsAnnuaire(agts||[]);
      setLoading(false);
    }).catch(()=>{
      // Volontairement : on ne touche PAS aux listes déjà chargées ici,
      // pour ne jamais donner l'impression que les données ont été effacées
      // suite à un simple raté réseau ou un redémarrage serveur passager.
      setLoadError("Impossible de charger l'annuaire. Vérifie ta connexion et réessaie.");
      setLoading(false);
    });
  };
  useEffect(()=>{ recharger(); },[]);

  const q=recherche.trim().toLowerCase();
  const filtreAgents=agentsAnnuaire
    .filter(a=>!q||`${a.nom} ${a.prenom}`.toLowerCase().includes(q))
    .sort((a,b)=>`${a.nom}${a.prenom}`.localeCompare(`${b.nom}${b.prenom}`));
  const filtreUo=uo
    .filter(u=>!q||`${u.fonction} ${u.titulaire_nom||""} ${u.titulaire_prenom||""}`.toLowerCase().includes(q))
    .sort((a,b)=>a.fonction.localeCompare(b.fonction));

  if(loading)return(<div style={{textAlign:"center",padding:"60px 20px",color:"#94a3b8"}}>Chargement de l'annuaire…</div>);

  return(<div style={{display:"flex",flexDirection:"column",gap:12,maxWidth:640,margin:"0 auto"}}>

    {loadError&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 14px",borderRadius:10,background:"#fee2e2",border:"1.5px solid #fca5a5"}}>
      <span style={{fontSize:13,fontWeight:600,color:"#991b1b"}}>{loadError}</span>
      <button onClick={recharger} style={{border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",background:"#991b1b",color:"#fff",flexShrink:0}}>Réessayer</button>
    </div>}

    {/* Accès rapide, redesign 21/08 (Olivier : "ameliore le visuel des
        numero rapide en haut") -- section désormais encartée comme le
        reste de l'Annuaire (même carte blanche/bordure que Agents/UO),
        pastilles agrandies avec dégradé + ombre légère plutôt qu'un aplat
        de couleur plat, pour un rendu plus soigné. */}
    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",color:"#94a3b8",marginBottom:10}}>📞 Accès rapide</div>
      {accesRapide.length>0
        ? <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(84px,1fr))",gap:10}}>
            {accesRapide.map(a=>(
              <a key={a.id} href={`tel:${a.numero}`} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"12px 6px",borderRadius:14,border:"1.5px solid #fed7aa",background:"#fff7ed",textDecoration:"none"}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#f97316,#c2410c)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,boxShadow:"0 2px 6px rgba(194,65,12,.35)"}}>📞</div>
                <span style={{fontSize:11,fontWeight:700,textAlign:"center",lineHeight:1.25,color:"#7c2d12"}}>{a.libelle}</span>
              </a>
            ))}
          </div>
        : <div style={{fontSize:13,color:"#94a3b8"}}>Aucun numéro pour l'instant.</div>}
      {!gererAcces&&
        <button onClick={()=>setGererAcces(true)} style={{border:"none",background:"none",color:"#0C447C",fontWeight:600,fontSize:12,cursor:"pointer",marginTop:10,padding:0}}>Gérer les numéros d'accès rapide</button>}
      {gererAcces&&<div style={{marginTop:10,padding:12,borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc"}}>
        <button onClick={()=>setNouvelAcces(true)} style={{display:"flex",alignItems:"center",gap:5,border:"none",background:"none",color:"#0C447C",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:8,padding:0}}>+ Ajouter un numéro</button>
        {nouvelAcces&&<AccesRapideForm onCancel={()=>setNouvelAcces(false)} onSaved={()=>{setNouvelAcces(false);recharger();}}/>}
        {accesRapide.length===0&&!nouvelAcces&&<div style={{fontSize:13,color:"#64748b",marginBottom:4}}>Aucun numéro pour l'instant.</div>}
        {accesRapide.map(a=>editAccesId===a.id
          ? <AccesRapideForm key={a.id} initial={a} onCancel={()=>setEditAccesId(null)} onSaved={()=>{setEditAccesId(null);recharger();}} onDelete={()=>{if(window.confirm(`Supprimer "${a.libelle}" ?`))api.annuaire.deleteAccesRapide(a.id).then(recharger);}}/>
          : <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #e2e8f0"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13,color:"#1e293b"}}>{a.libelle}</div>
                <div style={{fontSize:12,color:"#64748b"}}>{a.numero}</div>
              </div>
              <button onClick={()=>setEditAccesId(a.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14,color:"#94a3b8"}}>✎</button>
            </div>
        )}
        <button onClick={()=>setGererAcces(false)} style={{border:"none",background:"none",color:"#64748b",fontWeight:600,fontSize:12,cursor:"pointer",marginTop:8,padding:0}}>Fermer</button>
      </div>}
    </div>

    <div style={{height:1,background:"#e2e8f0"}}/>

    <input placeholder="Rechercher un nom, une fonction…" value={recherche} onChange={e=>setRecherche(e.target.value)}
      style={{padding:"11px 14px",border:"1.5px solid #e2e8f0",borderRadius:12,fontSize:14}}/>

    <div style={{display:"flex",gap:6}}>
      <button onClick={()=>{setActiveTab("agents");localStorage.setItem("f2ppmp_annuaire_tab","agents");}} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 0",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",
        border:activeTab==="agents"?"1.5px solid #0C447C":"1.5px solid #e2e8f0",background:activeTab==="agents"?"#eff6ff":"#fff",color:"#1e293b"}}>
        <span style={{width:7,height:7,borderRadius:"50%",background:"#378ADD"}}/>Agents
      </button>
      <button onClick={()=>{setActiveTab("uo");localStorage.setItem("f2ppmp_annuaire_tab","uo");}} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 0",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",
        border:activeTab==="uo"?"1.5px solid #0C447C":"1.5px solid #e2e8f0",background:activeTab==="uo"?"#eff6ff":"#fff",color:"#1e293b"}}>
        <span style={{width:7,height:7,borderRadius:"50%",background:"#1D9E75"}}/>UO
      </button>
    </div>

    {activeTab==="agents"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
      {filtreAgents.map(a=><AgentAnnuaireCard key={a.cp} agent={a}/>)}
      {filtreAgents.length===0&&<div style={{fontSize:13,color:"#94a3b8",textAlign:"center",padding:"20px 0"}}>Aucun agent trouvé.</div>}
    </div>}

    {activeTab==="uo"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
      <button onClick={()=>setNouvelUo(true)} style={{alignSelf:"flex-end",display:"flex",alignItems:"center",gap:5,border:"none",background:"none",color:"#0C447C",fontWeight:700,fontSize:13,cursor:"pointer",padding:0}}>+ Ajouter un poste</button>
      {nouvelUo&&<UoForm onCancel={()=>setNouvelUo(false)} onSaved={()=>{setNouvelUo(false);recharger();}}/>}
      {filtreUo.length===0&&!nouvelUo&&<div style={{fontSize:13,color:"#94a3b8",textAlign:"center",padding:"20px 0"}}>Aucun poste UO pour l'instant.</div>}
      {filtreUo.map(u=>{
        if(editUoId===u.id) return <UoForm key={u.id} initial={u} onCancel={()=>setEditUoId(null)} onSaved={()=>{setEditUoId(null);recharger();}} onDelete={()=>{if(window.confirm(`Supprimer le poste "${u.fonction}" ?`))api.annuaire.deleteUo(u.id).then(recharger);}}/>;
        // Numéro "principal" affiché en icône directe (21/08, Olivier : "on
        // doit cliquer en premier sur voir le contact [...] amrlioer ca
        // aussi" -- avant, AUCUN numéro n'était jamais visible/appelable
        // sans cliquer "Contacts" pour déplier, contrairement aux agents qui
        // ont désormais leurs icônes toujours visibles). "Détails" ne
        // reste utile (et visible) que s'il y a plus d'un numéro ou une
        // note -- sinon il ferait doublon avec les 2 icônes déjà présentes.
        // 22/08 (Olivier : "dans tout les numero de uo, il faut mettre les
        // numero en 01 dans la touche en 1er") -- un numéro fixe "01..."
        // (ligne de bureau du poste) doit passer devant les mobiles pro/perso
        // dans le bouton principal, quel que soit le champ où il est saisi.
        const tousTels=[u.mobile_pro,u.mobile_perso,u.fixe].filter(Boolean);
        const tel01=tousTels.find(t=>t.replace(/[^0-9]/g,"").startsWith("01"));
        const telPrincipal=tel01||u.mobile_pro||u.mobile_perso||u.fixe;
        const nbTels=tousTels.length;
        const hasExtra=nbTels>1||(u.note&&u.note.trim());
        const hasTel=!!telPrincipal, hasMail=!!u.email;
        return <div key={u.id} style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:"12px 14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:"#1e293b"}}>{u.fonction}</div>
                <div style={{fontSize:12,color:"#64748b",marginTop:2}}><TitulaireUo uo={u} agents={agents} cpsSchedule={cpsSchedule} cpsAleas={cpsAleas}/></div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <IconActionBtn href={`tel:${telPrincipal}`} active={hasTel} bg="linear-gradient(135deg,#ef4444,#b91c1c)" title="Appeler">{c=><IconTel size={15} color={c}/>}</IconActionBtn>
                <IconActionBtn href={`mailto:${u.email}`} active={hasMail} bg="linear-gradient(135deg,#3b82f6,#1d4ed8)" title="Email">{c=><IconMail size={14} color={c}/>}</IconActionBtn>
                {hasExtra&&<button onClick={()=>toggleExpandUo(u.id)} title="Voir tous les contacts" style={{width:32,height:32,borderRadius:"50%",border:"1px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:12,color:"#64748b",flexShrink:0}}>{expandedUo.includes(u.id)?"▴":"▾"}</button>}
                <button onClick={()=>setEditUoId(u.id)} title="Modifier" style={{width:32,height:32,borderRadius:"50%",border:"1px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:14,color:"#64748b",flexShrink:0}}>✎</button>
              </div>
            </div>
            {(hasTel||hasMail)&&<div style={{fontSize:12,color:"#94a3b8",fontWeight:500,marginTop:6,display:"flex",gap:12,flexWrap:"wrap"}}>
              {hasTel&&<span>{telPrincipal}</span>}
              {hasMail&&<span style={{wordBreak:"break-all"}}>{u.email}</span>}
            </div>}
            {!hasTel&&!hasMail&&<div style={{fontSize:12,color:"#94a3b8",fontWeight:500,marginTop:6}}>Aucun contact renseigné</div>}
            {expandedUo.includes(u.id)&&hasExtra&&<div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #f1f5f9"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.03em",marginBottom:8}}>Tous les contacts</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>
                <ContactLigne label="Mobile pro" valeur={u.mobile_pro}/>
                <ContactLigne label="Mobile perso" valeur={u.mobile_perso}/>
                <ContactLigne label="Fixe" valeur={u.fixe}/>
              </div>
              {u.note&&u.note.trim()&&<div style={{marginTop:10,padding:"8px 10px",borderRadius:8,background:"#fffbeb",borderLeft:"4px solid #f59e0b"}}>
                <div style={{fontSize:10,fontWeight:700,color:"#92400e",textTransform:"uppercase",letterSpacing:"0.03em",marginBottom:2}}>📝 Note</div>
                <div style={{fontSize:13,color:"#1e293b",fontWeight:500}}>{u.note}</div>
              </div>}
            </div>}
          </div>;
      })}
    </div>}
  </div>);
}

// Palette déterministe pour les avatars agent (21/08, refonte Annuaire) --
// même agent = toujours la même couleur, purement décoratif (identité
// visuelle), sans lien avec la famille PRCI/PAR (non disponible ici).
const AVATAR_PALETTE=["#0f4c81","#0d9488","#7c3aed","#c2410c","#be185d","#4338ca","#0891b2","#b45309","#15803d","#9333ea"];
function avatarColor(str){
  let h=0; for(let i=0;i<(str||"").length;i++) h=(h*31+str.charCodeAt(i))>>>0;
  return AVATAR_PALETTE[h%AVATAR_PALETTE.length];
}

// Carte agent de l'Annuaire (21/08, refonte demandée par Olivier : "quand il
// y a un mail, la fiche a les touche a des endroit differents [...] rends
// le attractif, moderne et ergonomique — la c'est laid"). Avant : les
// boutons contact (téléphone/SMS/email) étaient des pastilles pleine
// largeur qui n'apparaissaient QUE si la donnée existait, avec flexWrap —
// selon les combinaisons présentes/absentes d'un agent à l'autre, elles se
// retrouvaient à des tailles et positions différentes (parfois sur la même
// ligne que le nom, parfois sur une toute nouvelle ligne). Ici, la zone
// d'action est TOUJOURS 3 icônes rondes aux mêmes 3 emplacements fixes pour
// CHAQUE carte -- désactivée (grisée, non cliquable) quand la donnée
// manque plutôt que retirée, donc jamais de décalage d'une carte à l'autre.
// Composant défini au niveau racine du fichier (jamais à l'intérieur d'un
// autre composant) -- règle du projet, sinon React recrée le composant à
// chaque re-render du parent.
// Bouton d'action rond (appeler/SMS/email), toujours au même endroit, actif
// ou grisé selon que la donnée existe -- partagé par les cartes Agents ET
// UO (21/08) pour garder un seul langage visuel cohérent dans tout l'Annuaire.
// Contraste renforcé le 22/08 (Olivier : "les touche de l'annuaire sont peu
// visible (tel, sms, mail)") -- l'essai du 21/08 (icône teintée sur fond
// pastel assorti) manquait de contraste, surtout en petite taille sur
// mobile. Remplacé par un vrai disque plein en dégradé + icône blanche pour
// l'état actif (même traitement que les pastilles "Accès rapide" au-dessus,
// qui elles avaient déjà ce contraste fort dès le 21/08) -- `children` est
// désormais une fonction qui reçoit la couleur d'icône à utiliser (blanc sur
// fond actif, gris moyen sur fond gris inactif), pour que l'icône ne soit
// jamais de la même couleur que son propre fond.
function IconActionBtn({href,active,bg,title,children}){
  const couleurIcone=active?"#fff":"#94a3b8";
  return active
    ? <a href={href} title={title} style={{width:34,height:34,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none",background:bg,boxShadow:"0 2px 5px rgba(0,0,0,.2)",flexShrink:0}}>{children(couleurIcone)}</a>
    : <div title="Non renseigné" style={{width:34,height:34,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:"#eef2f6",flexShrink:0}}>{children(couleurIcone)}</div>;
}

function AgentAnnuaireCard({ agent:a }){
  const initiales=`${(a.prenom||"?")[0]||""}${(a.nom||"?")[0]||""}`.toUpperCase();
  const couleur=avatarColor(`${a.nom}${a.prenom}`);
  const hasTel=!!a.telephone, hasMail=!!a.email;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:8,background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:38,height:38,borderRadius:"50%",background:couleur,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,flexShrink:0}}>{initiales}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:15,color:"#1e293b"}}>{a.nom?.toUpperCase()} <span style={{fontWeight:500}}>{a.prenom}</span></div>
          <div style={{fontSize:12,color:"#64748b",fontWeight:500}}>{a.fonction||a.grade||""}</div>
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <IconActionBtn href={`tel:${a.telephone}`} active={hasTel} bg="linear-gradient(135deg,#ef4444,#b91c1c)" title="Appeler">{c=><IconTel size={15} color={c}/>}</IconActionBtn>
          <IconActionBtn href={`sms:${a.telephone}`} active={hasTel} bg="linear-gradient(135deg,#22c55e,#15803d)" title="SMS">{c=><IconSms size={14} color={c}/>}</IconActionBtn>
          <IconActionBtn href={`mailto:${a.email}`} active={hasMail} bg="linear-gradient(135deg,#3b82f6,#1d4ed8)" title="Email">{c=><IconMail size={14} color={c}/>}</IconActionBtn>
        </div>
      </div>
      {(hasTel||hasMail)&&<div style={{fontSize:12,color:"#94a3b8",fontWeight:500,paddingLeft:48,display:"flex",gap:12,flexWrap:"wrap"}}>
        {hasTel&&<span>{a.telephone}</span>}
        {hasMail&&<span style={{wordBreak:"break-all"}}>{a.email}</span>}
      </div>}
    </div>
  );
}

function IconTel({size,color}){
  const s=size||16;
  return(<svg width={s} height={s} viewBox="0 0 24 24" fill={color||"#D22B2B"} style={{flexShrink:0}}><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.57 1 1 0 0 1-.24 1.01l-2.21 2.21z"/></svg>);
}
// SMS/email en SVG (22/08, remplace les emoji 💬✉️) -- un emoji garde
// toujours ses propres couleurs fixes, impossible à éclaircir/foncer pour
// rester lisible sur un fond coloré -- un vrai SVG peut prendre n'importe
// quelle couleur (blanc sur fond plein ici), même logique que IconTel.
function IconSms({size,color}){
  const s=size||16;
  return(<svg width={s} height={s} viewBox="0 0 24 24" fill={color||"#16a34a"} style={{flexShrink:0}}><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>);
}
function IconMail({size,color}){
  const s=size||16;
  return(<svg width={s} height={s} viewBox="0 0 24 24" fill={color||"#2563eb"} style={{flexShrink:0}}><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>);
}

function ContactLigne({label,valeur}){
  if(!valeur)return null;
  return(<a href={`tel:${valeur}`} style={{display:"flex",alignItems:"center",gap:8,textDecoration:"none",padding:"7px 10px",borderRadius:8,background:"#fef2f2",border:"1px solid #fecaca"}}>
    <IconTel size={15}/>
    <div>
      <div style={{fontSize:10,fontWeight:700,color:"#991b1b",textTransform:"uppercase",letterSpacing:"0.03em"}}>{label}</div>
      <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{valeur}</div>
    </div>
  </a>);
}

function AccesRapideForm({initial,onCancel,onSaved,onDelete}){
  const [libelle,setLibelle]=useState(initial?.libelle||"");
  const [numero,setNumero]=useState(initial?.numero||"");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState(null);
  const valider=async()=>{
    if(!libelle.trim()||!numero.trim()){setErr("Libellé et numéro obligatoires");return;}
    setBusy(true);setErr(null);
    try{
      if(initial) await api.annuaire.updateAccesRapide(initial.id,{libelle,numero});
      else await api.annuaire.createAccesRapide({libelle,numero});
      onSaved();
    }catch(e){setErr(e.message||"Erreur");}
    setBusy(false);
  };
  return(<div style={{display:"flex",flexDirection:"column",gap:8,padding:"10px 0",borderBottom:"1px solid #e2e8f0"}}>
    <input placeholder="Libellé (ex: Astreinte PRCI)" value={libelle} onChange={e=>setLibelle(e.target.value)}
      style={{padding:"9px 11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13}}/>
    <input placeholder="Numéro" value={numero} onChange={e=>setNumero(e.target.value)}
      style={{padding:"9px 11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13}}/>
    {err&&<div style={{fontSize:12,color:"#991b1b"}}>{err}</div>}
    <div style={{display:"flex",gap:8}}>
      <button onClick={valider} disabled={busy} style={{flex:1,padding:"9px 0",border:"none",borderRadius:9,fontWeight:700,fontSize:13,cursor:"pointer",background:"#0C447C",color:"#fff"}}>{busy?"…":"Enregistrer"}</button>
      <button onClick={onCancel} style={{padding:"9px 14px",border:"1.5px solid #e2e8f0",borderRadius:9,fontWeight:600,fontSize:13,cursor:"pointer",background:"#fff",color:"#64748b"}}>Annuler</button>
      {initial&&onDelete&&<button onClick={onDelete} style={{padding:"9px 14px",border:"none",borderRadius:9,fontWeight:600,fontSize:13,cursor:"pointer",background:"#fee2e2",color:"#991b1b"}}>Suppr.</button>}
    </div>
  </div>);
}

function UoForm({initial,onCancel,onSaved,onDelete}){
  const [fonction,setFonction]=useState(initial?.fonction||"");
  const [titulaireNom,setTitulaireNom]=useState(initial?.titulaire_nom||"");
  const [titulairePrenom,setTitulairePrenom]=useState(initial?.titulaire_prenom||"");
  const [mobilePro,setMobilePro]=useState(initial?.mobile_pro||"");
  const [mobilePerso,setMobilePerso]=useState(initial?.mobile_perso||"");
  const [fixe,setFixe]=useState(initial?.fixe||"");
  const [email,setEmail]=useState(initial?.email||"");
  const [note,setNote]=useState(initial?.note||"");
  const [cpsLink,setCpsLink]=useState(initial&&initial.cps_type?`${initial.cps_type}:${initial.cps_code}:${initial.cps_famille}`:"");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState(null);
  const valider=async()=>{
    if(!fonction.trim()){setErr("Le poste/fonction est obligatoire");return;}
    setBusy(true);setErr(null);
    const [cType,cCode,cFamille]=cpsLink?cpsLink.split(":"):[null,null,null];
    const data={fonction,titulaire_nom:titulaireNom,titulaire_prenom:titulairePrenom,mobile_pro:mobilePro,mobile_perso:mobilePerso,fixe,email,note,cps_type:cType,cps_code:cCode,cps_famille:cFamille};
    try{
      if(initial) await api.annuaire.updateUo(initial.id,data);
      else await api.annuaire.createUo(data);
      onSaved();
    }catch(e){setErr(e.message||"Erreur");}
    setBusy(false);
  };
  const champStyle={width:"100%",padding:"11px 13px",border:"1.5px solid #94a3b8",borderRadius:9,fontSize:15,color:"#1e293b",background:"#fff"};
  const labelStyle={fontSize:12,fontWeight:700,color:"#334155",marginBottom:4,display:"block"};
  return(<div style={{display:"flex",flexDirection:"column",gap:12,padding:"14px",borderRadius:12,border:"1.5px solid #cbd5e1",background:"#f8fafc",marginBottom:6}}>
    <div>
      <label style={labelStyle}>Poste / fonction</label>
      <input placeholder="ex: Assistant RH" value={fonction} onChange={e=>setFonction(e.target.value)} style={champStyle}/>
    </div>
    <div>
      <label style={labelStyle}>Lier à un poste CPS (optionnel)</label>
      <select value={cpsLink} onChange={e=>setCpsLink(e.target.value)} style={champStyle}>
        <option value="">Aucun (titulaire saisi manuellement)</option>
        {OPTIONS_POSTES_CPS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {cpsLink&&<div style={{fontSize:11,color:"#64748b",marginTop:4}}>Si lié, le titulaire affiché sera automatiquement celui de CPS Officiel (mis à jour en temps réel) — les champs Prénom/Nom titulaire ci-dessous ne seront plus utilisés pour l'affichage.</div>}
    </div>
    <div style={{display:"flex",gap:10}}>
      <div style={{flex:1}}>
        <label style={labelStyle}>Prénom titulaire</label>
        <input value={titulairePrenom} onChange={e=>setTitulairePrenom(e.target.value)} style={champStyle}/>
      </div>
      <div style={{flex:1}}>
        <label style={labelStyle}>Nom titulaire</label>
        <input value={titulaireNom} onChange={e=>setTitulaireNom(e.target.value)} style={champStyle}/>
      </div>
    </div>
    <div>
      <label style={labelStyle}>Mobile pro</label>
      <input value={mobilePro} onChange={e=>setMobilePro(e.target.value)} style={champStyle}/>
    </div>
    <div>
      <label style={labelStyle}>Mobile perso</label>
      <input value={mobilePerso} onChange={e=>setMobilePerso(e.target.value)} style={champStyle}/>
    </div>
    <div>
      <label style={labelStyle}>Fixe</label>
      <input value={fixe} onChange={e=>setFixe(e.target.value)} style={champStyle}/>
    </div>
    <div>
      <label style={labelStyle}>Email</label>
      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={champStyle}/>
    </div>
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <label style={{...labelStyle,marginBottom:0}}>Note libre (optionnel)</label>
        {note&&<button type="button" onClick={()=>setNote("")} style={{border:"none",background:"none",color:"#991b1b",fontSize:11,fontWeight:700,cursor:"pointer",padding:0}}>Effacer la note</button>}
      </div>
      <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} style={{...champStyle,resize:"vertical",fontFamily:"inherit"}}/>
    </div>
    {err&&<div style={{fontSize:13,fontWeight:600,color:"#991b1b"}}>{err}</div>}
    <div style={{display:"flex",gap:8}}>
      <button onClick={valider} disabled={busy} style={{flex:1,padding:"11px 0",border:"none",borderRadius:9,fontWeight:700,fontSize:14,cursor:"pointer",background:"#0C447C",color:"#fff"}}>{busy?"…":"Enregistrer"}</button>
      <button onClick={onCancel} style={{padding:"11px 16px",border:"1.5px solid #94a3b8",borderRadius:9,fontWeight:600,fontSize:14,cursor:"pointer",background:"#fff",color:"#334155"}}>Annuler</button>
      {initial&&onDelete&&<button onClick={onDelete} style={{padding:"11px 16px",border:"none",borderRadius:9,fontWeight:600,fontSize:14,cursor:"pointer",background:"#fee2e2",color:"#991b1b"}}>Suppr.</button>}
    </div>
  </div>);
}

function ImportDeroulement({agent,onClose,onImport}){
  const fam=FAMILLES[agent?.famille||agent?.fam];
  const [year,setYear]=useState(new Date().getFullYear());
  const [month,setMonth]=useState(new Date().getMonth());
  const [jours,setJours]=useState({}); // {dk: {equipe, equipe2}}
  const [saved,setSaved]=useState(false);

  const daysInMonth=new Date(year,month+1,0).getDate();
  const daysList=Array.from({length:daysInMonth},(_,i)=>{
    const d=new Date(year,month,i+1);
    return {
      dk:`${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,
      dow:d.getDay(), num:i+1,
    };
  });

  // Lendemain d'une date
  const nextDk=(dk)=>{
    const d=new Date(dk); d.setDate(d.getDate()+1);
    return d.toISOString().slice(0,10);
  };

  const EQUIPES_DISPO=[
    // Travail — fond intense, texte blanc
    {c:"M",    l:"Matinée",    bg:"#8B0000",tc:"#fff",dot:"#fca5a5"},
    {c:"AM",   l:"Soirée",     bg:"#8B0000",tc:"#fff",dot:"#fca5a5"},
    {c:"N",    l:"Nuit",       bg:"#8B0000",tc:"#fff",dot:"#fca5a5"},
    {c:"J",    l:"Journée",    bg:"#8B0000",tc:"#fff",dot:"#fca5a5"},
    // Repos / Réserviste — fond coloré, texte blanc
    {c:"RP",   l:"RP",         bg:"#16a34a",tc:"#fff",dot:"#bbf7d0",prive:true},
    {c:"RU",   l:"RU",         bg:"#eab308",tc:"#fff",dot:"#fef9c3",prive:true},
    {c:"RQ",   l:"RQ",         bg:"#eab308",tc:"#fff",dot:"#fef9c3",prive:true},
    {c:"NU",   l:"NU",         bg:"#475569",tc:"#fff",dot:"#cbd5e1"},
    {c:"CA",   l:"Congés", bg:"#eab308",tc:"#fff",dot:"#fef9c3",prive:true},
    {c:"MA",   l:"Maladie",    bg:"#dc2626",tc:"#fff",dot:"#fecaca",prive:true},
    {c:"VT",   l:"VT",          bg:"#eab308",tc:"#fff",dot:"#fef9c3",prive:true},
    {c:"ABS",  l:"Absent",     bg:"#dc2626",tc:"#fff",dot:"#fecaca",prive:true},
    {c:"FOR",  l:"Formation",  bg:"#b45309",tc:"#fff",dot:"#fef9c3"},
    {c:"DISPO",l:"Dispo",      bg:"#059669",tc:"#fff",dot:"#d1fae5"},
  ];

  const setEquipe=(dk,equipe)=>{
    setJours(prev=>equipe
      ?{...prev,[dk]:{...(prev[dk]||{}),equipe}}
      :{...prev,[dk]:prev[dk]?.equipe2?{...prev[dk],equipe:undefined}:undefined}
    );
  };

  const setNuit=(dk,hasNuit)=>{
    setJours(prev=>{
      const next={...prev};
      if(hasNuit){
        // Ajouter prise de nuit sur J
        next[dk]={...(next[dk]||{}),equipe2:"N"};
        // Ajouter fin de nuit sur J+1
        const j1=nextDk(dk);
        next[j1]={...(next[j1]||{}),finNuit:true};
      } else {
        // Retirer prise de nuit sur J
        if(next[dk]){const {equipe2,...rest}=next[dk];next[dk]=Object.keys(rest).length?rest:undefined;}
        // Retirer fin de nuit sur J+1
        const j1=nextDk(dk);
        if(next[j1]){const {finNuit,...rest}=next[j1];next[j1]=Object.keys(rest).length?rest:undefined;}
      }
      return next;
    });
  };

  const handleSave=()=>{
    const result=[];
    Object.entries(jours).forEach(([dk,val])=>{
      if(!val)return;
      const eq=EQUIPES_DISPO.find(e=>e.c===val.equipe);
      if(val.equipe){
        result.push({date:dk,equipe:val.equipe,equipe2:val.equipe2||null,
          prive:eq?.prive||false,impressionAt:new Date().toISOString()});
      } else if(val.finNuit){
        // Jour J+1 : fin de nuit uniquement
        result.push({date:dk,equipe:"N_FIN",equipe2:null,finNuit:true,
          prive:false,impressionAt:new Date().toISOString()});
      }
    });
    onImport(result);
    setSaved(true);
    setTimeout(onClose,800);
  };

  const JOURS_S=["Di","Lu","Ma","Me","Je","Ve","Sa"];
  const totalSaisis=Object.values(jours).filter(v=>v?.equipe).length;

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.7)",zIndex:600,
      display:"flex",alignItems:"center",justifyContent:"center",padding:12,backdropFilter:"blur(4px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:560,
        maxHeight:"92vh",display:"flex",flexDirection:"column",
        boxShadow:"0 24px 60px rgba(0,0,0,.3)",overflow:"hidden"}}>

        {/* Header */}
        <div style={{background:`linear-gradient(135deg,${fam?.color||"#1e293b"},#334155)`,
          padding:"16px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:22}}>📅</span>
          <div style={{flex:1}}>
            <div style={{color:"#fff",fontSize:14,fontWeight:800}}>Saisie du planning</div>
            <div style={{color:"rgba(255,255,255,.6)",fontSize:11}}>{agent?.prenom} {agent?.nom}</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",
            color:"#fff",borderRadius:8,width:28,height:28,cursor:"pointer",fontSize:14}}>✕</button>
        </div>

        {/* Sélecteur mois */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 16px",
          borderBottom:"1px solid #f1f5f9",flexShrink:0,background:"#f8fafc"}}>
          <button onClick={()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);}}
            style={{border:"1px solid #e2e8f0",borderRadius:7,padding:"4px 10px",cursor:"pointer",background:"#fff",fontSize:14}}>‹</button>
          <div style={{flex:1,textAlign:"center",fontWeight:800,fontSize:14,color:"#1e293b"}}>
            {MOIS_L[month]} {year}
          </div>
          <button onClick={()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);}}
            style={{border:"1px solid #e2e8f0",borderRadius:7,padding:"4px 10px",cursor:"pointer",background:"#fff",fontSize:14}}>›</button>
        </div>


        {/* Grille des jours */}
        <div style={{overflowY:"auto",flex:1,padding:"10px 14px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:4}}>
            {JOURS_S.map(d=>(
              <div key={d} style={{textAlign:"center",fontSize:9,fontWeight:700,color:"#94a3b8",padding:"2px 0"}}>{d}</div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
            {Array.from({length:daysList[0]?.dow||0}).map((_,i)=><div key={`e${i}`}/>)}
            {daysList.map(({dk,dow,num})=>{
              const val=jours[dk];
              const eq=val?.equipe?EQUIPES_DISPO.find(e=>e.c===val.equipe):null;
              const hasNuit=val?.equipe2==="N";
              const isFinNuit=val?.finNuit;
              const isWE=dow===0||dow===6;
              return(
                <div key={dk} style={{borderRadius:8,overflow:"hidden",
                  border:`1.5px solid ${val?.equipe?eq?.dot||"#e2e8f0":isFinNuit?"#bfdbfe":"#e2e8f0"}`,
                  background:val?.equipe?eq?.bg:isFinNuit?"#eff6ff":isWE?"#f8fafc":"#fff",
                  minHeight:72,display:"flex",flexDirection:"column"}}>
                  {/* Numéro du jour */}
                  <div style={{textAlign:"center",fontSize:9,fontWeight:700,
                    color:isWE?"#94a3b8":"#1e293b",padding:"2px 0",
                    background:"rgba(0,0,0,.04)"}}>{num}</div>
                  {/* Contenu */}
                  <div style={{padding:"2px 3px",flex:1,display:"flex",flexDirection:"column",gap:2}}>
                    {/* Badge fin de nuit (J+1) */}
                    {isFinNuit&&<div style={{fontSize:7,fontWeight:700,color:"#1e3a8a",
                      background:"#dbeafe",borderRadius:3,padding:"1px 3px",textAlign:"center"}}>
                      🌙 fin nuit
                    </div>}
                    {/* Badge équipe principale */}
                    {val?.equipe&&<div style={{fontSize:7,fontWeight:700,color:eq?.tc,
                      background:eq?.bg,borderRadius:3,padding:"1px 3px",textAlign:"center"}}>
                      {eq?.l||val.equipe}
                    </div>}
                    {/* Badge prise de nuit */}
                    {hasNuit&&<div style={{fontSize:7,fontWeight:700,color:"#1e3a8a",
                      background:"#dbeafe",borderRadius:3,padding:"1px 3px",textAlign:"center"}}>
                      🌙 nuit
                    </div>}
                  </div>
                  {/* Sélecteur équipe */}
                  <select value={val?.equipe||""} onChange={e=>setEquipe(dk,e.target.value||null)}
                    style={{width:"100%",border:"none",borderTop:"1px solid #f1f5f9",
                      background:"transparent",fontSize:8,cursor:"pointer",
                      color:eq?.tc||"#94a3b8",fontWeight:val?.equipe?700:400,
                      outline:"none",padding:"2px 1px"}}>
                    <option value="">—</option>
                    {EQUIPES_DISPO.map(e=><option key={e.c} value={e.c}>{e.l}</option>)}
                  </select>
                  {/* Toggle prise de nuit */}
                  {val?.equipe&&<button onClick={()=>setNuit(dk,!hasNuit)}
                    style={{width:"100%",border:"none",borderTop:"1px solid #f1f5f9",
                      background:hasNuit?"#dbeafe":"#f8fafc",
                      color:hasNuit?"#1e3a8a":"#94a3b8",
                      fontSize:8,cursor:"pointer",padding:"2px 0",fontWeight:hasNuit?700:400}}>
                    {hasNuit?"🌙 nuit ✓":"🌙 +nuit"}
                  </button>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:"12px 16px",borderTop:"1px solid #e2e8f0",
          display:"flex",gap:8,flexShrink:0,background:"#f8fafc"}}>
          <button onClick={onClose}
            style={{flex:1,background:"#f1f5f9",color:"#475569",border:"none",
              borderRadius:10,padding:"11px 0",cursor:"pointer",fontSize:13,fontWeight:700}}>
            Annuler
          </button>
          <button onClick={handleSave} disabled={totalSaisis===0}
            style={{flex:2,background:totalSaisis>0?"#0f4c81":"#e2e8f0",
              color:totalSaisis>0?"#fff":"#94a3b8",border:"none",
              borderRadius:10,padding:"11px 0",cursor:"pointer",fontSize:13,fontWeight:800}}>
            {saved?"✅ Enregistré !":"💾 Enregistrer "+totalSaisis+" jour(s)"}
          </button>
        </div>
      </div>
    </div>
  );
}
// ─── HABILITATIONS ───────────────────────────────────────────────────────────
const NIV_HAB = [
  {code:"HC", label:"Habilité", color:"#0f4c81", textColor:"#fff", dot:"#3b82f6"},
];

// HAB_PRCI : tous les postes PRCI 3×8 + journée
// Code = jsCode du poste (utilisé pour sauvegarder l'habilitation)
// Les postes 3×8 couvrent toutes les équipes M/AM/N — pas de distinction par équipe
const HAB_PRCI = [
  // ── 3×8 ──
  {code:"PICCL", label:"CCL",          subtitle:"Chef Circulation Local",      type:"3x8"},
  {code:"PIADJ", label:"Adj CCL",      subtitle:"Adjoint Chef Circulation",    type:"3x8"},
  {code:"PILNE", label:"AC LNE",       subtitle:"Agent Circulation LNE",       type:"3x8"},
  {code:"PILNO", label:"AC LNO",       subtitle:"Agent Circulation LNO",       type:"3x8"},
  {code:"PILCL", label:"AC LC",        subtitle:"Agent Circulation LC",        type:"3x8"},
  {code:"PIVGD", label:"AC VGD",       subtitle:"Agent Circulation VGD",       type:"3x8"},
  // ── Journée ──
  {code:"PIPA1J", label:"Pauseur CCL", subtitle:"Pauseur CCL · 08h45–18h15",  type:"J"},
  {code:"PIPA2J", label:"Pauseur Adjoint", subtitle:"Pauseur Adjoint · 10h15–19h45",  type:"J"},
  {code:"PIPA3J", label:"Pauseur VGD", subtitle:"Pauseur VGD · 08h45–16h30",  type:"J"},
  {code:"PIDPXJ", label:"DPX PRCI",   subtitle:"DPX PRCI · 08h00–16h45",     type:"J"},
  {code:"PIASSJ", label:"Adj DPX",    subtitle:"Adjoint DPX PRCI",            type:"J"},
  {code:"PPRCI",  label:"PPRCI",        subtitle:"PPRCI · 09h00–16h45",         type:"J"},
  {code:"AFOPRCI",label:"AFO PRCI",     subtitle:"Accompagnateur Formation · 09h00–16h45", type:"J"},
  {code:"A-PRCI", label:"A-PRCI",       subtitle:"Assistant PRCI · 09h00–17h45",               type:"J"},
  {code:"SD%",    label:"SD",           subtitle:"Service Doux · 08h00–16h43",                  type:"J"},
  // Note : CAF, K-PRCI = formations suivies → pas des habilitations
];

// HAB_PAR : tous les postes PAR 3×8 + journée
const HAB_PAR = [
  // ── 3×8 ──
  {code:"PAAC1-", label:"AC PAR",        subtitle:"Agent Circulation PAR",      type:"3x8"},
  {code:"PAAC2-", label:"Aide AC PAR",   subtitle:"Aide Agent Circulation PAR", type:"3x8"},
  {code:"PAACXX", label:"CT AC Travaux", subtitle:"Contrôleur AC Travaux (nuit)",type:"3x8"},
  // ── Journée ──
  {code:"PAPAUJ", label:"Pauseur PAR",   subtitle:"Pauseur PAR · 09h00–17h45",  type:"J"},
  {code:"PADPXJ", label:"DPX PAR",       subtitle:"DPX PAR · 08h00–16h45",      type:"J"},
  {code:"PAASMJ", label:"ASMTE PAR",   subtitle:"ASMTE PAR · 08h00–16h45",          type:"J"},
  {code:"AFO PAR",label:"AFO PAR",     subtitle:"Accompagnateur Formation PAR · 09h00–16h45", type:"J"},
  // Note : K-PAR, F-PAR = formations suivies → pas des habilitations
];

// ── Composant carte poste partagé ─────────────────────────────────────────────
function PosteHabCard({h, isHab, isSug, color, bg, onToggle}){
  return(
    <button onClick={onToggle}
      style={{
        display:"flex",alignItems:"center",gap:12,
        background: isHab ? bg : "#f8fafc",
        border:`2px solid ${isHab ? color : isSug ? "#fde68a" : "#e2e8f0"}`,
        borderRadius:12,padding:"10px 14px",cursor:"pointer",
        textAlign:"left",width:"100%",
        boxShadow: isHab ? `0 2px 8px ${color}33` : "none",
        transition:"all .12s",
      }}>
      {/* Checkbox */}
      <div style={{width:24,height:24,borderRadius:7,flexShrink:0,
        background:isHab?color:"#fff",
        border:`2px solid ${isHab?color:"#e2e8f0"}`,
        display:"flex",alignItems:"center",justifyContent:"center",
        transition:"all .12s",boxShadow:isHab?`0 0 0 3px ${color}22`:"none"}}>
        {isHab&&<span style={{color:"#fff",fontSize:14,fontWeight:900,lineHeight:1}}>✓</span>}
      </div>
      {/* Info */}
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontFamily:"monospace",fontSize:10,fontWeight:800,
            background:isHab?color+"22":"#f1f5f9",
            color:isHab?color:"#64748b",borderRadius:5,padding:"1px 6px"}}>
            {h.code}
          </span>
          <span style={{fontSize:13,fontWeight:isHab?800:600,
            color:isHab?color:"#1e293b"}}>{h.label}</span>
          {isSug&&!isHab&&<span style={{fontSize:8,background:"#fef3c7",
            color:"#92400e",borderRadius:8,padding:"1px 5px",fontWeight:700}}>
            🔍 détecté
          </span>}
        </div>
        {h.subtitle&&h.subtitle!==h.label&&<div style={{
          fontSize:10,color:isHab?color:"#94a3b8",marginTop:2,opacity:.8,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {h.subtitle}
        </div>}
      </div>
      {isHab&&<span style={{background:color,color:"#fff",
        borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700,flexShrink:0}}>
        ✓ Habilité
      </span>}
    </button>
  );
}

function HabilitationsModal({agent,habilitations,onSave,onClose,suggestedPostes}){
  const [hab,setHab]=useState(()=>({...habilitations}));
  const toggle=(code)=>setHab(prev=>{
    const next={...prev};
    if(next[code]) delete next[code]; else next[code]="HC";
    return next;
  });
  const fam=FAMILLES[agent.famille];
  const nbHab=Object.keys(hab).length;
  const groupes=[
    {titre:"PRCI — 3×8",     color:"#0f4c81",bg:"#eff6ff",items:HAB_PRCI.filter(h=>h.type==="3x8")},
    {titre:"PRCI — Journée", color:"#0369a1",bg:"#f0f9ff",items:HAB_PRCI.filter(h=>h.type==="J")},
    {titre:"PAR — 3×8",      color:"#065f46",bg:"#f0fdf4",items:HAB_PAR.filter(h=>h.type==="3x8")},
    {titre:"PAR — Journée",  color:"#047857",bg:"#ecfdf5",items:HAB_PAR.filter(h=>h.type==="J")},
  ];
  // Responsive : centré sur desktop (>640px), bottom-sheet sur mobile
  const isDesktop = typeof window!=="undefined" && window.innerWidth>640;

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.75)",zIndex:400,
      display:"flex",
      alignItems: isDesktop?"center":"flex-end",
      justifyContent:"center",padding:isDesktop?24:0,
      backdropFilter:"blur(6px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>

      <div style={{background:"#fff",
        borderRadius: isDesktop?20:"20px 20px 0 0",
        width:"100%",maxWidth: isDesktop?640:9999,
        maxHeight: isDesktop?"88vh":"92vh",
        display:"flex",flexDirection:"column",
        boxShadow: isDesktop?"0 24px 60px rgba(0,0,0,.25)":"0 -8px 40px rgba(0,0,0,.25)"}}>

        {/* Header */}
        <div style={{background:`linear-gradient(135deg,${fam?.color||"#0f4c81"},#1e40af)`,
          padding:"16px 20px",display:"flex",alignItems:"center",gap:12,
          borderRadius: isDesktop?"20px 20px 0 0":"20px 20px 0 0",flexShrink:0}}>
          <Av initials={agent.initials} size={44} famille={agent.famille}/>
          <div style={{flex:1}}>
            <div style={{color:"#fff",fontSize:15,fontWeight:800}}>Habilitations</div>
            <div style={{color:"rgba(255,255,255,.7)",fontSize:11,marginTop:1}}>
              {agent.prenom} {agent.nom} · {nbHab} poste{nbHab>1?"s":""} habilité{nbHab>1?"s":""}
            </div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.2)",border:"none",
            color:"#fff",borderRadius:10,width:38,height:38,cursor:"pointer",fontSize:20,
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
        </div>

        {/* Postes détectés */}
        {suggestedPostes?.length>0&&<div style={{background:"#fef9c3",
          padding:"8px 16px",borderBottom:"1px solid #fde68a",
          fontSize:11,color:"#92400e",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <span>💡</span>
          <span>Détectés : <strong>{suggestedPostes.slice(0,6).join(", ")}</strong></span>
        </div>}

        {/* Corps scrollable — 2 colonnes sur desktop */}
        <div style={{overflowY:"auto",flex:1,padding:isDesktop?"20px 24px":"14px 16px",
          WebkitOverflowScrolling:"touch"}}>
          <div style={{
            display: isDesktop?"grid":"flex",
            gridTemplateColumns: isDesktop?"1fr 1fr":undefined,
            flexDirection: isDesktop?undefined:"column",
            gap:16,
          }}>
            {groupes.map(g=>(
              <div key={g.titre}>
                <div style={{background:g.bg,borderRadius:10,
                  padding:"7px 12px",marginBottom:8,
                  display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,fontWeight:800,color:g.color}}>{g.titre}</span>
                  <span style={{fontSize:10,color:g.color,opacity:.7}}>
                    {g.items.filter(h=>hab[h.code]).length}/{g.items.length}
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {g.items.map(h=>(
                    <PosteHabCard key={h.code} h={h}
                      isHab={!!hab[h.code]}
                      isSug={suggestedPostes?.includes(h.label)||suggestedPostes?.includes(h.code)}
                      color={g.color} bg={g.bg}
                      onToggle={()=>toggle(h.code)}/>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:"14px 20px",borderTop:"1px solid #e2e8f0",
          display:"flex",gap:8,flexShrink:0,background:"#f8fafc"}}>
          <button onClick={()=>onSave(hab)}
            style={{flex:1,background:"linear-gradient(135deg,#1e293b,#334155)",
              color:"#fff",border:"none",borderRadius:12,padding:"13px 0",
              cursor:"pointer",fontSize:14,fontWeight:800,
              boxShadow:"0 2px 8px rgba(30,41,59,.3)"}}>
            ✓ Enregistrer ({nbHab} habilitation{nbHab>1?"s":""})
          </button>
          <button onClick={onClose}
            style={{background:"#fff",color:"#475569",border:"1.5px solid #e2e8f0",
              borderRadius:12,padding:"13px 18px",cursor:"pointer",fontSize:13,fontWeight:600}}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL HABILITATIONS ROULEMENT ──────────────────────────────────────────
function HabilitationsRoulementModal({agent, habilitations, onSave, onClose}){
  const [hab, setHab] = useState(()=>({...habilitations}));
  const [onglet, setOnglet] = useState("PRCI"); // "PRCI" | "PAR"
  const fam = FAMILLES[agent.famille];

  const toggle = (code) => setHab(prev=>{
    const next = {...prev};
    if(next[code]) delete next[code];
    else next[code] = "HC";
    return next;
  });

  // Tous les postes PRCI et PAR (3×8 + journée ensemble)
  const POSTES = {
    PRCI: [
      // 3×8
      ...POSTES_PRCI_3x8.map(p=>({
        code: p.M?.replace("-",""), label: p.label,
        subtitle: `3×8 · M:${p.M||"—"} AM:${p.AM||"—"} N:${p.N||"—"}`,
        groupe:"3×8", jsCodeM: p.M, jsCodeAM: p.AM, jsCodeN: p.N,
      })),
      // Journée
      ...POSTES_JOURNEE.filter(p=>p.famille==="PRCI"
        // Exclure formations suivies (pas des habilitations) : K-PRCI, A-PRCI, F-PRCI, CAF
        // AFO PRCI = habilitation de formateur → gardé
        && !["F-PRCI","K-PRCI","CAF"].includes(p.jsCode)
      ).map(p=>({
        code: p.jsCode, label: p.label,
        subtitle: `Journée · ${p.horaires||"Variable"}${p.subtitle?" · "+p.subtitle:""}`,
        groupe:"Journée",
      })),
    ],
    PAR: [
      // 3×8
      ...POSTES_PAR_3x8.map(p=>({
        code: p.N||p.M||p.code, label: p.label,
        subtitle: `3×8 · M:${p.M||"—"} AM:${p.AM||"—"} N:${p.N||"—"}`,
        groupe:"3×8",
      })),
      // Journée
      ...POSTES_JOURNEE.filter(p=>p.famille==="PAR"
        // Exclure formations suivies : K-PAR, F-PAR
        // AFO PAR = habilitation de formateur → gardé
        && !["K-PAR","F-PAR"].includes(p.jsCode)
      ).map(p=>({
        code: p.jsCode, label: p.label,
        subtitle: `Journée · ${p.horaires||"Variable"}${p.subtitle?" · "+p.subtitle:""}`,
        groupe:"Journée",
      })),
    ],
  };

  const postesActifs = POSTES[onglet]||[];
  const nbHab = Object.keys(hab).length;
  const nbPRCI = POSTES.PRCI.filter(p=>hab[p.code]).length;
  const nbPAR  = POSTES.PAR.filter(p=>hab[p.code]).length;

  const COLORS = {
    PRCI:{header:"#0f4c81",light:"#eff6ff",text:"#0f4c81",bg3x8:"#dbeafe",bgJ:"#eff6ff"},
    PAR: {header:"#065f46",light:"#f0fdf4",text:"#065f46",bg3x8:"#d1fae5",bgJ:"#ecfdf5"},
  };
  const C = COLORS[onglet];

  // Grouper par 3×8 / Journée
  const groupes3x8 = postesActifs.filter(p=>p.groupe==="3×8");
  const groupesJ   = postesActifs.filter(p=>p.groupe==="Journée");

  const renderPoste = (p) => (
    <PosteHabCard key={p.code} h={p}
      isHab={!!hab[p.code]} isSug={false}
      color={C.header} bg={C.light}
      onToggle={()=>toggle(p.code)}/>
  );

  const isDesktop2 = typeof window!=="undefined" && window.innerWidth>640;

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.75)",zIndex:400,
      display:"flex",
      alignItems:isDesktop2?"center":"flex-end",
      justifyContent:"center",
      padding:isDesktop2?24:0,
      backdropFilter:"blur(6px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>

      <div style={{background:"#fff",
        borderRadius:isDesktop2?20:"20px 20px 0 0",
        width:"100%",maxWidth:isDesktop2?600:9999,
        maxHeight:isDesktop2?"88vh":"92vh",
        display:"flex",flexDirection:"column",
        boxShadow:isDesktop2?"0 24px 60px rgba(0,0,0,.25)":"0 -8px 40px rgba(0,0,0,.25)"}}>

        {/* Header */}
        <div style={{background:`linear-gradient(135deg,${fam?.color||"#1e293b"},#334155)`,
          padding:"16px 20px",display:"flex",alignItems:"center",gap:12,
          borderRadius:isDesktop2?"20px 20px 0 0":"20px 20px 0 0",flexShrink:0}}>
          <Av initials={agent.initials} size={40} famille={agent.famille}/>
          <div style={{flex:1}}>
            <div style={{color:"#fff",fontSize:15,fontWeight:800}}>Postes habilités — Roulement</div>
            <div style={{color:"rgba(255,255,255,.7)",fontSize:11,marginTop:1}}>
              {agent.prenom} {agent.nom} · {nbHab} poste{nbHab>1?"s":""}
            </div>
          </div>
          <button onClick={onClose}
            style={{background:"rgba(255,255,255,.2)",border:"none",color:"#fff",
              borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:18,
              display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        {/* Onglets PRCI / PAR */}
        <div style={{display:"flex",borderBottom:"2px solid #e2e8f0",flexShrink:0}}>
          {["PRCI","PAR"].map(o=>{
            const nb = o==="PRCI" ? nbPRCI : nbPAR;
            const col = COLORS[o];
            const actif = onglet===o;
            return(
              <button key={o} onClick={()=>setOnglet(o)}
                style={{flex:1,border:"none",
                  background: actif ? col.light : "#fff",
                  borderBottom: actif ? `3px solid ${col.header}` : "3px solid transparent",
                  padding:"12px 16px",cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                  marginBottom:-2,
                }}>
                <span style={{fontSize:13,fontWeight:actif?800:500,
                  color: actif ? col.header : "#94a3b8"}}>{o}</span>
                {nb>0&&<span style={{
                  background: actif ? col.header : "#e2e8f0",
                  color: actif ? "#fff" : "#94a3b8",
                  borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:700,
                }}>{nb}</span>}
              </button>
            );
          })}
        </div>

        {/* Corps */}
        <div style={{overflowY:"auto",flex:1,padding:"14px 16px",
          display:"flex",flexDirection:"column",gap:14,
          WebkitOverflowScrolling:"touch"}}>

          {/* 3×8 */}
          {groupes3x8.length>0&&<div>
            <div style={{background:C.bg3x8,borderRadius:8,
              padding:"6px 12px",marginBottom:8,
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:11,fontWeight:800,color:C.header}}>3×8</span>
              <span style={{fontSize:10,color:C.header,opacity:.7}}>
                {groupes3x8.filter(p=>hab[p.code]).length}/{groupes3x8.length}
              </span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {groupes3x8.map(renderPoste)}
            </div>
          </div>}

          {/* Journée */}
          {groupesJ.length>0&&<div>
            <div style={{background:C.bgJ,borderRadius:8,
              padding:"6px 12px",marginBottom:8,
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:11,fontWeight:800,color:C.header}}>Journée</span>
              <span style={{fontSize:10,color:C.header,opacity:.7}}>
                {groupesJ.filter(p=>hab[p.code]).length}/{groupesJ.length}
              </span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {groupesJ.map(renderPoste)}
            </div>
          </div>}
        </div>

        {/* Footer */}
        <div style={{padding:"14px 16px",borderTop:"1px solid #e2e8f0",
          display:"flex",gap:8,flexShrink:0,background:"#f8fafc"}}>
          <button onClick={()=>onSave(hab)}
            style={{flex:1,background:"linear-gradient(135deg,#1e293b,#334155)",
              color:"#fff",border:"none",borderRadius:12,padding:"12px 0",
              cursor:"pointer",fontSize:14,fontWeight:800,
              boxShadow:"0 2px 8px rgba(30,41,59,.3)"}}>
            ✓ Enregistrer ({nbHab} poste{nbHab>1?"s":""})
          </button>
          <button onClick={onClose}
            style={{background:"#fff",color:"#475569",border:"1.5px solid #e2e8f0",
              borderRadius:12,padding:"12px 16px",cursor:"pointer",fontSize:13,fontWeight:600}}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AJOUT AGENT ──────────────────────────────────────────────────────────────
function AddAgentModal({onClose,onAdd}){
  const [form,setForm]=useState({prenom:"",nom:"",grade:"CO5",poste:"CCL",famille:"PRCI"});
  const [aiStep,setAiStep]=useState("choice");
  const handleFile=async(e,isPdf)=>{
    const file=e.target.files[0];if(!file)return;setAiStep("loading");
    const reader=new FileReader();
    reader.onload=async()=>{
      const b64=reader.result.split(",")[1];const mt=isPdf?"application/pdf":file.type;
      try{const res=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,messages:[{role:"user",content:[isPdf?{type:"document",source:{type:"base64",media_type:mt,data:b64}}:{type:"image",source:{type:"base64",media_type:mt,data:b64}},{type:"text",text:`Extrais les infos agent. Retourne UNIQUEMENT JSON: {"prenom":"...","nom":"...","grade":"...","poste":"...","famille":"PRCI ou PAR"}`}]}]})});
      const data=await res.json();const raw=data.content?.map(c=>c.text||"").join("")||"";const parsed=JSON.parse(raw.replace(/```json|```/g,"").trim());setForm(p=>({...p,...parsed}));setAiStep("done");}catch(e){setAiStep("choice");}
    };reader.readAsDataURL(file);
  };
  return(<div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.65)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:420,boxShadow:"0 24px 60px rgba(0,0,0,.25)",overflow:"hidden"}}>
      <div style={{background:"linear-gradient(135deg,#1e293b,#334155)",padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{color:"#fff",fontSize:14,fontWeight:700}}>➕ Nouvel agent</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:8,width:28,height:28,cursor:"pointer",fontSize:14}}>✕</button>
      </div>
      <div style={{padding:20,display:"flex",flexDirection:"column",gap:12}}>
        {aiStep==="loading"&&<div style={{textAlign:"center",padding:"16px 0",color:"#64748b",fontSize:13}}>⏳ Lecture…</div>}
        {aiStep==="done"&&<div style={{background:"#d1fae5",borderRadius:9,padding:9,fontSize:12,color:"#065f46",fontWeight:600}}>✅ Informations détectées</div>}
        {aiStep==="choice"&&<div style={{display:"flex",gap:8}}>
          <label style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:5,border:"1.5px dashed #cbd5e1",borderRadius:9,padding:"9px",cursor:"pointer",fontSize:12,color:"#64748b",fontWeight:600}}>📷 Photo<input type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e,false)}/></label>
          <label style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:5,border:"1.5px dashed #cbd5e1",borderRadius:9,padding:"9px",cursor:"pointer",fontSize:12,color:"#64748b",fontWeight:600}}>📄 PDF<input type="file" accept=".pdf" style={{display:"none"}} onChange={e=>handleFile(e,true)}/></label>
        </div>}
        {[{k:"prenom",l:"Prénom"},{k:"nom",l:"Nom"},{k:"grade",l:"Grade"}].map(f=>(<div key={f.k}><div style={{fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3}}>{f.l.toUpperCase()}</div><input value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 9px",fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>))}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><div style={{fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3}}>GRADE</div><input value={form.grade} onChange={e=>setForm(p=>({...p,grade:e.target.value}))} placeholder="ex: CO5, CP4NIV1..." style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 8px",fontSize:13,outline:"none"}}/></div>
          <div><div style={{fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3}}>FAMILLE</div><select value={form.famille} onChange={e=>setForm(p=>({...p,famille:e.target.value}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 8px",fontSize:13,outline:"none"}}><option value="PRCI">PRCI</option><option value="PAR">PAR</option></select></div>
          <div><div style={{fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:3}}>POSTE</div><select value={form.poste} onChange={e=>setForm(p=>({...p,poste:e.target.value}))} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 8px",fontSize:13,outline:"none"}}>{[...POSTES_PRCI_3x8,...POSTES_PAR_3x8].map(p=>(<option key={p.code} value={p.label}>{p.label}</option>))}</select></div>
        </div>
        <button onClick={()=>{if(!form.prenom||!form.nom)return;const id=`N${Date.now()}`;onAdd({...form,id,initials:form.prenom[0]+(form.nom.replace(/[\s-]/g,"")[0]||"")});onClose();}} disabled={!form.prenom||!form.nom} style={{background:form.prenom&&form.nom?"#1e293b":"#e2e8f0",color:form.prenom&&form.nom?"#fff":"#94a3b8",border:"none",borderRadius:9,padding:"11px 0",cursor:form.prenom&&form.nom?"pointer":"not-allowed",fontSize:13,fontWeight:700}}>✓ Ajouter</button>
      </div>
    </div>
  </div>);
}


// ─── AUTHENTIFICATION ────────────────────────────────────────────────────────
// CPs admin par défaut (à personnaliser)

// Trouver un agent par CP dans AGENTS_INIT
function findAgentByCP(CP) {
  return AGENTS_INIT.find(a =>
    a.immatriculation === CP ||
    a.immatriculation?.toUpperCase() === CP?.toUpperCase()
  );
}

// Page de connexion
// Saisie PIN à 4 chiffres : UN SEUL champ invisible superposé sur 4 cases
// visuelles (au lieu de 4 <input> séparés qui se repassent le focus).
// C'est l'approche déjà utilisée pour "Changer mon PIN" (PinModal) : elle
// évite que le clavier virtuel mobile se ferme/rouvre à chaque chiffre
// (plus de changement de focus entre champs), et Entrée fonctionne nativement
// puisqu'il n'y a qu'un seul input.
// IMPORTANT : ce composant doit rester defini au niveau racine du module
// (pas a l'interieur de LoginPage) — sinon React le recree a chaque frappe
// (nouvelle reference de fonction = nouveau "type" de composant pour la
// reconciliation), ce qui detruit et recree le vrai <input> DOM a chaque
// caractere : perte de focus, et sur mobile fermeture du clavier virtuel.
// onComplete ne se declenche JAMAIS automatiquement a la saisie du 4e chiffre
// (pas de connexion "surprise" sans action explicite) : uniquement via Entree
// (onKeyDown) ou le bouton. Exception : autoAdvance=true fait avancer le focus
// vers le champ suivant (pas une connexion, juste une navigation).
function PinInput({arr, setArr, label, inputRef, onComplete, error, setError, autoAdvance}) {
  const cursorPos = Math.min(arr.filter(Boolean).length, 3);
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
      <div style={{fontSize:11,color:"#64748b",fontWeight:600}}>{label}</div>
      <style>{`@keyframes pinCursorBlink{0%,49%{opacity:1}50%,100%{opacity:0}}`}</style>
      <div style={{display:"flex",gap:10,position:"relative"}} onClick={()=>inputRef.current?.focus()}>
        <input ref={inputRef} type="tel" inputMode="numeric" maxLength={4}
          value={arr.join("")}
          onChange={e=>{
            const digits=e.target.value.replace(/\D/g,"").slice(0,4);
            const next=["","","",""];
            digits.split("").forEach((d,i)=>{next[i]=d;});
            setArr(next);
            setError?.("");
            if(digits.length===4&&autoAdvance&&onComplete) setTimeout(()=>onComplete(digits),100);
          }}
          onKeyDown={e=>{
            // Ne pas compter sur la soumission implicite native du <form> au
            // clavier (peu fiable selon navigateur/OS) : on gere Entree nous-
            // memes et on bloque le comportement natif pour eviter un double
            // declenchement.
            if(e.key==="Enter"){
              e.preventDefault();
              if(arr.every(d=>d)&&onComplete) onComplete(arr.join(""));
            }
          }}
          style={{position:"absolute",opacity:0,width:"100%",height:"100%",top:0,left:0,zIndex:1,fontSize:16}}
          autoComplete="off"/>
        {[0,1,2,3].map(i=>(
          <div key={i} style={{width:48,height:56,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:800,position:"relative",
            border:`2px solid ${error?"#ef4444":i===cursorPos?"#0f4c81":arr[i]?"#0891b2":"#e2e8f0"}`,
            boxShadow:i===cursorPos?"0 0 0 3px rgba(15,76,129,.15)":"none",
            borderRadius:10,background:arr[i]?"#f0fdff":"#fff",
            transition:"border-color .15s, box-shadow .15s",cursor:"pointer"}}>
            {arr[i]?"●":(i===cursorPos&&<div style={{width:2,height:26,background:"#0f4c81",animation:"pinCursorBlink 1s step-start infinite"}}/>)}
          </div>
        ))}
      </div>
    </div>
  );
}

const REMEMBER_CP_KEY = "f2ppmp_remembered_cp";

function LoginPage({ onLogin }) {
  const [step, setStep] = useState("login"); // "login" | "first_time" | "forgot"
  const [CP, setCP] = useState("");
  const [pin, setPin] = useState(["","","",""]);
  const [pinConfirm, setPinConfirm] = useState(["","","",""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const cpRef=useRef();
  const pinFieldRef=useRef();
  const newPinFieldRef=useRef();
  const confirmPinFieldRef=useRef();

  const pinStr = pin.join("");
  const confStr = pinConfirm.join("");

  // Focus automatique sur le premier champ au montage, et sur le nouveau PIN
  // quand on bascule vers la creation de compte. Si un CP a ete memorise
  // (case "se souvenir de moi"), on le pre-remplit et on va direct au PIN.
  useEffect(()=>{
    let remembered;
    try { remembered = localStorage.getItem(REMEMBER_CP_KEY); } catch { remembered = null; }
    if(remembered){
      setCP(remembered);
      setRememberMe(true);
      pinFieldRef.current?.focus();
    } else {
      cpRef.current?.focus();
    }
  },[]);
  useEffect(()=>{ if(step==="first_time") newPinFieldRef.current?.focus(); },[step]);

const handleLogin = async (pinOverride) => {
    const usedPin = pinOverride ?? pinStr;
    if (!CP || usedPin.length !== 4) return;
    setError("");
    setLoading(true);
    try {
      const mat = CP.trim().toUpperCase();
      const { token, agent } = await api.auth.login(mat, usedPin);
      try {
        if(rememberMe) localStorage.setItem(REMEMBER_CP_KEY, mat);
        else localStorage.removeItem(REMEMBER_CP_KEY);
      } catch {}
      onLogin({ agent: {...agent, id: agent.cp, immatriculation: agent.cp}, isAdmin: agent.is_admin, isAfo: agent.is_afo });
    } catch(e) {
      if(e.message?.includes("429") || e.message?.includes("Trop")) {
        setError("Trop de tentatives. Attendez quelques minutes.");
      } else if(e.message?.includes("première") || e.message?.includes("PIN")) {
        setStep("first_time");
      } else {
        setError(e.message || "CP ou PIN incorrect");
      }
    }
    setLoading(false);
  };

  const handleFirstTime = async (confirmOverride) => {
    const usedConf = confirmOverride ?? confStr;
    if (pinStr.length < 4) { setError("4 chiffres requis"); return; }
    if (pinStr !== usedConf) { setError("Les codes ne correspondent pas"); return; }
    const mat = CP.trim().toUpperCase();
    try {
      const { token, agent } = await api.auth.register(mat, pinStr);
      try {
        if(rememberMe) localStorage.setItem(REMEMBER_CP_KEY, mat);
        else localStorage.removeItem(REMEMBER_CP_KEY);
      } catch {}
      onLogin({ agent: {...agent, id: agent.cp, immatriculation: agent.cp}, isAdmin: agent.is_admin, isAfo: agent.is_afo });
    } catch(e) {
      // Réserve régionale : l'auto-enregistrement est bloqué côté serveur
      // (18/08, demande d'Olivier — "seul un admin donne accès"). On ramène
      // l'agent à l'écran de connexion normal plutôt que de le laisser sur un
      // formulaire de création de PIN qui échouera toujours, pour ne pas
      // donner l'impression qu'il suffit de réessayer.
      if(e.message?.includes("administrateur")){
        setStep("login");
        setPin(["","","",""]);
        setPinConfirm(["","","",""]);
        setError(e.message);
        return;
      }
      setError(e.message || "Erreur connexion");
    }
  };

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f4c81 0%,#1e3a8a 50%,#064e3b 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box}`}</style>
      <div style={{background:"#fff",borderRadius:24,width:"100%",maxWidth:400,boxShadow:"0 32px 80px rgba(0,0,0,.35)",overflow:"hidden"}}>

        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#0f4c81,#1e3a8a)",padding:"28px 24px",textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:8}}>🚄</div>
          <div style={{color:"#fff",fontSize:24,fontWeight:800,letterSpacing:-.5}}>F2P.PMP</div>
          <div style={{color:"rgba(255,255,255,.6)",fontSize:12,marginTop:4,letterSpacing:1}}>PRCI · PAR · PMP</div>
        </div>

        <div style={{padding:"28px 24px",display:"flex",flexDirection:"column",gap:20}}>

          {/* CONNEXION NORMALE */}
          {step === "login" && (
          <form onSubmit={e=>{
            e.preventDefault();
            if(CP && pinStr.length===4 && !loading) handleLogin();
            else if(CP) pinFieldRef.current?.focus();
          }} style={{display:"flex",flexDirection:"column",gap:20}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:800,color:"#1e293b"}}>Connexion</div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>Entre ton CP et ton code PIN</div>
            </div>

            <div>
              <input ref={cpRef} value={CP} onChange={e=>{setCP(e.target.value.toUpperCase());setError("");}}
                placeholder="CP SNCF"
                onKeyDown={e=>{
                  if(e.key==="Enter"){
                    e.preventDefault();
                    if(CP&&pinStr.length===4&&!loading) handleLogin();
                    else pinFieldRef.current?.focus();
                  }
                }}
                style={{width:"100%",border:"2px solid #e2e8f0",borderRadius:10,padding:"11px 14px",fontSize:14,fontFamily:"'DM Mono',monospace",fontWeight:700,outline:"none",letterSpacing:2,textAlign:"center",boxSizing:"border-box"}}/>
            </div>

            <PinInput arr={pin} setArr={setPin} inputRef={pinFieldRef} label="CODE PIN (4 chiffres)" onComplete={(p)=>handleLogin(p)} error={error} setError={setError}/>

            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#64748b",cursor:"pointer",userSelect:"none"}}>
              <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)} style={{width:15,height:15,cursor:"pointer"}}/>
              Se souvenir de mon CP sur cet appareil
            </label>

            {error && <div style={{background:"#fee2e2",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#991b1b",fontWeight:600,textAlign:"center"}}>{error}</div>}

            <button type="submit" disabled={!CP||pinStr.length!==4||loading}
              style={{background:CP&&pinStr.length===4?"#0f4c81":"#e2e8f0",color:CP&&pinStr.length===4?"#fff":"#94a3b8",border:"none",borderRadius:12,padding:"14px 0",cursor:CP&&pinStr.length===4?"pointer":"not-allowed",fontSize:14,fontWeight:800,transition:"all .15s"}}>
              {loading?"Connexion…":"Se connecter →"}
            </button>

            <div style={{textAlign:"center",fontSize:11,color:"#94a3b8"}}>
              Première connexion ? Entre ton CP et ton PIN sera créé.
            </div>
          </form>
          )}

          {/* PREMIÈRE CONNEXION */}
          {step === "first_time" && (
          <form onSubmit={e=>{
            e.preventDefault();
            if(pinStr.length!==4){ newPinFieldRef.current?.focus(); return; }
            if(confStr.length!==4){ confirmPinFieldRef.current?.focus(); return; }
            handleFirstTime();
          }} style={{display:"flex",flexDirection:"column",gap:20}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:800,color:"#1e293b"}}>Première connexion</div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>CP : <strong style={{color:"#0f4c81",fontFamily:"monospace"}}>{CP}</strong></div>
              {AGENTS_INIT.find(a=>a.immatriculation?.toUpperCase()===CP.trim().toUpperCase())&&(
                <div style={{fontSize:12,color:"#065f46",marginTop:4,fontWeight:600}}>
                  ✓ {AGENTS_INIT.find(a=>a.immatriculation?.toUpperCase()===CP.trim().toUpperCase())?.prenom} {AGENTS_INIT.find(a=>a.immatriculation?.toUpperCase()===CP.trim().toUpperCase())?.nom}
                </div>
              )}
            </div>

            <div style={{background:"#eff6ff",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#1e40af"}}>
              🔐 Choisis un code PIN à <strong>4 chiffres</strong>. Il protégera ton planning personnel (RP, congés…). Note-le quelque part.
            </div>

            <PinInput arr={pin} setArr={setPin} inputRef={newPinFieldRef} label="NOUVEAU CODE PIN" onComplete={()=>confirmPinFieldRef.current?.focus()} error={error} setError={setError} autoAdvance/>
            <PinInput arr={pinConfirm} setArr={setPinConfirm} inputRef={confirmPinFieldRef} label="CONFIRME TON CODE PIN" onComplete={(c)=>handleFirstTime(c)} error={error} setError={setError}/>

            {error && <div style={{background:"#fee2e2",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#991b1b",fontWeight:600,textAlign:"center"}}>{error}</div>}

            <button type="submit" disabled={pinStr.length<4||confStr.length<4}
              style={{background:pinStr.length===4&&confStr.length===4?"#065f46":"#e2e8f0",color:pinStr.length===4&&confStr.length===4?"#fff":"#94a3b8",border:"none",borderRadius:12,padding:"14px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>
              ✓ Créer mon compte
            </button>

            <button type="button" onClick={()=>{setStep("login");setPin(["","","",""]);setPinConfirm(["","","",""]);setError("");}}
              style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,textAlign:"center"}}>
              ← Retour
            </button>
          </form>
          )}

        </div>
      </div>
    </div>
  );
}

// Modale "Connexion requise" — accès au profil d'un autre agent depuis le
// sélecteur de profil. Vérifie le CP+PIN via le vrai flux api.auth.login
// (comme LoginPage), pas via un mécanisme de hash local.
// Panneau de gestion des comptes (admin)
// DEAD_CODE_REMOVED_MARKER (ancien AdminAuthPanel, remplace par toggle admin reel dans AdminPanel.jsx)
export default function App(){
  // ── PERSISTANCE & ÉTATS ───────────────────────────────────────────────────
  const [view,setView]=usePersist("view","personal");
  // Mode sombre (19/08, demandé par Olivier — "garder l'organisation
  // actuelle, juste habillée autrement") : préférence liée à l'appareil
  // (localStorage), pas au compte agent — cohérent avec un réglage
  // d'affichage plutôt qu'une donnée métier. Applique data-theme sur <html>,
  // lu par les tokens CSS de theme.css.
  const [themeMode,setThemeMode]=usePersist("themeMode","light");
  useEffect(()=>{document.documentElement.setAttribute("data-theme",themeMode);},[themeMode]);
  // Historique de navigation interne (18/08, demandé par Olivier — sur un
  // téléphone où l'appli est lancée depuis un raccourci d'écran d'accueil,
  // il n'y a pas de vrai historique de navigateur : le geste "retour" natif
  // ferme l'appli entière au lieu de revenir à l'écran précédent, "l'icone
  // est juste un raccourci"). Pile perso (pas liée à l'historique du
  // navigateur), volontairement non persistée — repart à zéro après un
  // rechargement complet, jugé raisonnable. "dans les 2 sens" (Olivier) :
  // une pile arrière ET une pile avant, comme back/forward d'un navigateur —
  // toute nouvelle navigation (menu, lien croisé) vide la pile avant.
  const [viewBackStack,setViewBackStack]=useState([]);
  const [viewForwardStack,setViewForwardStack]=useState([]);
  const navigateToView=(newView)=>{
    if(newView===view) return;
    setViewBackStack(s=>[...s,view]);
    setViewForwardStack([]);
    setView(newView);
  };
  const goBackView=()=>{
    setViewBackStack(s=>{
      if(!s.length) return s;
      const prev=s[s.length-1];
      setViewForwardStack(f=>[...f,view]);
      setView(prev);
      return s.slice(0,-1);
    });
  };
  const goForwardView=()=>{
    setViewForwardStack(s=>{
      if(!s.length) return s;
      const next=s[s.length-1];
      setViewBackStack(b=>[...b,view]);
      setView(next);
      return s.slice(0,-1);
    });
  };
  const [agents,setAgents]=usePersist("agents",AGENTS_INIT);
  const [currentAgent,setCurrentAgent]=useState(null);
  const [weekOffset,setWeekOffset]=useState(0);
  const [menuOpen,setMenuOpen]=useState(false);
  const [schedule,setSchedule]=usePersist("schedule",{});
  const [cpsSchedule,setCpsSchedule]=usePersist("cpsSchedule",{});
  const [cpsAleas,setCpsAleas]=usePersist("cpsAleas",[]);
  const [previsionnelSignalements,setPrevisionnelSignalements]=usePersist("previsionnelSignalements",[]);
  const [journeeSpecialeNotes,setJourneeSpecialeNotes]=usePersist("journeeSpecialeNotes",[]);
  const [previsionnelSchedule,setPrevisionnelSchedule]=usePersist("previsionnelSchedule",{});
  const [agentProfiles,setAgentProfiles]=usePersist("agentProfiles",{});
  const [importDPTarget,setImportDPTarget]=useState(null);
  const [addAgentOpen,setAddAgentOpen]=useState(false);
  const [notifications,setNotifications]=usePersist("notifications",[]);
  const [departDates,setDepartDates]=usePersist("departDates",{});
  // ── AUTH ──────────────────────────────────────────────────────────────────
  const [currentUser,setCurrentUser]=usePersist("currentUser",null);
  // Agents dont le profil a été effectivement rechargé depuis le serveur cette session.
  // Tant qu'un agent n'y figure pas, l'autosave du profil (ci-dessous) reste bloquée pour lui :
  // sinon, au chargement de la page, agentProfiles contient encore l'ancien snapshot localStorage
  // (potentiellement périmé) le temps que api.profil.get() réponde, et l'autosave renverrait ce
  // snapshot périmé au serveur avant que la vraie donnée à jour n'ait eu le temps d'arriver.
  const profilLoadedRef = useRef(new Set());
  // 04/08 : si les 3 tentatives de chargement du profil (login, focus, effet de
  // login) echouent toutes (couac reseau/DB), profilLoadedRef ne se remplit
  // jamais et l'autosave ci-dessous reste bloquee EN SILENCE pour le reste de
  // la session - l'agent peut modifier ses compteurs autant qu'il veut, rien
  // ne part jamais au serveur, sans le moindre message (vecu par Olivier :
  // deco/reco sur 2 appareils, toujours bloque). Ce ref evite de spammer
  // plusieurs alertes si les 3 tentatives echouent presque en meme temps.
  const profilLoadFailAlertedRef = useRef(false);
  const signalerEchecChargementProfil = () => {
    if(profilLoadFailAlertedRef.current) return;
    profilLoadFailAlertedRef.current = true;
    alert("⚠️ Impossible de charger ton profil (problème réseau ou serveur). Tes compteurs ne pourront pas être enregistrés tant que la page n'est pas rechargée — recharge la page dès que possible avant de faire une modification.");
  };
  // Miroir synchrone d'agentProfiles, lisible depuis un callback async (.then)
  // sans closure périmée — sert à détecter si un changement local a eu lieu
  // PENDANT qu'un fetch profil était en vol (voir les 3 sites api.profil.get
  // ci-dessous, correctif race condition du 17/07 : une réponse de lecture
  // périmée ne doit jamais écraser une modification locale plus récente).
  const agentProfilesRef = useRef(agentProfiles);
  useEffect(()=>{ agentProfilesRef.current = agentProfiles; },[agentProfiles]);
  // Charger les agents depuis l'API (source de verite = Railway) - seulement si connecte
    const rechargerAgents = () => {
    api.agents.getAll().then(rows=>{
      if(!rows||rows.length===0) return;
      const mapped=rows.map(r=>({
        id: r.cp,
        immatriculation: r.cp,
        nom: r.nom,
        prenom: r.prenom,
        grade: r.grade,
        poste: r.poste||"",
        fam: r.famille||"PRCI",
        famille: r.famille||"PRCI",
        is_admin: !!r.is_admin,
        is_afo: !!r.is_afo,
      }));
      setAgents(mapped);
      // Synchroniser le statut admin ET afo de l'utilisateur connecte : une
      // promotion/retrait fait par un autre admin ne doit pas attendre une
      // reconnexion pour faire apparaitre/disparaitre l'onglet Admin/le
      // module Gestion Formation.
      const myId = currentUser?.agent?.immatriculation||currentUser?.agent?.cp||currentUser?.agent?.id;
      const me = mapped.find(a=>a.id===myId);
      if(me) setCurrentUser(prev=>{
        if(!prev) return prev;
        if(prev.isAdmin===me.is_admin && prev.isAfo===me.is_afo && prev.agent?.famille===me.famille) return prev;
        return {...prev,isAdmin:me.is_admin,isAfo:me.is_afo,agent:{...prev.agent,famille:me.famille}};
      });
      // famille (21/08, correctif AY) : la réponse de connexion (login/register,
      // authController.issueSession) n'a jamais renvoyé ce champ -- currentAgent
      // (posé une seule fois à la connexion interactive, jamais repeuplé ensuite)
      // pouvait donc rester famille-less indéfiniment pour une session déjà
      // ouverte. Comme rechargerAgents() tourne déjà toutes les 45s ET juste
      // après le login, ce correctif s'applique tout seul, sans reconnexion --
      // exactement ce qu'Olivier demande ("le calcul se refasse automatiquement").
      if(me) setCurrentAgent(prev=>(prev&&prev.id===me.id&&prev.famille!==me.famille)?{...prev,famille:me.famille}:prev);
    }).catch(e=>console.error("Erreur chargement agents:",e));
  };
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    rechargerAgents();
  },[currentUser?.agent?.id]); // eslint-disable-line
  // Verification periodique des agents (synchro entre appareils, toutes les 45s)
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    const interval = setInterval(()=>{ rechargerAgents(); }, 45000);
    return ()=>clearInterval(interval);
  },[currentUser?.agent?.id]); // eslint-disable-line

  const [echangesOuvertesCount,setEchangesOuvertesCount]=useState(0);
  // echangesOuvertesIds (24/08) : liste des id, pas juste le total -- permet
  // au bandeau "Echanges" (PersonalView) de retenir la fermeture PAR demande
  // precise plutot que par simple nombre. Bug corrige : avec un compteur nu,
  // fermer le bandeau une fois qu'une demande X est ouverte le cachait POUR
  // TOUJOURS tant que le nombre total ne redepassait pas ce chiffre -- meme
  // des semaines plus tard, avec cette meme demande X toujours ouverte et
  // jamais cloturee (signale par Olivier : "je le vois pas sur le compte
  // test... sur mon tel", alors qu'une vraie demande etait bien ouverte).
  const [echangesOuvertesIds,setEchangesOuvertesIds]=useState([]);
  const rechargerEchangesCount=()=>{
    if(!currentUser?.agent?.id) return;
    api.echanges.getAll().then(rows=>{
      const ouvertes=(rows||[]).filter(r=>r.statut==="ouverte");
      setEchangesOuvertesCount(ouvertes.length);
      setEchangesOuvertesIds(ouvertes.map(r=>r.id));
    }).catch(()=>{});
  };
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    rechargerEchangesCount();
    const echInterval=setInterval(rechargerEchangesCount,45000);
    return ()=>clearInterval(echInterval);
  },[currentUser?.agent?.id]); // eslint-disable-line

  // Recharge le planning de l'agent visualisé quand un admin bascule sur un autre agent,
  // et continue à l'actualiser toutes les 45s tant que cet agent est affiché
  // (le chargement initial dans handleLogin ne couvre que l'agent réellement connecté)
  useEffect(()=>{
    if(!currentAgent) return;
    const agId = currentAgent.immatriculation||currentAgent.cp||currentAgent.id;
    const myId = currentUser?.agent?.immatriculation||currentUser?.agent?.cp||currentUser?.agent?.id;
    if(!agId||agId===myId) return;
    const chargerPlanningVisualise=()=>{
      api.planning.getSchedule(agId).then(entries=>{
        if(entries) setSchedule(prev=>reconcileSchedule(prev, agId, entries));
      }).catch(()=>{});
    };
    chargerPlanningVisualise();
    const interval=setInterval(chargerPlanningVisualise,45000);
    return ()=>clearInterval(interval);
  },[currentAgent]); // eslint-disable-line
  
  const isAdmin=currentUser?.isAdmin||false;
  const isAfo=currentUser?.isAfo||false;


  const handleLogin=(user)=>{
    setCurrentUser(user);
    setCurrentAgent(user.agent);
    setView("personal");const agentId = user.agent.immatriculation || user.agent.cp || user.agent.id;
    api.planning.getSchedule(agentId).then(entries=>{
      // Railway gagne toujours sur le localStorage
      if(entries) setSchedule(prev=>reconcileSchedule(prev, agentId, entries));
    }).catch(()=>{});

    const snapshotAvantFetchLogin = agentProfilesRef.current[agentId];
    api.profil.get(agentId).then(p=>{
    if(p){
      if(agentProfilesRef.current[agentId] !== snapshotAvantFetchLogin){
        profilLoadedRef.current.add(agentId);
        return; // un changement local plus recent a eu lieu pendant le fetch -> reponse perimee ignoree
      }
      // 04/08 : le merge etait bloque par erreur derriere "if(p.habilitations)" -
      // un agent sans habilitations (habilitations:null cote serveur) ne
      // recevait donc JAMAIS le reste de son profil (compteurs compris) a la
      // connexion, contrairement aux 2 autres effets de rechargement (focus,
      // login) qui n'ont pas ce garde. Fusion desormais inconditionnelle,
      // habilitations normalisee comme dans les 2 autres effets.
      setAgentProfiles(prev=>({...prev,[agentId]:{
        ...(prev[agentId]||{}),
        ...p,
        habilitations: Array.isArray(p.habilitations) ? Object.fromEntries((p.habilitations||[]).map(h=>[h.code_poste,'HC'])) : (p.habilitations||{}),
      }}));
    }
    profilLoadedRef.current.add(agentId);
  }).catch(e=>{
    console.error('Erreur chargement profil (login):', e);
    signalerEchecChargementProfil();
  });
  };
  const handleLogout=()=>{
    setCurrentUser(null);
    setCurrentAgent(null);
  };
  // Ecoute l'expiration de session (declenchee par client.js sur un 401) et deconnecte avec message clair
  useEffect(()=>{
    let alertDejaAffiche=false;
    const onUnauthorized=()=>{
      if(alertDejaAffiche) return;
      alertDejaAffiche=true;
      alert("Votre session a expire. Merci de vous reconnecter.");
      handleLogout();
    };
    window.addEventListener('f2ppmp:unauthorized', onUnauthorized);
    return ()=>window.removeEventListener('f2ppmp:unauthorized', onUnauthorized);
  },[]);

  // Nettoyage archives > 3 ans
  useEffect(()=>{ setSchedule(prev=>cleanOldEntries(prev)); },[]);

  // ── SYNC AU FOCUS (multi-appareils) ──────────────────────────────────────────
  // Quand l'agent revient sur l'appli (depuis un autre onglet ou appareil),
  // on recharge ses données depuis Supabase pour refléter les dernières modifications
  useEffect(()=>{
    const handleFocus = () => {
      if(!currentUser?.agent?.id) return;
      const agentId = currentUser.agent.immatriculation || currentUser.agent.cp || currentUser.agent.id;
      // Recharger profil
      const snapshotAvantFetchFocus = agentProfilesRef.current[agentId];
      api.profil.get(agentId).then(profile=>{
        if(!profile) return;
        if(agentProfilesRef.current[agentId] !== snapshotAvantFetchFocus){
          profilLoadedRef.current.add(agentId);
          return; // changement local pendant le fetch -> reponse perimee ignoree
        }
        setAgentProfiles(prev=>({...prev,[agentId]:{
          ...(prev[agentId]||{}),
          ...profile,
          habilitations: Array.isArray(profile.habilitations) ? Object.fromEntries((profile.habilitations||[]).map(h=>[h.code_poste,'HC'])) : (profile.habilitations||{}),
        }}));
        // Restaurer acquittements
        if(profile.notificationsAcquittees?.length){
          setNotifications(prev=>prev.map(n=>
            profile.notificationsAcquittees.includes(n.id)?{...n,acquitte:true}:n
          ));
        }
        profilLoadedRef.current.add(agentId);
      }).catch(e=>{
        console.error('Erreur chargement profil (focus):', e);
        signalerEchecChargementProfil();
      });
      // Recharger planning
      api.planning.getSchedule(agentId).then(entries=>{
        if(entries) setSchedule(prev=>reconcileSchedule(prev, agentId, entries));
      });
    };
    window.addEventListener('focus', handleFocus);
    // Aussi sur visibilitychange (mobile : retour depuis une autre app)
    const handleVisible = () => { if(document.visibilityState==='visible') handleFocus(); };
    document.addEventListener('visibilitychange', handleVisible);
    return ()=>{
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  },[currentUser?.agent?.id]); // eslint-disable-line

  // Charger le planning depuis Supabase au login
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    const agentId = currentUser.agent.immatriculation || currentUser.agent.cp || currentUser.agent.id;
    // Charger le profil
    const snapshotAvantFetchLoginEffect = agentProfilesRef.current[agentId];
    api.profil.get(agentId).then(profile=>{
      if(!profile) return;
      if(agentProfilesRef.current[agentId] !== snapshotAvantFetchLoginEffect){
        profilLoadedRef.current.add(agentId);
        return; // changement local pendant le fetch -> reponse perimee ignoree
      }
      setAgentProfiles(prev=>({...prev,[agentId]:{
        ...(prev[agentId]||{}),
        ...profile,
        habilitations: profile.habilitations||{},
      }}));
      // Restaurer les notifications acquittées sur cet appareil
      if(profile.notificationsAcquittees?.length){
        setNotifications(prev=>prev.map(n=>
          profile.notificationsAcquittees.includes(n.id)
            ? {...n, acquitte:true} : n
        ));
      }
      profilLoadedRef.current.add(agentId);
    }).catch(e=>{
      console.error('Erreur chargement profil (effet login):', e);
      signalerEchecChargementProfil();
    });
    // Charger le planning
    api.planning.getSchedule(agentId).then(entries=>{
      if(!entries) return;
      setSchedule(prev=>reconcileSchedule(prev, agentId, entries));
    });
  },[currentUser?.agent?.id]); // eslint-disable-line
  // Charger le planning CPS officiel (partage entre tous les agents), et le
  // rafraichir toutes les 45s pour que les imports faits sur un autre appareil
  // se propagent automatiquement, sans attendre une reconnexion.
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    const chargerCps=()=>{
      api.cps.getSchedule().then(entries=>{
        if(!entries) return;
        // 04/08 : instantane complet (pas de from/to) -> remplacement direct,
        // voir commentaire jumeau dans annulerDernierImport ci-dessus.
        setCpsSchedule(entries);
      }).catch(e=>console.error("Erreur chargement CPS:",e));
    };
    chargerCps();
    const interval=setInterval(chargerCps,45000);
    return ()=>clearInterval(interval);
  },[currentUser?.agent?.id]); // eslint-disable-line
  // Charger les aleas CPS (echanges, erreurs, postes non tenus)
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    api.cpsAleas.getAll().then(rows=>{
      setCpsAleas(rows||[]);
    }).catch(e=>console.error("Erreur chargement aleas CPS:",e));
  },[currentUser?.agent?.id]); // eslint-disable-line
  // Rafraichir le previsionnel partage quand le planning perso change (debounce 1.5s)
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    const timer = setTimeout(()=>{
      api.planning.getAllPublic().then(entries=>{
        if(entries) setPrevisionnelSchedule(entries);
      }).catch(e=>console.error("Erreur rafraichissement previsionnel:",e));
    }, 1500);
    return ()=>clearTimeout(timer);
  },[schedule]); // eslint-disable-line
  // Charger les signalements du planning previsionnel (resolution automatique cote backend)
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    api.previsionnelSignalements.getAll().then(rows=>{
      setPrevisionnelSignalements(rows||[]);
    }).catch(e=>console.error("Erreur chargement signalements previsionnel:",e));
  },[currentUser?.agent?.id]); // eslint-disable-line
  // Charger les messages publics Journee speciale (chargement journee speciale notes)
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    api.journeeSpecialeNotes.getAll().then(rows=>{
      setJourneeSpecialeNotes(rows||[]);
    }).catch(e=>console.error("Erreur chargement notes journee speciale:",e));
  },[currentUser?.agent?.id]); // eslint-disable-line
  // Charger le planning previsionnel partage (planning perso public de tous les agents)
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    api.planning.getAllPublic().then(entries=>{
      if(!entries) return;
      setPrevisionnelSchedule(entries);
    }).catch(e=>console.error("Erreur chargement planning previsionnel:",e));
  },[currentUser?.agent?.id]); // eslint-disable-line


  // Sauvegarder le profil dans Supabase quand il change
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    const agentId = currentUser.agent.immatriculation || currentUser.agent.cp || currentUser.agent.id;
    // Tant que le profil n'a pas été rechargé depuis le serveur pour cet agent dans cette
    // session, agentProfiles[agentId] peut encore être l'ancien snapshot localStorage — ne
    // pas le renvoyer au serveur, sous peine d'écraser des données plus récentes enregistrées
    // depuis un autre appareil (voir profilLoadedRef).
    if(!profilLoadedRef.current.has(agentId)) return;
    const profile = agentProfiles[agentId];
    // 04/08 : cet appel etait fire-and-forget, sans aucune gestion d'erreur - un
    // echec (couac reseau/DB, deja arrive plusieurs fois sur ce projet) etait
    // totalement silencieux : la modif reste visible en optimiste a l'ecran mais
    // n'atteint jamais le serveur, et disparait au rechargement suivant sans le
    // moindre signal (vecu par Olivier : ajustement TC ledger jamais enregistre).
    // Couvre TOUS les compteurs (RP/RU/RQ/RN/TY/TC/VT/Conges/Fetes...), donc le
    // plus critique des points de sauvegarde silencieux du projet a corriger.
    if(profile) api.profil.save(agentId, profile).catch(e=>{
      console.error('Erreur sauvegarde profil:', e);
      alert("⚠️ Une modification de tes compteurs n'a pas pu être enregistrée (problème réseau ?). Réessaie l'action dans quelques instants — sinon elle sera perdue au prochain rechargement.\n\nErreur : "+e.message);
    });
  },[agentProfiles]);

  // ── RAPPEL CONGÉS PROTOCOLAIRES ─────────────────────────────────────────────
  // Injecte une notif de rappel le 20 janvier (1er rappel) et 15 février (dernier rappel)
  // Identifiée par une clé unique année+type+agent pour éviter les doublons
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    const agentId = currentUser.agent.immatriculation || currentUser.agent.cp || currentUser.agent.id;
    const now = new Date();
    const month = now.getMonth()+1;
    const day   = now.getDate();
    const year  = now.getFullYear();

    const rappels = [];
    // 1er rappel : du 20 janvier au 14 février inclus
    if((month===1&&day>=20)||(month===2&&day<=14)){
      rappels.push({
        id:`protocole-rappel1-${year}-${agentId}`,
        type:"protocole",
        agentId,
        titre:"\ud83d\udcc5 Congés protocolaires — à programmer",
        message:`Pensez à programmer vos congés protocolaires avant le 28 février ${year}.`,
        couleur:"#f59e0b",borderCouleur:"#fde68a",bgCouleur:"#fffbeb",textCouleur:"#92400e",
        acquitte:false,
      });
    }
    // Dernier rappel : du 15 au 28 février inclus
    if(month===2&&day>=15){
      rappels.push({
        id:`protocole-rappel2-${year}-${agentId}`,
        type:"protocole",
        agentId,
        titre:"\u26a0\ufe0f DERNIER RAPPEL — Congés protocolaires",
        message:`Date limite : 28 février ${year}. Programmez vos congés protocolaires avant cette date.`,
        couleur:"#dc2626",borderCouleur:"#fca5a5",bgCouleur:"#fff1f2",textCouleur:"#991b1b",
        acquitte:false,
      });
    }
    if(rappels.length===0) return;
    setNotifications(prev=>{
      const existingIds = new Set(prev.map(n=>n.id));
      const nouveaux = rappels.filter(r=>!existingIds.has(r.id));
      if(nouveaux.length===0) return prev;
      return [...nouveaux,...prev];
    });
  },[currentUser?.agent?.id]); // eslint-disable-line

  // ── RAPPEL RELIQUATS CONGÉS ANNUELS ─────────────────────────────────────────
  // Le 10 octobre : si l'agent n'a pas 28 CA programmés pour l'année en cours,
  // notif indiquant le nombre de CA restants à prendre avant le 31 décembre.
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    const agentId = currentUser.agent.immatriculation || currentUser.agent.cp || currentUser.agent.id;
    const now = new Date();
    const month = now.getMonth()+1;
    const day   = now.getDate();
    const year  = now.getFullYear();

    // Actif du 10 octobre au 31 décembre
    if(!(month===10&&day>=10) && !(month===11) && !(month===12)) return;

    // Compter les CA programmés dans le planning pour l'année en cours
    // CA = code equipe "CA" + jours des demandes de congés (CA/CP) programmés
    const prefix = agentId + "-" + year;
    let caPlanning = 0;
    Object.entries(schedule).forEach(([k,v])=>{
      if(!k.startsWith(agentId+"-")) return;
      const dk = k.slice(agentId.length+1);
      if(!dk.startsWith(String(year))) return;
      if(v?.equipe==="CA") caPlanning++;
    });

    // Compter aussi les demandes de congés via le formulaire (statut DEMANDE ou ACCORDE)
    const demandes = agentProfiles[agentId]?.demandesConges||[];
    let caFormulaire = 0;
    demandes.forEach(d=>{
      if(!d.debut1) return;
      if(!d.debut1.startsWith(String(year))) return;
      // Compter uniquement si la nature est Congé Annuel
      if((d.nature||"").includes("Annuel")||(d.nature||"").includes("annuel")){
        caFormulaire += d.nb_jours||0;
      }
    });

    const totalCA = Math.max(caPlanning, caFormulaire);
    const QUOTA = 28;
    const restant = QUOTA - totalCA;

    if(restant <= 0) return; // Quota atteint, pas de notif

    const notifId = `reliquats-ca-${year}-${agentId}`;
    setNotifications(prev=>{
      const existingIds = new Set(prev.map(n=>n.id));
      if(existingIds.has(notifId)) return prev;
      return [{
        id: notifId,
        type: "reliquats",
        agentId,
        titre: "⚠️ Reliquats de congés annuels à programmer",
        message: `Au 31 octobre ${year}, il vous reste ${restant} jour${restant>1?"s":""} de congés annuels à prendre avant le 31 décembre ${year}. Pensez à les programmer rapidement.`,
        restant,
        year,
        couleur:"#ea580c",
        borderCouleur:"#fed7aa",
        bgCouleur:"#fff7ed",
        textCouleur:"#c2410c",
        acquitte:false,
      }, ...prev];
    });
  },[currentUser?.agent?.id, schedule, agentProfiles]); // eslint-disable-line

  // Ref pour chargement initial
  const loadedRef = useRef({});

  // Hooks qui doivent être avant tout return conditionnel
  const handleImportSchedule=useCallback((agentId,jours)=>{
    setSchedule(prev=>{
      const next={...prev};
      jours.forEach(j=>{
        const existing=next[`${agentId}-${j.date}`];
        if(!existing||!existing.impressionAt||(j.impressionAt&&j.impressionAt>existing.impressionAt)){
          next[`${agentId}-${j.date}`]={
            equipe:j.equipe, equipe2:j.equipe2||null, finNuit:j.finNuit||false,
            horaires:EQ[j.equipe]?.heures||"", poste:j.jsCode||"",
            jsCode:j.jsCode||"", prive:j.prive||false, impressionAt:j.impressionAt||null,
          };
        }
      });
      return next;
    });
  },[]);

  // Nettoyage auto agents absents > 1 an
  useMemo(()=>{
    const cutoff=new Date();cutoff.setFullYear(cutoff.getFullYear()-1);
    const cutStr=cutoff.toISOString().slice(0,10);
    const toDelete=Object.entries(departDates).filter(([,d])=>d<=cutStr).map(([id])=>id);
    if(toDelete.length>0){
      setTimeout(()=>{
        setAgents(prev=>prev.filter(a=>!toDelete.includes(a.id)));
        setDepartDates(prev=>{const n={...prev};toDelete.forEach(id=>delete n[id]);return n;});
        setCurrentAgent(prev=>prev&&toDelete.includes(prev.id)?null:prev);
      },0);
    }
  },[departDates]);

  // Redirection si non connecté
  if(!currentUser) return <LoginPage onLogin={handleLogin}/>;

  // Charger les données Supabase si pas encore fait (au premier rendu après login)
  if(currentUser?.agent?.id && !loadedRef.current[currentUser.agent.id]){
    loadedRef.current[currentUser.agent.id] = true;
    const agentId = currentUser.agent.immatriculation || currentUser.agent.cp || currentUser.agent.id;
    api.planning.getSchedule(agentId).then(entries=>{
      if(entries) setSchedule(prev=>reconcileSchedule(prev, agentId, entries));
    });
  }



  const handleFetePaye=(agentId,date,code,paye)=>{
    setSchedule(prev=>{const next={...prev};const key=`${agentId}-${date}`;if(next[key])next[key]={...next[key],fetePaye:paye};return next;});
  };

  const myAgentId = currentUser.agent.immatriculation || currentUser.agent.cp || currentUser.agent.id;
  const nbFormationsNonVues = (agentProfiles[myAgentId]?.formationNotifications||[]).filter(n=>!n.acquitte).length;
  // Rappele apres une action qui ecrit dans le planning d'un tiers ou du soi
  // (Module Formation) — reutilise reconcileSchedule comme partout ailleurs.
  const refreshMonSchedule = ()=>{
    api.planning.getSchedule(myAgentId).then(entries=>{
      if(entries) setSchedule(prev=>reconcileSchedule(prev, myAgentId, entries));
    }).catch(()=>{});
  };
  // Idem pour le profil : le backend du module Formation peut ecrire
  // directement dans profil_agent.donnees_json d'un agent (ex: notification
  // d'inscription a une session AFO) sans passer par le flux normal
  // agentProfiles -> api.profil.save() de cet agent. Si l'agent AFO est
  // lui-meme participant, sa propre session reste avec un ancien instantane
  // local tant qu'elle n'est pas rafraichie -- et le prochain autosave
  // generique renverrait cet instantane perime, effacant l'ecriture backend
  // (JSON_MERGE_PATCH remplace un tableau entier, pas de fusion element par
  // element). Meme garde anti-course que handleFocus (comparaison de
  // snapshot) pour ne pas ecraser un changement local plus recent.
  const refreshMonProfil = ()=>{
    const snapshotAvant = agentProfilesRef.current[myAgentId];
    api.profil.get(myAgentId).then(profile=>{
      if(!profile) return;
      if(agentProfilesRef.current[myAgentId] !== snapshotAvant) return;
      setAgentProfiles(prev=>({...prev,[myAgentId]:{
        ...(prev[myAgentId]||{}),
        ...profile,
        habilitations: Array.isArray(profile.habilitations) ? Object.fromEntries((profile.habilitations||[]).map(h=>[h.code_poste,'HC'])) : (profile.habilitations||{}),
      }}));
    }).catch(()=>{});
  };

  const VIEWS=[
    {k:"personal",l:"📊 Mon planning"},
    {k:"global",  l:"📋 CPS Officiel"},
    {k:"previsionnel", l:"\u{1F4C5} Planning Prévisionnel"},
    {k:"echanges",l:"🔄 Échanges"},
    {k:"annuaire",l:(<><svg width="15" height="15" viewBox="0 0 24 24" fill="#D22B2B" style={{verticalAlign:"-2px",marginRight:2}}><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.57 1 1 0 0 1-.24 1.01l-2.21 2.21z"/></svg> Annuaire</>)},
    {k:"conges",l:"🗓️ Demande de congés"},
    {k:"cetPdfs",l:"🏦 CET"},
    {k:"d2i",l:"✊ D2I"},
    {k:"fim",l:"🗂️ Fiche Individuelle"},
    {k:"formation",l:`🎓 Formation${nbFormationsNonVues>0?` 🔔${nbFormationsNonVues}`:""}`},
    {k:"statsEquipe", l:"📊 Stat'Equip"},
    {k:"profil",  l:"👤 Mon profil"},
    ...(isAdmin ? [{k:"admin", l:"\u{1F451} Admin"}] : [])
  ];

  return(<div style={{minHeight:"100vh",background:"var(--bg-page)",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;}button:hover{opacity:.85;}`}</style>

    {/* ── HEADER ── */}
    <div style={{background:"var(--bg-card)",borderBottom:"1.5px solid var(--border)",
      position:"sticky",top:0,zIndex:50,
      boxShadow:"0 1px 6px rgba(0,0,0,.06)"}}>

      {/* Ligne 1 : Logo + actions */}
      <div style={{maxWidth:1100,margin:"0 auto",
        display:"flex",alignItems:"center",gap:8,
        height:48,padding:"0 12px"}}>
        <button onClick={()=>setMenuOpen(true)} style={{border:"none",background:"none",cursor:"pointer",padding:6,marginRight:2,flexShrink:0,display:"flex",alignItems:"center"}}>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            <div style={{width:18,height:2,background:"var(--text-primary)",borderRadius:1}}/>
            <div style={{width:18,height:2,background:"var(--text-primary)",borderRadius:1}}/>
            <div style={{width:18,height:2,background:"var(--text-primary)",borderRadius:1}}/>
          </div>
        </button>

        {/* Navigation ← / → interne (18/08, Olivier — sur un raccourci
            d'écran d'accueil mobile, le geste "retour" natif ferme l'appli
            au lieu de revenir à l'écran précédent, faute de vrai historique
            de navigateur). Visibles seulement quand la pile correspondante
            n'est pas vide. */}
        {(viewBackStack.length>0||viewForwardStack.length>0)&&<div style={{display:"flex",alignItems:"center",gap:2,flexShrink:0}}>
          <button onClick={goBackView} disabled={!viewBackStack.length} title="Écran précédent"
            style={{border:"none",background:viewBackStack.length?"#f1f5f9":"transparent",
              cursor:viewBackStack.length?"pointer":"default",padding:"6px 8px",borderRadius:7,
              display:"flex",alignItems:"center",opacity:viewBackStack.length?1:.3}}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="#334155"><path fillRule="evenodd" d="M12.79 4.22a.75.75 0 0 1 0 1.06L8.06 10l4.73 4.72a.75.75 0 1 1-1.06 1.06l-5.25-5.25a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd"/></svg>
          </button>
          <button onClick={goForwardView} disabled={!viewForwardStack.length} title="Écran suivant"
            style={{border:"none",background:viewForwardStack.length?"#f1f5f9":"transparent",
              cursor:viewForwardStack.length?"pointer":"default",padding:"6px 8px",borderRadius:7,
              display:"flex",alignItems:"center",opacity:viewForwardStack.length?1:.3}}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="#334155"><path fillRule="evenodd" d="M7.21 4.22a.75.75 0 0 1 1.06 0l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 0 1-1.06-1.06L11.94 10 7.21 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/></svg>
          </button>
        </div>}

        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <div style={{width:28,height:28,background:"linear-gradient(135deg,#0f4c81,#1e3a5f)",
            borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:14}}>🚄</span>
          </div>
          <div style={{lineHeight:1}}>
            <div style={{fontSize:12,fontWeight:800,color:"var(--brand-text)",letterSpacing:-.3}}>F2P.PMP</div>
            <div style={{fontSize:7,color:"var(--brand-subtitle)",letterSpacing:.4,fontFamily:"monospace"}}>PRCI · PAR</div>
          </div>
        </div>

        <div style={{flex:1}}/>

        {/* Mode sombre (19/08) — toggle par appareil, indépendant du compte.
            Essai limité à "Mon planning" + panneau compteurs pour l'instant
            (voir CLAUDE.md) : les autres vues gardent leur fond clair tant
            que les tokens n'y sont pas encore appliqués. */}
        <button onClick={()=>setThemeMode(m=>m==="dark"?"light":"dark")}
          title={themeMode==="dark"?"Passer en mode clair":"Passer en mode sombre"}
          style={{border:"1px solid var(--border)",background:"var(--bg-card)",
            borderRadius:7,padding:"5px 7px",cursor:"pointer",fontSize:13,
            display:"flex",alignItems:"center",flexShrink:0}}>
          {themeMode==="dark"?"☀️":"🌙"}
        </button>

        {/* Admin badges — masqués sur très petit écran */}
        {isAdmin&&<div style={{display:"flex",alignItems:"center",gap:4}}>
          <div style={{background:"#fff8e1",border:"1px solid #fde68a",borderRadius:6,
            padding:"2px 6px",fontSize:9,fontWeight:700,color:"#92400e"}}>👑</div>

        </div>}

      </div>

      {/* Ligne 2 : Onglets navigation — pleine largeur, scrollable */}
      <div style={{borderTop:"1px solid var(--border)",overflowX:"hidden"}}>
        <div style={{display:"flex",width:"100%",
          padding:"0 6px",gap:2}}>
          {VIEWS.filter(v=>["personal","previsionnel","global"].includes(v.k)).map(({k,l})=>{
            const actif = view===k;
            return(
              <button key={k} onClick={()=>navigateToView(k)}
                style={{
                  border:"none",background:"transparent",
                  padding:"9px 6px",cursor:"pointer",flex:1,minWidth:0,
                  fontSize:"clamp(11px,1.6vw,15px)",fontWeight:700,
                  color:actif?"var(--accent-active)":"var(--text-secondary)",
                  borderBottom:actif?"2.5px solid var(--accent-active)":"2.5px solid transparent",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",position:"relative",
                  letterSpacing:actif?-.1:0,
                  transition:"color .15s",
                }}>
                {l}
              </button>
            );
          })}
        </div>
      </div>
    </div>

    {menuOpen&&<div style={{position:"fixed",inset:0,zIndex:300,display:"flex"}}>
      <div onClick={()=>setMenuOpen(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,.4)"}}/>
      {/* Largeur passee de 260 a 288px le 18/08 (Olivier : "plannig
          orevisionnel et d2i sont un peu coupé depuis un ordi sur le
          lateral") -- "Planning Prévisionnel" et "D2I" (pavés du menu)
          étaient marginaux à 260px (repassaient sur 2 lignes selon le
          rendu des polices), 288px donne de la marge sans dépasser
          80vw sur mobile (maxWidth déjà en place). */}
      <div style={{position:"relative",width:288,maxWidth:"80vw",height:"100%",background:"var(--bg-card)",boxShadow:"4px 0 24px rgba(0,0,0,.15)",display:"flex",flexDirection:"column",padding:"16px 0",overflowY:"auto"}}>
        <div style={{padding:"0 16px 12px",borderBottom:"1px solid var(--border)",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:14,fontWeight:800,color:"var(--brand-text)"}}>F2P.PMP</div>
          <button onClick={()=>setMenuOpen(false)} style={{border:"none",background:"none",cursor:"pointer",fontSize:18,color:"var(--brand-subtitle)",padding:4}}>×</button>
        </div>
        {/* Menu réorganisé en 2 pavés + reste trié (15/08, demandé par Olivier
            — "sur le meme principa tu va metre le perso, cps et previonnelle
            dans un groupe appelés les planning [...] tu les met en haut
            suivi des generateur de pdf. le reste va en bas avec tri en
            ordres alphabetique. mon profil avant dernier et admin reste en
            dernier"). "Planning" (pas "Agenda") retenu — cohérent avec le
            vocabulaire déjà utilisé partout ailleurs dans l'appli (Mon
            planning, Planning Prévisionnel, planning perso...).
            - Pavé "Planning" (Mon planning / CPS Officiel / Planning
              Prévisionnel, accent bleu #0f4c81) en premier.
            - Pavé "Générateurs PDF" (Congés / CET, accent ambre) juste après
              — même principe visuel que le pavé Planning, voir 14-15/08.
            - Le reste, trié alphabétiquement (Annuaire, Échanges, Formation)
              en items plats, comme avant.
            - "Mon profil" avant-dernier, "Admin" toujours en tout dernier
              (déjà conditionné à isAdmin dans VIEWS). */}
        {(() => {
          const byKey = k => VIEWS.find(v => v.k === k);
          // 24/08, bug reel signale par Olivier ("dans le lateral ca bug sur la
          // version ordi, je vois plus le previsionnel et l'intitule planning
          // est ecrase") : "overflow:hidden" sur ce conteneur (jamais
          // fonctionnellement necessaire -- le contenu est toujours cense
          // tenir exactement dans sa hauteur naturelle, jamais deborder) se
          // heurtait a un bug de rendu navigateur reel et reproductible --
          // confirme en conditions reelles (measure DOM) : le conteneur se
          // figeait a une hauteur calculee pour MOINS d'elements que ceux
          // reellement rendus (ex: pave "Planning" a 3 boutons mesure a la
          // hauteur de ~2.2, scrollHeight=159 mais hauteur reelle=116 --
          // meme symptome sur "Generateurs PDF", 4 boutons, jamais touche par
          // le reste de la session -- confirme un bug structurel preexistant,
          // pas quelque chose introduit par les changements DISPO/JEQ du
          // jour). Retirer "overflow:hidden" (jamais indispensable ici, le
          // padding de 4px autour des boutons les tient deja loin des coins
          // arrondis) resout le probleme a la racine, verifie directement en
          // DOM avant ce correctif.
          const renderPave = (key, label, icon, accentColor, accentBg, keys) => (
            <div key={key} style={{ margin: "8px 12px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 1px 2px rgba(15,23,42,.05)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 12px 9px", borderBottom: "1px solid var(--border)" }}>
                {icon}
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: .7, textTransform: "uppercase" }}>{label}</span>
              </div>
              <div style={{ padding: 4 }}>
                {keys.map(k => {
                  const v = byKey(k);
                  if (!v) return null;
                  const actif = view === k;
                  return (
                    <button key={k} onClick={() => { navigateToView(k); setMenuOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, border: "none",
                        background: actif ? accentBg : "transparent",
                        padding: "10px 8px", cursor: "pointer", fontSize: 14,
                        fontWeight: actif ? 700 : 500, color: actif ? accentColor : "var(--text-primary)",
                        textAlign: "left", width: "100%", borderRadius: 7,
                      }}>
                      {v.l}
                    </button>
                  );
                })}
              </div>
            </div>
          );
          const renderFlat = k => {
            const v = byKey(k);
            if (!v) return null;
            const actif = view === k;
            const aDesEchanges = k === "echanges" && echangesOuvertesCount > 0;
            return (<button key={k} onClick={() => { navigateToView(k); setMenuOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, border: "none", background: actif ? "#eff6ff" : (aDesEchanges ? "#fef3c7" : "transparent"), padding: "12px 16px", cursor: "pointer", fontSize: 14, fontWeight: actif ? 700 : 500, color: actif ? "#0f4c81" : "var(--text-primary)", textAlign: "left", width: "100%" }}>
              {v.l}
              {aDesEchanges && <span style={{ marginLeft: "auto", background: "#f59e0b", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{echangesOuvertesCount}</span>}
            </button>);
          };
          // Trié alphabétiquement (Annuaire, Échanges, Formation), fixe : 3
          // entrées seulement, pas besoin d'un tri générique sur des libellés
          // JSX (Annuaire porte une icône, pas un simple texte).
          const REST_KEYS = ["annuaire", "echanges", "formation", "statsEquipe"];
          return (
            <>
              {renderPave("planning-group", "Planning",
                <svg width="14" height="14" viewBox="0 0 20 20" style={{fill:"var(--brand-text)"}}><path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd"/></svg>,
                "#0f4c81", "#eff6ff", ["personal", "global", "previsionnel"])}
              {renderPave("pdf-group", "Générateurs PDF",
                <svg width="14" height="14" viewBox="0 0 20 20" fill="#b45309">
                  <path d="M4 3a1 1 0 0 1 1-1h5.586a1 1 0 0 1 .707.293l3.414 3.414a1 1 0 0 1 .293.707V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3Z"/>
                  <path fill="#fff" d="M11 2.5V6a1 1 0 0 0 1 1h3.5L11 2.5Z"/>
                </svg>,
                "#b45309", "#fdf6ec", ["conges", "cetPdfs", "d2i", "fim"])}
              {REST_KEYS.map(renderFlat)}
              {renderFlat("profil")}
              {isAdmin && renderFlat("admin")}
            </>
          );
        })()}
        <div style={{flex:1}}/>
        <button onClick={()=>{setMenuOpen(false);handleLogout();}} style={{display:"flex",alignItems:"center",gap:10,border:"none",borderTop:"1px solid var(--border)",background:"transparent",padding:"14px 16px",cursor:"pointer",fontSize:14,fontWeight:600,color:"#ef4444",textAlign:"left",width:"100%"}}>
          Déconnexion
        </button>
      </div>
    </div>}
    {/* CONTENU */}
    <div style={{maxWidth:1100,margin:"0 auto",padding:"14px"}}>
      {view==="global"&&<GlobalView agents={agents} schedule={cpsSchedule} setSchedule={setCpsSchedule} cpsAleas={cpsAleas} setCpsAleas={setCpsAleas} currentAgent={currentAgent||currentUser?.agent} weekOffset={weekOffset} setWeekOffset={setWeekOffset} previsionnelSignalements={[]} setPrevisionnelSignalements={()=>{}} journeeSpecialeNotes={journeeSpecialeNotes} setJourneeSpecialeNotes={setJourneeSpecialeNotes}
        onImport={ag=>{setCurrentAgent(ag);setImportDPTarget(ag);}}
        onAddAgent={()=>setAddAgentOpen(true)}
        onRemoveAgent={ag=>{if(window.confirm(`Supprimer ${ag.prenom} ${ag.nom} ?`))setAgents(p=>p.filter(a=>a.id!==ag.id));}}
        isAdmin={isAdmin}
        notifications={notifications} setNotifications={setNotifications}
        currentAgentId={currentAgent?.immatriculation||currentAgent?.cp||currentAgent?.id}/>}
      {view==="personal"&&<PersonalView
        agent={currentAgent||currentUser?.agent}
        schedule={schedule} setSchedule={setSchedule}
        onImportDP={setImportDPTarget}
        agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles}
        onFetePaye={handleFetePaye}
        onDepart={(id)=>setDepartDates(prev=>({...prev,[id]:TODAY}))}
        departDates={departDates}
        isAdmin={isAdmin}
        currentUser={currentUser}
        echangesCount={echangesOuvertesCount}
        echangesOuvertesIds={echangesOuvertesIds}
        onOpenEchanges={()=>navigateToView("echanges")}
        onOpenFormation={()=>navigateToView("formation")}/>}
      {view==="echanges"&&<EchangesView agents={agents} currentAgent={currentAgent||currentUser?.agent}/>}
  {view==="annuaire"&&<AnnuaireView currentAgent={currentAgent||currentUser?.agent} isAdmin={isAdmin} agents={agents} cpsSchedule={cpsSchedule} cpsAleas={cpsAleas}/>}
  {view==="conges"&&<DemandeCongesView currentAgent={currentAgent||currentUser?.agent} agentProfiles={agentProfiles}/>}
  {view==="cetPdfs"&&<CetPdfsView currentAgent={currentAgent||currentUser?.agent} agentProfiles={agentProfiles}/>}
  {view==="d2i"&&<D2iView currentAgent={currentAgent||currentUser?.agent} agentProfiles={agentProfiles}/>}
  {view==="fim"&&<FimPdfView currentAgent={currentAgent||currentUser?.agent} agentProfiles={agentProfiles} schedule={schedule}/>}
  {view==="formation"&&<FormationView currentAgent={currentAgent||currentUser?.agent} currentUser={currentUser} agents={agents} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} refreshSchedule={refreshMonSchedule} refreshProfil={refreshMonProfil}/>}
  {view==="statsEquipe"&&<StatsEquipeView/>}
      {view==="profil"&&<ProfilPersoView currentAgent={currentAgent||currentUser?.agent} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} onPartageChange={(val)=>{setCurrentUser(prev=>prev?{...prev,agent:{...prev.agent,partage_previsionnel:val}}:prev);setCurrentAgent(prev=>prev?{...prev,partage_previsionnel:val}:prev);api.planning.getAllPublic().then(entries=>{if(entries)setPrevisionnelSchedule(entries);}).catch(()=>{});}}/>}
      {view==="previsionnel"&&<GlobalView agents={agents} schedule={previsionnelSchedule} setSchedule={setPrevisionnelSchedule} cpsAleas={[]} setCpsAleas={()=>{}} currentAgent={currentAgent||currentUser?.agent} weekOffset={weekOffset} setWeekOffset={setWeekOffset} onImport={()=>{}} onAddAgent={()=>{}} onRemoveAgent={()=>{}} isAdmin={isAdmin} isPrevisionnel={true} previsionnelSignalements={previsionnelSignalements} setPrevisionnelSignalements={setPrevisionnelSignalements} journeeSpecialeNotes={journeeSpecialeNotes} setJourneeSpecialeNotes={setJourneeSpecialeNotes}/>}
      {view==="admin"&&<AdminPanel currentUser={currentUser} onAgentsChanged={rechargerAgents}/>}
    </div>

    {/* MODALS */}
      {importDPTarget&&<ImportDeroulement agent={importDPTarget} onClose={()=>setImportDPTarget(null)} onImport={jours=>handleImportSchedule(importDPTarget.id,jours)}/>}
    {addAgentOpen&&<AddAgentModal onClose={()=>setAddAgentOpen(false)} onAdd={ag=>{setAgents(p=>[...p,ag]);}}/>}
  </div>);
}
