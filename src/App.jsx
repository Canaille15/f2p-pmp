import React from "react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import api, { convertirCodePosteVersJsCode } from "./api/client";
import AdminPanel from "./components/AdminPanel";
import AgentHeader from "./components/AgentHeader";
import DayEditPopup from "./components/DayEditPopup";
import DemandeCongesView from "./components/DemandeCongesView";


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
  PRCI:{ label:"PRCI PMP",        color:"#0f4c81", accent:"#3b82f6", light:"#eff6ff" },
  PAR: { label:"PAR LGV Réserve", color:"#064e3b", accent:"#10b981", light:"#ecfdf5" },
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
const EQUIPES = [
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
  { code:"RQ",   label:"RQ",         heures:"",            color:"#ca8a04", textColor:"#fff", dot:"#fef9c3", prive:true,  compteur:"RU",      bg:"#ca8a04" },
  { code:"TC",   label:"TC",         heures:"",            color:"#0284c7", textColor:"#fff", dot:"#e0f2fe", prive:true,  compteur:"TC",      bg:"#0284c7" },
  { code:"TY",   label:"TY",         heures:"",            color:"#0284c7", textColor:"#fff", dot:"#e0f2fe", prive:true,  compteur:"TC",      bg:"#0284c7" },
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
  ...Object.keys(CODES_FETES).map(k=>({ code:k, label:k, heures:"", color:"#ec4899", textColor:"#fff", dot:"#fce7f3", prive:true, compteur:"FETE", bg:"#ec4899" })),
];
const EQ = Object.fromEntries(EQUIPES.map(e=>[e.code,e]));

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

async function ocrImageViaOcrSpace(imageB64, mimeType) {
  const form = new URLSearchParams();
  form.append("apikey", BULLETIN_OCR_APIKEY);
  form.append("base64Image", "data:" + mimeType + ";base64," + imageB64);
  form.append("filetype", "Auto");
  form.append("OCREngine", "2");
  form.append("isTable", "true");
  const res = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: form });
  const data = await res.json();
  if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage?.[0] || "Erreur OCR");
  return data.ParsedResults?.map(r => r.ParsedText).join("\n") || "";
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
    const rows = {};
    tcontent.items.forEach(it => {
      const y = Math.round(it.transform[5]);
      if (!rows[y]) rows[y] = [];
      rows[y].push({ x: it.transform[4], s: it.str });
    });
    const ys = Object.keys(rows).map(Number).sort((a, b) => b - a);
    const lines = ys.map(y => rows[y].sort((a, b) => a.x - b.x).map(o => o.s).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean);
    pages.push(lines.join("\n"));
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
function getPosteLabelFromCode(jsCode) {
  if (!jsCode) return null;
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
  const year = parseInt(annee, 10);

  const normaliseNum = n => n.replace(/[Ii]/g, "1").replace(/[Ss]/g, "5");
  const normaliseCode = c => {
    if (!c) return null; c = c.trim();
    c = c.replace(/\bHP\b/g, "RP");
    c = c.replace(/P[IO][CO][CO]L/g, "PICCL");
    c = c.replace(/ccx/gi, "PICCLX"); c = c.replace(/^(F-)\s+/, "$1");
    return c || null;
  };
  const getHoraires = eq => {
    const e = EQ[eq];
    if (!e?.heures) return { heure_debut: null, heure_fin: null };
    const mh = e.heures.match(/(\d{2})h(\d{2}).(\d{2})h(\d{2})/);
    if (!mh) return { heure_debut: null, heure_fin: null };
    return { heure_debut: `${mh[1]}:${mh[2]}:00`, heure_fin: `${mh[3]}:${mh[4]}:00` };
  };

  // Séparer les deux blocs au séparateur "___"
  const sepIdx = text.search(/_{6,}/);
  const sepEnd = sepIdx >= 0 ? text.indexOf("\n", sepIdx) : -1;
  const texteBloc1 = sepEnd > 0 ? text.slice(0, sepEnd) : text;
  const texteBloc2 = sepEnd > 0 ? text.slice(sepEnd) : "";

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
  const ord1 = detectOrdre(text, MOIS_BLOC1);
  const ord2 = detectOrdre(text, MOIS_BLOC2);

  const ABBR_FROM_DAY = ["Di","Lu","Ma","Me","Je","Ve","Sa"];
  const buildCandidates = (moisSet, ordre) => {
    const map = {};
    for (const mm of moisSet) {
      const daysInMonth = new Date(year, parseInt(mm, 10), 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, parseInt(mm, 10) - 1, day);
        const abbr = ABBR_FROM_DAY[d.getDay()];
        const key = `${abbr}_${day}`;
        if (!map[key]) map[key] = [];
        map[key].push(mm);
      }
    }
    for (const key in map) {
      map[key].sort((a, b) => {
        const ia = ordre.indexOf(a), ib = ordre.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
    }
    return map;
  };
  const cmap1 = buildCandidates(MOIS_BLOC1, ord1);
  const cmap2 = buildCandidates(MOIS_BLOC2, ord2);

  const DAY_ABBRS = new Set(["Je","Ve","Sa","Di","Lu","Ma","Me"]);
  const CODE_VALID = /^(RPP|RP|RU|RQ|CA|C|DISPO|F[0-9V]|F-[A-Z]{2,}|PI[A-Z0-9-]{2,}|PA[A-Z0-9-]{2,})$/;
  const SPECIAL = new Set(["RPP","RP","RU","RQ","CA","C","DISPO"]);
  const DAY_RE = /(Je|Ve|Va|Sa|Di|Dl|Lu|Ma|Me)\s+(\d+|[IiSs5])(?:\s+([A-Z][A-Z0-9-]+)(?:\s+([A-Z][A-Z0-9-]+))?)?/g;

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
      const mm = candidates[idx];

      const c1 = normaliseCode(c1Raw);
      if (!c1 || DAY_ABBRS.has(c1) || !CODE_VALID.test(c1)) continue;

      const day = String(dayNum).padStart(2, "0");
      const dateJour = `${annee}-${mm}-${day}`;
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
            for (const mm3 of cands3) {
              const dateJour3 = `${annee}-${mm3}-${String(dayNum3).padStart(2,"0")}`;
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
  const [result, setResult] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy(true); setResult(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const b64 = reader.result.split(",")[1];
        let text = "";
        if (file.type === "application/pdf") {
          text = await extraireTextePdfNatif(b64);
          if (!text || text.replace(/\s/g, "").length < 30) {
            // PDF scanné sans texte natif -> fallback OCR page par page
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
            const raw = atob(b64); const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
            const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
            const texts = [];
            for (let n = 1; n <= pdf.numPages; n++) {
              const page = await pdf.getPage(n);
              const viewport = page.getViewport({ scale: 3.0 });
              const canvas = document.createElement("canvas");
              canvas.width = viewport.width; canvas.height = viewport.height;
              await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
              const pageB64 = canvas.toDataURL("image/png").split(",")[1];
              texts.push(await ocrImageViaOcrSpace(pageB64, "image/png"));
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
      } catch (err) {
        setResult({ error: err.message });
      }
      setBusy(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignSelf: "flex-start", width: "fit-content" }}>
      <label style={{ cursor: "pointer", alignSelf: "flex-start" }}>
        <div style={{ background: busy ? "#94a3b8" : "#0f4c81", color: "#fff", borderRadius: 10, padding: "8px 12px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
          {busy ? "⏳ Analyse…" : "📥 Importer bulletin de commande / roulement"}
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
const MOIS_L=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

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
  // Postes journée non principaux PRCI (hors postes-formation)
  if(filterF!=="PAR"){
    POSTES_JOURNEE.filter(x=>x.famille==="PRCI"&&!x.principal&&!jsCodesFormationPostes.has(x.jsCode)&&!jsCodesJourneeSpecialePostes.has(x.jsCode)).forEach(poste=>{
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
  const dispos=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&en.equipe==="DISPO";});
  if(dispos.length>0){
    diversRows.push({poste:{jsCode:"DISPO",label:"Disponibles",subtitle:""},jsCode:"DISPO",agents:dispos,famille:null,isDispo:true,maxSlots:99});
  }
  // Renfort samedi (RFT SAM) - poste occasionnel, affiche uniquement si detecte
  const renfortsSamedi=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&en.jsCode==="RFT SAM";});
  if(renfortsSamedi.length>0){
    diversRows.push({poste:{jsCode:"RFT SAM",label:"Renfort samedi",subtitle:""},jsCode:"RFT SAM",agents:renfortsSamedi,famille:null,maxSlots:99});
  }
  // Formation — pave unique : badge generique FOR + tous les postes-formation (K-PAR, K-PRCI, F-PRCI...)
  const enFormation=agents.filter(a=>{
    const en=schedule[`${a.id}-${dateKey}`];
    return en&&(en.equipe==="FOR"||jsCodesFormationPostes.has(en.jsCode));
  });
  if(enFormation.length>0){
    diversRows.push({poste:{jsCode:"FOR",label:"Formation",subtitle:""},jsCode:"FOR",agents:enFormation,famille:null,isFormation:true,maxSlots:99});
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

function AleaPopup({agents,jsCode,dateKey,famille,nomOfficiel,currentAgent,onClose,onSaved}){
  const [type,setType]=useState(null); // "echange" | "erreur_cps" | "non_tenu"
  const [agentsChoisis,setAgentsChoisis]=useState([]);
  const [motif,setMotif]=useState("");
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState("");

  const toggleAgent=(ag)=>{
    setAgentsChoisis(prev=>prev.find(a=>a.id===ag.id)?prev.filter(a=>a.id!==ag.id):[...prev,ag]);
  };

  const valider=async()=>{
    setBusy(true);
    try{
      await api.cpsAleas.create({
        js_code:jsCode,
        date_jour:dateKey,
        famille,
        type,
        agents_concernes: type==="non_tenu" ? [] : agentsChoisis.map(a=>a.id),
        motif: motif||null,
      });
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
      <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Ajustement du poste</div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>{nomOfficiel} — {jsCode}</div>

      {!type&&(<div style={{display:"flex",flexDirection:"column",gap:8}}>
        <button onClick={()=>setType("echange")} style={{padding:"12px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,textAlign:"left",background:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>
          🔄 Échange / Combiné<div style={{fontSize:11,color:"#94a3b8",fontWeight:400,marginTop:2}}>Un ou plusieurs agents assurent ce poste</div>
        </button>
        <button onClick={()=>setType("erreur_cps")} style={{padding:"12px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,textAlign:"left",background:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>
          ⚠️ Erreur CPS<div style={{fontSize:11,color:"#94a3b8",fontWeight:400,marginTop:2}}>Le document officiel comporte une erreur</div>
        </button>
        <button onClick={()=>{setType("non_tenu");}} style={{padding:"12px 14px",border:"1.5px solid #fdba74",borderRadius:10,textAlign:"left",background:"#fff7ed",cursor:"pointer",fontSize:13,fontWeight:600,color:"#c2410c"}}>
          🚫 Poste non tenu<div style={{fontSize:11,color:"#c2410c",fontWeight:400,marginTop:2,opacity:.8}}>Personne n'assure ce poste</div>
        </button>
      </div>)}

      {type&&type!=="non_tenu"&&(<div style={{display:"flex",flexDirection:"column",gap:10}}>
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
          <button onClick={()=>setType(null)} style={{flex:1,padding:"10px 0",border:"1.5px solid #e2e8f0",borderRadius:9,background:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>Retour</button>
          <button onClick={valider} disabled={busy||agentsChoisis.length===0}
            style={{flex:2,padding:"10px 0",border:"none",borderRadius:9,cursor:busy?"wait":"pointer",fontSize:13,fontWeight:700,
            background:agentsChoisis.length===0?"#e2e8f0":"#0C447C",color:agentsChoisis.length===0?"#94a3b8":"#fff"}}>
            {busy?"…":"Valider"}
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
      if(entries) setSchedule(prev=>({...prev,...entries}));
    }catch(err){
      alert("Erreur lors de l'annulation : "+err.message);
    }
    setUndoing(false);
  };
  const weekDates=useMemo(()=>getWeekDates(weekOffset),[weekOffset]);
  const dateKey=weekDates[dayIdx];
  const sections=useMemo(()=>buildSections(schedule,dateKey,filterF,agents,isPrevisionnel),[schedule,dateKey,filterF,agents,isPrevisionnel]);

    const handleCpsImport=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    setUploading(true);
    setCpsResult(null);
    const reader=new FileReader();
    reader.onload=async()=>{
      const b64=reader.result.split(",")[1];
      try{
        // Fonction OCR d'une image base64 via OCR.space
        const ocrPage=async(imageB64,mimeType)=>{
          const form=new URLSearchParams();
          form.append("apikey","K85147389088957");
          form.append("base64Image","data:"+mimeType+";base64,"+imageB64);
          form.append("filetype","Auto");
          form.append("OCREngine","2");
          form.append("isTable","true");
          const res=await fetch("https://api.ocr.space/parse/image",{method:"POST",body:form});
          const data=await res.json();
          if(data.IsErroredOnProcessing) throw new Error(data.ErrorMessage?.[0]||"Erreur OCR");
          return data.ParsedResults?.map(r=>r.ParsedText).join("\n")||"";
        };

        let text="";
        if(file.type==="application/pdf"){
          // Charger le PDF avec pdfjs-dist et OCRiser page par page
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
            const scale=3.0; // haute résolution pour meilleur OCR
            const viewport=page.getViewport({scale});
            const canvas=document.createElement("canvas");
            canvas.width=viewport.width;
            canvas.height=viewport.height;
            const ctx=canvas.getContext("2d");
            await page.render({canvasContext:ctx,viewport}).promise;
            const pageB64=canvas.toDataURL("image/png").split(",")[1];
            const pageText=await ocrPage(pageB64,"image/png");
            texts.push(pageText);
          }
          text=texts.join("\n");
        }else{
          // Image directe
          text=await ocrPage(b64,file.type||"image/jpeg");
        }
        console.log("TEXTE OCR:",text);
        // Fix OCR : espace parasite a l'interieur d'un code JS (ex: "PIL CLX" -> "PILCLX")
        text=text.replace(/\b(PI|PA)([A-Z]{2,4}) ([A-Z0-9]{1,3}[-OXJ%]?)\b/g,"$1$2$3");
        if(!text) throw new Error("Aucun texte extrait du document");

        const dateMatch=text.match(/DU\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/);
        const dateStr=dateMatch?`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`:new Date().toISOString().slice(0,10);
        // Decouper le texte en blocs par page : chaque page a son propre "DU : JJ/MM/AAAA"
        // qui s'applique a toutes les lignes suivantes jusqu'a la prochaine occurrence.
        const dateBlockRe=/DU\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/g;
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
        const rawLines=rawLinesWithPos.map(o=>o.text);
        // Fusionner les lignes : si une ligne ne contient pas de debut d'horaire (HH:MM en debut/proche du debut)
        // et ne commence pas par un jsCode connu, on la rattache a la ligne precedente (cas OCR qui scinde
        // le jsCode+debut d'horaire d'un cote et la fin d'horaire+nom de l'autre cote)
        const jsCodeStartRe=/^[#*€|]?\s*(PA[A-Z0-9]+-?|PI[A-Z0-9]+-?|SD%|F-PRCI|AFOPRCI|CAF|PPRCI|PPAR|VM|AFO PAR|K-PAR|F-PAR|K-PRCI|A-PRCI|RFT SAM|RET SAM)\b/;
        const lines=[];
        const lineDates=[];
        rawLinesWithPos.forEach(o=>{
          const line=o.text;
          const hasFullHoraire=/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(line);
          const startsNewBlock=jsCodeStartRe.test(line)||hasFullHoraire;
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
          const horaireMatch=line.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
          if(!horaireMatch) return;
          const jsCodeMatch=line.match(/\b(PA[A-Z0-9]+-|PA[A-Z0-9]+\b|PI[A-Z0-9]+-|PI[A-Z0-9]+\b|SD%|F-PRCI|AFOPRCI|CAF|PPRCI|PPAR|VM|AFO PAR|K-PAR|F-PAR|K-PRCI|A-PRCI|RFT SAM|RET SAM)/);
          let jsCode=jsCodeMatch?jsCodeMatch[1]:null;
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
          const candidats=agents.filter(a=>line.toUpperCase().includes(a.nom.toUpperCase()));
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
        <button onClick={confirmerImport} disabled={savingImport} style={{padding:"8px 16px",background:savingImport?"#94a3b8":"#d97706",color:"#fff",border:"none",borderRadius:8,cursor:savingImport?"default":"pointer",fontSize:12,fontWeight:700}}>{savingImport?"⏳ Enregistrement...":"✓ Confirmer l'import"}</button>
      </div>
    </div>}

    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
      <input placeholder="🔍 Rechercher…" value={search} onChange={e=>setSearch(e.target.value)}
        style={{border:"1.5px solid #e2e8f0",borderRadius:10,padding:"8px 14px",fontSize:13,flex:1,minWidth:140,outline:"none"}}/>
      {!isPrevisionnel&&<label style={{cursor:uploading?"default":"pointer",flexShrink:0}}>
        <div style={{background:uploading?"#94a3b8":"#0f4c81",color:"#fff",borderRadius:10,padding:"8px 12px",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
          {uploading?"⏳...":"📥 Importer feuille de présence"}
        </div>
        <input type="file" accept=".pdf,image/*" onChange={handleCpsImport} style={{display:"none"}} disabled={uploading}/>
      </label>}
      {!isPrevisionnel&&<button onClick={()=>setShowHistory(s=>!s)} style={{border:"1.5px solid #e2e8f0",borderRadius:10,padding:"8px 12px",fontSize:11,fontWeight:700,color:"#475569",background:showHistory?"#f1f5f9":"#fff",cursor:"pointer",flexShrink:0}}>🕓 Historique</button>}
      {cpsResult&&<span style={{fontSize:10,background:"#f0fdf4",color:"#16a34a",borderRadius:8,padding:"4px 10px",fontWeight:700}}>✅ {cpsResult.nb} agents · {cpsResult.date}</span>}
      <div style={{display:"flex",gap:3,background:"#f1f5f9",borderRadius:10,padding:3}}>
        {[["ALL","Tous"],["PRCI","PRCI"],["PAR","PAR"]].map(([k,l])=>(
          <button key={k} onClick={()=>setFilterF(k)} style={{border:"none",borderRadius:8,padding:"6px 13px",cursor:"pointer",background:filterF===k?"#0C447C":"transparent",color:filterF===k?"#fff":"#475569",fontSize:12,fontWeight:filterF===k?700:600}}>{l}</button>
        ))}
      </div>

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
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>{try{dateJumpRef.current.showPicker();}catch(e){dateJumpRef.current&&dateJumpRef.current.click();}}} style={{display:"flex",alignItems:"center",gap:4,border:"none",background:"none",padding:"4px 0",cursor:"pointer"}}>
          <span style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{MOIS_L[new Date(dateKey).getMonth()]} {new Date(dateKey).getFullYear()}</span>
          <span style={{fontSize:11,color:"#94a3b8"}}>▾</span>
        </button>
        <button onClick={goToToday} style={{display:"flex",alignItems:"center",gap:6,border:"none",background:weekOffset===0?"#f1f5f9":"#E6F1FB",color:weekOffset===0?"#475569":"#0C447C",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:"clamp(12px,1.4vw,15px)",fontWeight:700}}>📅 Aujourd'hui</button>
      </div>
      <input ref={dateJumpRef} type="date" onChange={e=>{if(e.target.value)jumpToDate(e.target.value);}} style={{position:"absolute",width:0,height:0,opacity:0,pointerEvents:"none",border:"none"}}/>
      <div style={{display:"flex",gap:4,flexWrap:"nowrap",overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:2}}>
        {["Lu","Ma","Me","Je","Ve","Sa","Di"].map((d,i)=>{const isToday=weekDates[i]===TODAY;return(
          <button key={d} onClick={()=>setDayIdx(i)} style={{border:isToday?"2px solid #378ADD":"1.5px solid #cbd5e1",borderRadius:10,padding:"5px 10px",flexShrink:0,cursor:"pointer",background:dayIdx===i?"#0C447C":isToday?"#E6F1FB":"#fff",color:dayIdx===i?"#fff":isToday?"#0C447C":"#334155",fontSize:11,fontWeight:dayIdx===i||isToday?700:600,lineHeight:1.4}}>
            {d}<br/><span style={{opacity:.85,fontSize:10}}>{weekDates[i]?.slice(8)}/{weekDates[i]?.slice(5,7)}</span>
          </button>);})}
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
                ? row.agents.map(ag=>(<div key={ag.id} style={{display:"flex",alignItems:"center",gap:6,background:"#ecfdf5",border:"1.5px solid #6ee7b7",borderRadius:9,padding:"4px 9px"}}>
                    <Av initials={ag.initials} size={22} famille={ag.famille}/>
                    <div style={{fontSize:11,fontWeight:700,color:"#065f46"}}>{ag.prenom} {ag.nom}</div>
                  </div>))
                : Array.from({length:row.maxSlots<99?row.maxSlots:Math.max(row.agents.length,1)},(_,si)=>{
                    const ag=row.agents[si];const en=ag?schedule[`${ag.id}-${dateKey}`]:null;
                    if(search&&ag&&!`${ag.prenom} ${ag.nom}`.toLowerCase().includes(search.toLowerCase()))return null;
                    const isForm=en?.equipe==="JF";const isMe=ag&&currentAgent?.id===ag.id;
                    const alea=findAlea(cpsAleas,row.jsCode,dateKey,row.famille);
                    if(ag&&alea&&alea.type==="non_tenu")return(<div key={si} style={{display:"flex",alignItems:"center",gap:6,background:"#fff7ed",border:"1.5px solid #fb923c",borderRadius:9,padding:"4px 9px"}}>
                      <span style={{fontSize:16}}>⚠️</span>
                      <div style={{fontSize:11,fontWeight:700,color:"#c2410c"}}>Poste non tenu</div>
                      <button onClick={()=>annulerAlea(alea.id,setCpsAleas)} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:"#c2410c",opacity:.6,marginLeft:"auto"}}>✕</button>
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
                        <div style={{display:"flex",alignItems:"center",gap:6,paddingLeft:24}}><div style={{fontSize:9,color:"#a16207"}}>{alea.type==="echange"?"🔄 Échange/Combiné":"⚠️ Erreur CPS"}</div><button onClick={()=>annulerAlea(alea.id,setCpsAleas)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#a16207",opacity:.6,marginLeft:"auto"}}>✕</button></div>
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
                      return(<div key={si} style={{display:"flex",alignItems:"center",gap:6,background:isMe?"#fafdf0":(fam?.light||"rgba(255,255,255,.8)"),border:`1.5px solid ${isMe?(fam?.accent||"#6366f1"):"rgba(0,0,0,.07)"}`,borderRadius:9,padding:"4px 9px"}}>
                        <Av initials={ag.initials} size={22} famille={ag.famille}/>
                        <div>
                          <div style={{fontSize:11,fontWeight:700,color:row.agents.length>1?"#dc2626":"#1e293b"}}>{ag.prenom} {ag.nom}{isMe&&<span style={{fontSize:8,color:fam?.accent||"#6366f1",marginLeft:3}}>●</span>}</div>
                          <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>{ag.grade}</div>
                          {row.isJourneeSpeciale&&findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey)&&<div style={{fontSize:9,color:"#7c3aed",fontStyle:"italic"}}>{findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey).message}</div>}
                        </div>
                        {row.isJourneeSpeciale?
                        <button onClick={()=>setJourneeSpecialeNoteTarget({agentId:ag.id,agentNom:`${ag.prenom} ${ag.nom}`,currentMessage:findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey)?.message||""})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>📝</button>
                        :
                        <button onClick={()=>setPrevisionnelTarget({agentId:ag.id,nomTitulaire:`${ag.prenom} ${ag.nom}`})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>🔄</button>}
                      </div>);
                    }
                    if(ag)return(<div key={si} style={{display:"flex",alignItems:"center",gap:6,background:isForm?"#f0fdf4":isMe?"#fafdf0":(fam?.light||"rgba(255,255,255,.8)"),border:`1.5px solid ${isForm?"#22c55e":isMe?(fam?.accent||"#6366f1"):"rgba(0,0,0,.07)"}`,borderRadius:9,padding:"4px 9px"}}>
                      <Av initials={ag.initials} size={22} famille={ag.famille}/>
                      <div>
                        <div style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{ag.prenom} {ag.nom}{isMe&&<span style={{fontSize:8,color:fam?.accent||"#6366f1",marginLeft:3}}>●</span>}</div>
                        <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>{ag.grade}</div>
                          {row.isJourneeSpeciale&&findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey)&&<div style={{fontSize:9,color:"#7c3aed",fontStyle:"italic"}}>{findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey).message}</div>}
                      </div>
                      {row.isJourneeSpeciale?
                      <button onClick={()=>setJourneeSpecialeNoteTarget({agentId:ag.id,agentNom:`${ag.prenom} ${ag.nom}`,currentMessage:findJourneeSpecialeNote(journeeSpecialeNotes,ag.id,dateKey)?.message||""})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>📝</button>
                      :
                      <button onClick={()=>setAleaTarget({jsCode:row.jsCode,famille:row.famille,nomOfficiel:`${ag.prenom} ${ag.nom}`})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>🔄</button>}
                    </div>);
                    if(row.maxSlots<99){
                      const aleaVacant=findAlea(cpsAleas,row.jsCode,dateKey,row.famille);
                      if(aleaVacant&&aleaVacant.type==="non_tenu")return(<div key={si} style={{display:"flex",alignItems:"center",gap:6,background:"#fff7ed",border:"1.5px solid #fb923c",borderRadius:9,padding:"4px 9px"}}>
                        <span style={{fontSize:16}}>⚠️</span>
                        <div style={{fontSize:11,fontWeight:700,color:"#c2410c"}}>Poste non tenu</div>
                        <button onClick={()=>annulerAlea(aleaVacant.id,setCpsAleas)} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:"#c2410c",opacity:.6,marginLeft:"auto"}}>✕</button>
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
                            <button onClick={()=>annulerAlea(aleaVacant.id,setCpsAleas)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#a16207",opacity:.6,marginLeft:"auto"}}>✕</button>
                          </div>
                        </div>);
                      }
                      if(estNonTenuWeekend(row.jsCode,dateKey))return(<div key={si} style={{display:"flex",alignItems:"center",gap:6,background:"#f1f5f9",border:"1.5px solid #cbd5e1",borderRadius:9,padding:"4px 9px"}}>
                        <div style={{width:22,height:22,borderRadius:"50%",background:"#cbd5e1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>📅</div>
                        <div style={{fontSize:10,color:"#475569",fontWeight:600}}>Non tenu (week-end)</div>
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
    {aleaTarget&&<AleaPopup agents={agents} jsCode={aleaTarget.jsCode} dateKey={dateKey} famille={aleaTarget.famille} nomOfficiel={aleaTarget.nomOfficiel} currentAgent={currentAgent} onClose={()=>setAleaTarget(null)} onSaved={()=>{api.cpsAleas.getAll().then(rows=>setCpsAleas(rows||[]));}}/>}
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
const DEFAULT_COLORS = {
  M:"#8B0000", AM:"#8B0000", N:"#8B0000", J:"#8B0000", JF:"#8B0000",
  RP:"#16a34a", RPP:"#0d9488", RU:"#ca8a04", RQ:"#ca8a04", TC:"#0284c7", TY:"#0284c7", RN:"#4338ca",
  NU:"#475569", CA:"#eab308", CP:"#eab308",
  MA:"#dc2626", ABS:"#dc2626", VT:"#eab308", VM:"#6b7280",
  FOR:"#b45309", DISPO:"#059669", NOTE:"#b45309",
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
    FETE:"Fêtes légales", NOTE:"Note perso",
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
    if(code==="FETE") return (agentColors||{})["F1"]||"#ec4899";
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
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",
            color:"#fff",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:18,
            display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

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

          {/* Reset */}
          <button onClick={()=>setAgentColors({})}
            style={{background:"#fef2f2",color:"#dc2626",border:"1.5px solid #fecaca",
              borderRadius:12,padding:"12px 0",cursor:"pointer",fontSize:13,fontWeight:700,
              marginTop:4}}>
            ↺ Réinitialiser toutes les couleurs par défaut
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── TABLEAU DE BORD COMPTEURS ───────────────────────────────────────────────
function DashboardCompteurs({agent, schedule, agentProfiles, setAgentProfiles, isOwnProfile, isAdmin}){
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [editMode, setEditMode] = useState(false);
  const year = selectedYear;
  const start = `${year}-01-01`;
  const end   = `${year}-12-31`;
  // 3 années disponibles : année en cours + 2 précédentes
  const availableYears = [currentYear, currentYear-1, currentYear-2];

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
      } else if(["M","AM","N","J"].includes(eq)){
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
    });
    return c;
  },[agent,schedule,year]);

  // Corrections manuelles sauvegardées
  const savedCorrections = agentProfiles[agent?.id]?.compteurCorrections?.[selectedYear] || {};
  const [corrections, setCorrections] = useState(savedCorrections);
  
  // Recharger les corrections quand on change d'année
  useEffect(()=>{
    const c = agentProfiles[agent?.id]?.compteurCorrections?.[selectedYear] || {};
    setCorrections(c);
    setEditMode(false);
  },[selectedYear, agent?.id]);

  // Valeur finale = calculée + correction manuelle
  const val = (key) => (computed[key]||0) + (corrections[key]||0);

  const saveCorrections = (newCorr) => {
    const withDate = {...newCorr, _updatedAt: new Date().toISOString()};
    setCorrections(withDate);
    setAgentProfiles(prev=>({
      ...prev,
      [agent.id]:{
        ...(prev[agent.id]||{}),
        compteurCorrections:{
          ...(prev[agent.id]?.compteurCorrections||{}),
          [selectedYear]: withDate,
        }
      }
    }));
  };

  // Détecter changement de planning → mettre à jour la date
  const computedStr = JSON.stringify(computed);
  useEffect(()=>{
    if(!agent||Object.keys(computed).length===0) return;
    setCorrections(prev=>{
      const updated = {...prev, _updatedAt: new Date().toISOString()};
      setAgentProfiles(pp=>({
        ...pp,
        [agent.id]:{
          ...(pp[agent.id]||{}),
          compteurCorrections:{
            ...(pp[agent.id]?.compteurCorrections||{}),
            [year]: updated,
          }
        }
      }));
      return updated;
    });
  },[computedStr]);

  const CONGES_ANNUELS = 28;
  const congesPris = val("CA") + val("CP");
  const solde = CONGES_ANNUELS - congesPris;

  const CARDS = [
    {key:"conges",  label:"Congés",          color:"#eab308", icon:"🏖️", subtitle:`Solde : ${solde} / ${CONGES_ANNUELS}`, alert:solde<5},
    {key:"travail", label:"Jours travaillés", color:"#8B0000", icon:"💼", subtitle:`Année ${year}`},
    {key:"RP",      label:"RP",              color:"#16a34a", icon:"🟢", subtitle:"Repos périodiques"},
    {key:"RU",      label:"RU",              color:"#d97706", icon:"🟡", subtitle:"Repos utilisation"},
    {key:"RQ",      label:"RQ",              color:"#d97706", icon:"🟡", subtitle:"Repos qualif."},
    {key:"FETE",    label:"Fêtes",           color:"#ec4899", icon:"🩷", subtitle:"Jours fête"},
    {key:"RN",      label:"RN",              color:"#4338ca", icon:"🔵", subtitle:"Repos nuit"},
    {key:"TC",      label:"TC",              color:"#0284c7", icon:"🔵", subtitle:"Temps compensé"},
    {key:"TY",      label:"TY",              color:"#0284c7", icon:"🔵", subtitle:"Temps compensé"},
    {key:"VT",      label:"VT",              color:"#eab308", icon:"⏱️", subtitle:"Temps partiel"},
    {key:"FOR",     label:"Formation",       color:"#b45309", icon:"📚", subtitle:"Jours formation"},
    {key:"MA",      label:"Maladie",         color:"#dc2626", icon:"🤒", subtitle:"Jours maladie"},
  ];

  const [ouvert, setOuvert] = useState(false);

  return(
    <div style={{margin:"20px 0 8px",borderRadius:14,border:"1.5px solid #e2e8f0",
      overflow:"hidden",background:"#fff",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>

      {/* ── Header accordéon cliquable ── */}
      <div onClick={()=>setOuvert(o=>!o)}
        style={{display:"flex",alignItems:"center",gap:8,padding:"12px 16px",
          cursor:"pointer",userSelect:"none",
          background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
          borderBottom:ouvert?"1.5px solid #818cf8":"none",
          flexWrap:"wrap"}}>

        <span style={{fontSize:15}}>📊</span>
        <span style={{fontSize:13,fontWeight:800,color:"#fff",letterSpacing:-.2}}>
          Compteurs {selectedYear}
        </span>

        {/* Résumé rapide quand fermé */}
        {!ouvert&&<div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {[
            {k:"travail", icon:"💼"},
            {k:"RP",      icon:"🟢"},
            {k:"FETE",    icon:"🩷"},
            {k:"conges",  icon:"🏖️"},
          ].map(({k,icon})=>{
            const v = k==="conges" ? congesPris : val(k);
            if(!v) return null;
            return <span key={k} style={{
              fontSize:10,fontWeight:700,color:"#fff",
              background:"rgba(255,255,255,.18)",
              borderRadius:6,padding:"1px 8px",
            }}>{icon} {v}</span>;
          })}
        </div>}

        <div style={{flex:1}}/>

        {/* Sélecteur année — stop propagation */}
        <div onClick={e=>e.stopPropagation()}
          style={{display:"flex",gap:2,background:"rgba(255,255,255,.15)",borderRadius:8,padding:2}}>
          {availableYears.map(y=>(
            <button key={y} onClick={()=>{setSelectedYear(y);setEditMode(false);}}
              style={{border:"none",borderRadius:6,padding:"3px 9px",cursor:"pointer",
                fontSize:11,fontWeight:700,
                background:y===selectedYear?"rgba(255,255,255,.9)":"transparent",
                color:y===selectedYear?"#6366f1":"rgba(255,255,255,.7)",
                boxShadow:y===selectedYear?"0 1px 3px rgba(0,0,0,.12)":"none"}}>
              {y}
            </button>
          ))}
        </div>

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
          <button onClick={e=>{e.stopPropagation();setEditMode(e=>!e);}}
            style={{background:editMode?"#1e293b":"#f1f5f9",
              color:editMode?"#fff":"#475569",
              border:"none",borderRadius:8,padding:"5px 10px",
              cursor:"pointer",fontSize:11,fontWeight:700}}>
            {editMode?"✅ Terminer":"✏️ Corriger"}
          </button>
        </div>

      {/* Grille compteurs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
        {CARDS.map(card=>{
          const v = card.key==="conges" ? congesPris : val(card.key);
          const corr = corrections[card.key]||0;
          return(
            <div key={card.key} style={{
              background:"#fff",borderRadius:12,
              border:`1.5px solid ${card.alert?"#fca5a5":"#e2e8f0"}`,
              padding:"10px 12px",boxShadow:"0 1px 3px rgba(0,0,0,.06)",
              position:"relative",overflow:"hidden",
            }}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:4,
                background:card.color,borderRadius:"10px 10px 0 0"}}/>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4,marginTop:2}}>
                <span style={{fontSize:12}}>{card.icon}</span>
                <span style={{fontSize:10,fontWeight:700,color:"#64748b"}}>{card.label}</span>
              </div>
              <div style={{fontSize:26,fontWeight:900,color:card.color,lineHeight:1}}>{v}</div>
              <div style={{fontSize:9,color:card.alert?"#ef4444":"#94a3b8",marginTop:3,
                fontWeight:card.alert?700:400,lineHeight:1.3}}>
                {card.subtitle}
              </div>
              {corrections._updatedAt&&<div style={{
                fontSize:9,fontWeight:600,color:"#475569",marginTop:5,
                borderTop:"1px solid #e2e8f0",paddingTop:4,lineHeight:1.4,
              }}>
                Mis à jour le<br/>
                <span style={{fontWeight:700,color:"#1e293b"}}>
                  {new Date(corrections._updatedAt).toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}
                </span>
              </div>}
              {/* Contrôles de correction */}
              {editMode&&<div style={{
                display:"flex",gap:4,marginTop:6,justifyContent:"center"
              }}>
                <button onClick={()=>{
                  const k=card.key==="conges"?"CA":card.key;
                  saveCorrections({...corrections,[k]:(corrections[k]||0)-1});
                }}
                  style={{width:28,height:28,borderRadius:7,border:"1px solid #e2e8f0",
                    background:"#fee2e2",color:"#dc2626",cursor:"pointer",fontSize:16,fontWeight:800,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                <button onClick={()=>{
                  const k=card.key==="conges"?"CA":card.key;
                  saveCorrections({...corrections,[k]:(corrections[k]||0)+1});
                }}
                  style={{width:28,height:28,borderRadius:7,border:"1px solid #e2e8f0",
                    background:"#dcfce7",color:"#16a34a",cursor:"pointer",fontSize:16,fontWeight:800,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
              </div>}
            </div>
          );
        })}
      </div>
      {editMode&&<div style={{
        background:"#eff6ff",borderRadius:10,padding:"8px 12px",marginTop:8,
        fontSize:10,color:"#1e40af",fontWeight:500,
      }}>
        💡 Le chiffre central = calculé depuis votre planning. Utilisez +/− pour corriger si votre planning n'est pas à jour. Les corrections sont sauvegardées automatiquement.
      </div>}

      </div>}

      {/* ── FÊTES LÉGALES ─────────────────────────────────────── */}
      {(isOwnProfile||isAdmin)&&<FetesSection
        agent={agent}
        schedule={schedule}
        agentProfiles={agentProfiles}
        setAgentProfiles={setAgentProfiles}
        isAdmin={isAdmin}
        isOwnProfile={isOwnProfile}
        year={selectedYear}/>}

      {/* ── PAUSE FIGÉE ─────────────────────────────────────── */}
      <PauseFigeeSection
        agent={agent}
        year={selectedYear}
        agentProfiles={agentProfiles}
        setAgentProfiles={setAgentProfiles}/>
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

  const fmt=(d)=>d.toISOString().slice(0,10);

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
  // On garde la date réelle, la règle est gérée dans FetesSection via estDimanche
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

// ─── SECTION TABLEAU FÊTES ───────────────────────────────────────────────────
function FetesSection({agent, schedule, agentProfiles, setAgentProfiles, isAdmin, isOwnProfile, year}){
  const today = new Date().toISOString().slice(0,10);
  const todayDate = new Date();

  // Corrections manuelles fêtes (stockées dans agentProfiles)
  const fetesData = agentProfiles[agent?.id]?.fetesTracking?.[year] || {};
  
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
  const setFetesData = (updater) => setFetesDataYear(year, updater);

  const datesFetes = getDatesFetesAnnee(year);
  
  // Pour chaque fête, calculer son statut
  const lignes = Object.entries(CODES_FETES).map(([code, label])=>{
    // VN n'existe que si Noël tombe un dimanche pour cette année
    const dateFete = datesFetes[code];
    if(!dateFete) return null; // VN absent si Noël ne tombe pas un dimanche

    const dateFeteObj = new Date(dateFete);
    const dow = dateFeteObj.getDay(); // 0=dim

    // F2 (Lundi de Pâques) et F5 (Lundi de Pentecôte) sont TOUJOURS des lundis
    // par construction — ils ne peuvent jamais tomber un dimanche
    const jamaisDimanche = code === "F2" || code === "F5";
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
    const finRecherche = limiteDate;

    let priseLe = null;
    let priseType = null;
    // 1. Code fête saisi directement
    Object.entries(schedule).forEach(([k,v])=>{
      if(!k.startsWith(agent.id+"-")) return;
      const dk = k.slice(agent.id.length+1);
      if(dk < debutRecherche || dk > finRecherche) return;
      if(v?.equipe === code){ priseLe = dk; priseType = "code"; }
    });
    // 2. RP dans le trimestre suivant (si pas déjà trouvé par code)
    if(!priseLe){
      const trimestreSuiv = getTrimestre(parseInt(dateFete.slice(5,7)))+1;
      const anneeSuiv = trimestreSuiv > 4 ? year+1 : year;
      const tReal = trimestreSuiv > 4 ? 1 : trimestreSuiv;
      const debutT = {1:`${anneeSuiv}-01-01`,2:`${anneeSuiv}-04-01`,3:`${anneeSuiv}-07-01`,4:`${anneeSuiv}-10-01`};
      const debutTrimSuiv = debutT[tReal];
      Object.entries(schedule).forEach(([k,v])=>{
        if(!k.startsWith(agent.id+"-")) return;
        const dk = k.slice(agent.id.length+1);
        if(dk < debutTrimSuiv || dk > finRecherche) return;
        if(v?.equipe === "RP"){ priseLe = dk; priseType = "RP"; }
      });
    }

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
        // Toutes les autres fêtes dimanche (hors F2/F5)
        if(estTravaillePlanning || estRPCeJour){
          estRCAccorde = true; // Service imposé ou RP → RC accordé
        } else if(!planningRenseigneCeJour && estFutur){
          // Futur non renseigné → on anticipe PERDUE
          // Mais si l'agent a un roulement, on peut affiner :
          // Sans table de roulement détaillée, on marque comme PERDUE par anticipation
          // (l'agent peut corriger manuellement)
          estPerdue = true; // Anticipé PERDUE — corrigeable manuellement
        } else if(!planningRenseigneCeJour && !estFutur){
          estPerdue = true; // Passé non renseigné → PERDUE
        } else {
          // Planning renseigné mais pas travail ni RP (ex: CA, MA…) → pas de RC
          estPerdue = true;
        }
      }
    }

    // Motif réglementaire
    let motifReglementaire = null;
    if(estPerdue && estF3Dimanche){
      motifReglementaire = "Lorsque le 1er mai tombe un dimanche, seuls les agents qui travaillent ce jour-là bénéficient d'un RC (le repos périodique ne compte pas, contrairement aux autres fêtes du dimanche). Aucun service imposé détecté. (Réf. GRH00143)";
    } else if(estPerdueProbable && estF3Dimanche){
      motifReglementaire = "1er mai dimanche — Planning non encore saisi ce jour-là. Ce sera PERDUE sauf si vous travaillez ce jour (le RP ne compte pas pour cette fête). (Réf. GRH00143)";
    } else if(estPerdue && !estF3Dimanche && estFutur){
      motifReglementaire = "Fête tombant un dimanche — aucun planning saisi. PERDUE par anticipation si ni service imposé ni RP ce jour. Corrigeable si planning mis à jour. (Réf. GRH00143)";
    } else if(estPerdue && !estF3Dimanche && !estFutur){
      motifReglementaire = "Fête tombant un dimanche — aucun service imposé ni RP détecté dans le planning. (Réf. GRH00143)";
    } else if(estRCAccorde && estDimanche){
      motifReglementaire = estRPCeJour
        ? "Agent en repos périodique ce jour : RC accordé dans le trimestre civil suivant. (Réf. GRH00143)"
        : "Agent utilisé ce jour : RC accordé dans le trimestre civil suivant. (Réf. GRH00143)";
    } else if(code === "VN"){
      motifReglementaire = "Les agents chôment le samedi veille de Noël lorsque cette fête tombe un dimanche. Ceux utilisés ou en RP bénéficient d'un RC dans le trimestre suivant. (Réf. GRH00143)";
    }

    // Override manuel
    const override = fetesData[code] || {};
    const priseLeFinal = override.priseLe !== undefined ? override.priseLe : priseLe;
    const priseTypeFinal = override.priseType || priseType;
    const estPayee = override.estPayee || (!priseLeFinal && !estPerdue && today > limiteDate);
    const snoozeJusquau = override.snoozeJusquau || null;

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
      limiteDate, notifDate, moisPaye, anneePaye,
      priseLe: priseLeFinal, priseType: priseTypeFinal,
      estPayee, statut, notifActive, override,
    };
  }).filter(Boolean);

  const [editingCode, setEditingCode] = useState(null);
  const [editVal, setEditVal] = useState("");

  const prendreEnCompte = (code, targetYear=year) => {
    setFetesDataYear(targetYear, prev=>({...prev,[code]:{...(prev[code]||{}),snoozeJusquau:null,priseLe:today,priseType:"manuel"}}));
  };
  const snooze10j = (code, targetYear=year) => {
    const d = new Date(); d.setDate(d.getDate()+10);
    setFetesDataYear(targetYear, prev=>({...prev,[code]:{...(prev[code]||{}),snoozeJusquau:d.toISOString().slice(0,10)}}));
  };
  const setManualDate = (code, val, targetYear=year) => {
    setFetesDataYear(targetYear, prev=>({...prev,[code]:{...(prev[code]||{}),priseLe:val||null,priseType:val?"manuel":null}}));
    setEditingCode(null);
  };
  const setManualPayee = (code, val, targetYear=year) => {
    setFetesDataYear(targetYear, prev=>({...prev,[code]:{...(prev[code]||{}),estPayee:val}}));
  };
  const resetManuel = (code, targetYear=year) => {
    setFetesDataYear(targetYear, prev=>{
      const next = {...prev};
      delete next[code];
      return next;
    });
    setEditingCode(null);
  };

  const notifCount   = lignes.filter(l=>l.notifActive).length;
  const nbPrises     = lignes.filter(l=>l.statut==="prise").length;
  const nbPayees     = lignes.filter(l=>l.statut==="payee"||l.statut==="payee_auto").length;

  // Fêtes de N-1 qui débordent sur l'année N (T4 : limite 31 mars N)
  // Toussaint (F8=1er nov), 11nov (F9), Noël (F0), VN éventuel
  const yearMoins1 = year - 1;
  const fetesDataN1 = agentProfiles[agent?.id]?.fetesTracking?.[yearMoins1] || {};
  const datesFetesN1 = getDatesFetesAnnee(yearMoins1);
  const limiteT4N1 = `${year}-03-31`; // fin du trimestre suivant T4 de N-1
  const today2 = new Date().toISOString().slice(0,10);

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
    Object.entries(schedule).forEach(([k,v])=>{
      if(!k.startsWith(agent.id+"-")) return;
      const dk = k.slice(agent.id.length+1);
      // Fenêtre : date fête → 31 mars N
      if(dk < dateFete || dk > limiteDate) return;
      if(v?.equipe===code){ priseLe = dk; priseType = "code"; }
    });
    // RP dans le trimestre suivant (janv-mars N)
    if(!priseLe){
      Object.entries(schedule).forEach(([k,v])=>{
        if(!k.startsWith(agent.id+"-")) return;
        const dk = k.slice(agent.id.length+1);
        if(dk < `${year}-01-01` || dk > limiteDate) return;
        if(v?.equipe==="RP"){ priseLe = dk; priseType = "RP"; }
      });
    }
    if(override.priseLe!==undefined){ priseLe = override.priseLe; priseType = override.priseType||"manuel"; }
    const estPayee = override.estPayee || (!priseLe && today2 > limiteDate);

    let statut;
    if(priseLe)      statut = "prise";
    else if(estPayee) statut = "payee";
    else if(today2 > limiteDate) statut = "payee_auto";
    else             statut = "attente";

    return {
      code, label, dateFete, limiteDate, priseLe, priseType, statut,
      estPayee, moisPaye, anneePaye,
      estDimanche:false, estF3Dimanche:false, estPerdue:false,
      motifReglementaire:`Fête légale de ${yearMoins1} reportable jusqu'au 31 mars ${year} (trimestre civil suivant). (Réf. GRH00143)`,
      override,
    };
  }).filter(Boolean);

  // Grouper par statut pour affichage bandeau
  const fetesN1Prises   = fetesReportN1.filter(l=>l.statut==="prise");
  const fetesN1Payees   = fetesReportN1.filter(l=>l.statut==="payee"||l.statut==="payee_auto");
  const fetesN1Attente  = fetesReportN1.filter(l=>l.statut==="attente");
  const nbPrisesN1  = fetesN1Prises.length;
  const nbPayeesN1  = fetesN1Payees.length;
  const nbAttenteN1 = fetesN1Attente.length;

  const [ouvert, setOuvert] = useState(false);
  const [ouvertN1, setOuvertN1] = useState(false);
  const [motifOuvert, setMotifOuvert] = useState(null);

  // Couleurs par statut
  const statutStyle = {
    futur:          {bg:"#f8fafc", border:"#e2e8f0", badge:"#94a3b8", badgeTc:"#fff",     icon:"🔜", label:"À venir"},
    prise:          {bg:"#f0fdf4", border:"#86efac", badge:"#16a34a", badgeTc:"#fff",     icon:"✅", label:"Prise"},
    attente:        {bg:"#fffbeb", border:"#fde68a", badge:"#f59e0b", badgeTc:"#fff",     icon:"⏳", label:"En attente"},
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
    const s = statutStyle[l.statut]||statutStyle.futur;
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
                  weekday:"short",day:"2-digit",month:"2-digit"
                })}
              </span>
              <span style={{color:"#94a3b8"}}>→</span>
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
          </div>

          {/* Statut badge */}
          <span style={{
            background:s.badge,color:s.badgeTc,
            borderRadius:20,padding:"5px 12px",
            fontSize:12,fontWeight:700,whiteSpace:"nowrap",flexShrink:0,
          }}>
            {s.icon} {s.label}
            {l.statut==="payee"&&` ${MOIS_NOMS[l.moisPaye-1]}`}
            {l.statut==="payee_auto"&&` ${MOIS_NOMS[l.moisPaye-1]}${l.anneePaye!==year?` ${l.anneePaye}`:""}`}
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
              {priseLe
                ? <span style={{color:"#16a34a",fontWeight:700}}>{priseLe}</span>
                : l.statut==="payee"
                  ? <span style={{color:"#2563eb",fontWeight:700}}>
                      💶 Fiche de paie {MOIS_NOMS[l.moisPaye-1]}{l.anneePaye!==year?` ${l.anneePaye}`:""}
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
                  : <span style={{color:"#64748b",fontStyle:"italic"}}>Non renseigné</span>
              }
            </div>
          )}

          {/* Boutons actions */}
          {canEdit&&!isEditing&&<div style={{display:"flex",gap:6,flexShrink:0}}>
            <button onClick={()=>{setEditingCode(editKey);setEditVal(l.priseLe||"");}}
              title="Modifier la date de prise"
              style={{background:"#f1f5f9",border:"1px solid #cbd5e1",borderRadius:8,
                padding:"7px 11px",cursor:"pointer",fontSize:15,minWidth:38,minHeight:38}}>📅</button>
            <button onClick={()=>setManualPayee(l.code,!l.estPayee,targetYear)}
              title={l.estPayee?"Non payé":"Marquer payé"}
              style={{background:l.estPayee?"#dbeafe":"#f1f5f9",
                border:`1.5px solid ${l.estPayee?"#93c5fd":"#cbd5e1"}`,
                borderRadius:8,padding:"7px 11px",cursor:"pointer",fontSize:15,minWidth:38,minHeight:38}}>💶</button>
            {/* Bouton réinitialiser — visible seulement si une correction manuelle a été posée sur cette fête */}
            {(l.override?.priseLe!==undefined||l.override?.estPayee!==undefined)&&<button
              onClick={()=>resetManuel(l.code,targetYear)}
              title="Annuler la correction manuelle et revenir au calcul automatique"
              style={{background:"#fff7ed",border:"1.5px solid #fdba74",borderRadius:8,
                padding:"7px 11px",cursor:"pointer",fontSize:15,minWidth:38,minHeight:38,
                color:"#c2410c"}}>↺</button>}
            {/* Bouton motif réglementaire */}
            {l.motifReglementaire&&<button
              onClick={()=>setMotifOuvert(motifVisible?null:editKey)}
              title="Motif réglementaire"
              style={{background:motifVisible?"#fce7f3":"#f1f5f9",
                border:`1.5px solid ${motifVisible?"#f9a8d4":"#cbd5e1"}`,
                borderRadius:8,padding:"7px 11px",cursor:"pointer",fontSize:15,
                minWidth:38,minHeight:38,
                color:motifVisible?"#9d174d":"#64748b"}}>📋</button>}
          </div>}
        </div>

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
      </div>
    );
  };

  return(
    <div style={{marginTop:14,border:"2px solid #e2e8f0",borderRadius:14,overflow:"hidden",background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>

      {/* ── HEADER cliquable ── */}
      <div onClick={()=>setOuvert(o=>!o)}
        style={{background:"linear-gradient(135deg,#831843,#9d174d)",padding:"16px 20px",
          display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none",flexWrap:"wrap"}}>

        {/* Titre */}
        <span style={{fontSize:20,flexShrink:0}}>🩷</span>
        <span style={{fontSize:17,fontWeight:800,color:"#fff",flex:1,minWidth:140}}>
          Suivi des fêtes légales {year}
        </span>

        {/* Compteurs inline */}
        <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>

          {/* Année en cours — prises */}
          {nbPrises>0&&<span style={{
            background:"rgba(22,163,74,.95)",color:"#fff",
            borderRadius:20,padding:"4px 11px",fontSize:12,fontWeight:700,
            display:"inline-flex",alignItems:"center",gap:4,flexShrink:0}}>
            ✅ {nbPrises} prise{nbPrises>1?"s":""} {year}
          </span>}

          {/* Année en cours — payées */}
          {nbPayees>0&&<span style={{
            background:"rgba(59,130,246,.95)",color:"#fff",
            borderRadius:20,padding:"4px 11px",fontSize:12,fontWeight:700,
            display:"inline-flex",alignItems:"center",gap:4,flexShrink:0}}>
            💶 {nbPayees} payée{nbPayees>1?"s":""} {year}
          </span>}

          {/* Fêtes T4 de N-1 encore en cours — prises */}
          {nbPrisesN1>0&&<span style={{
            background:"rgba(22,163,74,.82)",color:"#fff",
            borderRadius:20,padding:"4px 11px",fontSize:12,fontWeight:700,
            display:"inline-flex",alignItems:"center",gap:4,flexShrink:0}}
            title={fetesN1Prises.map(l=>`${l.code} – ${l.label}`).join(", ")}>
            ✅ {nbPrisesN1} prise{nbPrisesN1>1?"s":""} ({yearMoins1})
          </span>}

          {/* Fêtes T4 de N-1 — en attente (délai pas encore dépassé) */}
          {nbAttenteN1>0&&<span style={{
            background:"rgba(245,158,11,.92)",color:"#fff",
            borderRadius:20,padding:"4px 11px",fontSize:12,fontWeight:700,
            display:"inline-flex",alignItems:"center",gap:4,flexShrink:0}}
            title={`À prendre avant le 31 mars ${year} : ${fetesN1Attente.map(l=>l.code).join(", ")}`}>
            ⏳ {nbAttenteN1} à prendre ({yearMoins1})
          </span>}

          {/* Fêtes T4 de N-1 — payées */}
          {nbPayeesN1>0&&<span style={{
            background:"rgba(59,130,246,.82)",color:"#fff",
            borderRadius:20,padding:"4px 11px",fontSize:12,fontWeight:700,
            display:"inline-flex",alignItems:"center",gap:4,flexShrink:0}}
            title={fetesN1Payees.map(l=>`${l.code} – ${l.label}`).join(", ")}>
            💶 {nbPayeesN1} payée{nbPayeesN1>1?"s":""} ({yearMoins1})
          </span>}

          {/* Rappels */}
          {notifCount>0&&<span style={{
            background:"#ef4444",color:"#fff",
            borderRadius:20,padding:"4px 11px",fontSize:12,fontWeight:700,flexShrink:0}}>
            ⚠️ {notifCount} rappel{notifCount>1?"s":""}
          </span>}
        </div>

        <span style={{fontSize:11,color:"rgba(255,255,255,.55)",fontStyle:"italic",flexShrink:0}}>GRH00143</span>
        <span style={{color:"#fff",fontSize:18,fontWeight:700,transition:"transform .2s",
          display:"inline-block",transform:ouvert?"rotate(0deg)":"rotate(-90deg)",flexShrink:0}}>
          ▼
        </span>
      </div>

      {ouvert&&<>
        {/* ── Alertes actives ── */}
        {lignes.filter(l=>l.notifActive).map(l=>(
          <div key={"alert-"+l.code} style={{background:"#fff7ed",borderBottom:"1px solid #fed7aa",
            padding:"12px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:19,flexShrink:0}}>⚠️</span>
            <div style={{flex:1,minWidth:160}}>
              <div style={{fontSize:14,fontWeight:800,color:"#c2410c"}}>
                🩷 {l.code} — {l.label}
              </div>
              <div style={{fontSize:12,color:"#92400e",marginTop:2}}>
                À prendre avant le <strong>
                  {new Date(l.limiteDate).toLocaleDateString("fr-FR",{
                    day:"2-digit",month:"long",
                    year:parseInt(l.limiteDate.slice(0,4))!==year?"numeric":undefined
                  })}
                </strong>
              </div>
            </div>
            {canEdit&&<div style={{display:"flex",gap:7,flexShrink:0}}>
              <button onClick={e=>{e.stopPropagation();prendreEnCompte(l.code);}}
                style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:8,
                  padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:700,minHeight:36}}>✓ Pris</button>
              <button onClick={e=>{e.stopPropagation();snooze10j(l.code);}}
                style={{background:"#f1f5f9",color:"#475569",border:"1px solid #cbd5e1",
                  borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:600,minHeight:36}}>⏰ +10j</button>
            </div>}
          </div>
        ))}

        {/* ── Cartes portrait (1 par fête) ── */}
        <div style={{display:"flex",flexDirection:"column",gap:0}}>
          {lignes.map(l=>renderFeteCard(l, year))}
        </div>

        {/* ── Report N-1 (fêtes de fin d'année précédente encore en délai) ── */}
        {fetesReportN1.length>0&&<div style={{borderTop:"2px solid #e2e8f0"}}>
          <div onClick={()=>setOuvertN1(o=>!o)}
            style={{background:"#fdf2f8",padding:"10px 14px",display:"flex",alignItems:"center",
              gap:8,cursor:"pointer",userSelect:"none"}}>
            <span style={{fontSize:13,fontWeight:700,color:"#9d174d",flex:1}}>
              📋 Report {yearMoins1} ({fetesReportN1.length})
            </span>
            <span style={{fontSize:11,color:"#be185d"}}>
              {ouvertN1?"Masquer":"Afficher"}
            </span>
            <span style={{color:"#9d174d",fontSize:13,fontWeight:700,transition:"transform .2s",
              display:"inline-block",transform:ouvertN1?"rotate(0deg)":"rotate(-90deg)"}}>▼</span>
          </div>
          {ouvertN1&&<div style={{display:"flex",flexDirection:"column",gap:0}}>
            {fetesReportN1.map(l=>renderFeteCard(l, yearMoins1))}
          </div>}
        </div>}

        {/* ── Légende compacte ── */}
        <div style={{padding:"11px 14px",borderTop:"1px solid #e2e8f0",
          display:"flex",gap:11,flexWrap:"wrap",alignItems:"center",background:"#f8fafc"}}>
          {[
            {bg:"#16a34a",l:"Prise"},
            {bg:"#f59e0b",l:"Attente"},
            {bg:"#3b82f6",l:"Payée"},
            {bg:"#dc2626",l:"Perdue"},
            {bg:"#ea580c",l:"Prob."},
            {bg:"#7c3aed",l:"Indét."},
            {bg:"#94a3b8",l:"À venir"},
          ].map(({bg,l})=>(
            <span key={l} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11}}>
              <span style={{width:10,height:10,borderRadius:"50%",background:bg,flexShrink:0}}/>
              <span style={{color:"#475569",fontWeight:600}}>{l}</span>
            </span>
          ))}
          <span style={{flex:1}}/>
          <span style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>GRH00143</span>
        </div>
      </>}
    </div>
  );
}

// ─── MÉMO PAUSES FIGÉES ──────────────────────────────────────────────────────
function PauseFigeeSection({agent, year, agentProfiles, setAgentProfiles}){
  const [ouvert, setOuvert] = useState(true);
  const [showCal, setShowCal] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());

  // Données réelles issues du backend (table pause_figee) — plus aucune
  // dépendance à agentProfiles pour la lecture/écriture, ce qui évite le bug
  // où une resynchronisation de profil (au focus, au refresh) écrasait les
  // pauses figées saisies localement puisqu'elles n'étaient jamais réellement
  // envoyées au serveur.
  const [pausesData, setPausesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const agentId = agent?.cp || agent?.immatriculation || agent?.id;

  const recharger = () => {
    if(!agentId) return;
    setLoadError(null);
    api.pauses.getAll(agentId).then(rows=>{
      setPausesData(Array.isArray(rows)?rows:[]);
      setLoading(false);
    }).catch(()=>{
      setLoadError("Impossible de charger les pauses figées. Vérifie ta connexion et réessaie.");
      setLoading(false);
    });
  };
  useEffect(()=>{ setLoading(true); recharger(); },[agentId]); // eslint-disable-line

  const allDates = useMemo(()=>{
    const obj = {};
    pausesData.forEach(p=>{ obj[String(p.date_jour).slice(0,10)] = true; });
    return obj;
  },[pausesData]);
  const fiaMois = useMemo(()=>{
    const obj = {};
    pausesData.forEach(p=>{ if(p.mois_fia) obj[String(p.date_jour).slice(0,10)] = p.mois_fia; });
    return obj;
  },[pausesData]);
  const fiaDone = useMemo(()=>{
    const obj = {};
    pausesData.forEach(p=>{ if(p.fia_done) obj[String(p.date_jour).slice(0,10)] = true; });
    return obj;
  },[pausesData]);

  const allDatesSorted = Object.keys(allDates).sort();

  const totalMinutesAll = allDatesSorted.length * 90;
  const totalHAll = Math.floor(totalMinutesAll/60);
  const totalMAll = totalMinutesAll%60;

  const toggleDate = (dk) => {
    if(allDates[dk]){
      api.pauses.delete(agentId, dk).then(recharger).catch(()=>setLoadError("Erreur lors de la suppression de cette journée. Réessaie."));
    } else {
      api.pauses.add(agentId, dk).then(recharger).catch(()=>setLoadError("Erreur lors de l'ajout de cette journée. Réessaie."));
    }
  };

  const setFiaMois = (dk, moisKey) => {
    api.pauses.setFiaMois(agentId, dk, moisKey||null).then(recharger).catch(()=>setLoadError("Erreur lors de la mise à jour du mois FIA. Réessaie."));
  };
  const toggleFiaDone = (dk) => {
    const nouveauDone = !fiaDone[dk];
    if(!nouveauDone){
      // On décoche une FIA : on efface aussi le mois renseigné, pour repartir
      // vraiment de zéro (sinon la fiche restait affichée alors que ce n'est
      // plus confirmé).
      Promise.all([
        api.pauses.setFiaDone(agentId, dk, false),
        api.pauses.setFiaMois(agentId, dk, null),
      ]).then(recharger).catch(()=>setLoadError("Erreur lors de la mise à jour. Réessaie."));
    } else {
      api.pauses.setFiaDone(agentId, dk, true).then(recharger).catch(()=>setLoadError("Erreur lors de la mise à jour. Réessaie."));
    }
  };

  // Tri des journées :
  // - En haut : journées SANS mois FIA (orange) — triées par date croissante (les plus urgentes en premier)
  // - En bas  : journées AVEC mois FIA (vert)   — triées par mois FIA décroissant (les plus récentes en premier)
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

  const nbFiaDone = allDatesSorted.filter(dk=>fiaDone[dk]).length;
  const nbFiaRestant = allDatesSorted.length - nbFiaDone;

  if(loading){
    return(
      <div style={{margin:"20px 0 8px",background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",
        overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.05)",padding:"20px",textAlign:"center",
        color:"#94a3b8",fontSize:13}}>
        Chargement des pauses figées…
      </div>
    );
  }

  return(
    <div style={{margin:"20px 0 8px",background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",
      overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>

      {loadError&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
        padding:"10px 14px",background:"#fee2e2",borderBottom:"1.5px solid #fca5a5"}}>
        <span style={{fontSize:12,fontWeight:600,color:"#991b1b"}}>{loadError}</span>
        <button onClick={recharger} style={{border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,
          fontWeight:700,cursor:"pointer",background:"#991b1b",color:"#fff",flexShrink:0}}>Réessayer</button>
      </div>}

      {/* ── Header cliquable ── */}
      <div onClick={()=>setOuvert(o=>!o)}
        style={{background:"#0C447C",padding:"14px 18px",
          display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none",flexWrap:"wrap"}}>
        <span style={{fontSize:17}}>⏸️</span>
        <div style={{flex:1,minWidth:160}}>
          <div style={{color:"#fff",fontSize:15,fontWeight:800}}>Mémo pauses figées</div>
          <div style={{color:"#B5D4F4",fontSize:12,marginTop:2,fontWeight:600}}>
            {allDatesSorted.length} jour{allDatesSorted.length>1?"s":""} · {totalHAll}h{String(totalMAll).padStart(2,'0')} TC
            {nbFiaDone>0&&<span style={{marginLeft:8,background:"rgba(255,255,255,.25)",
              borderRadius:10,padding:"2px 8px"}}>✅ {nbFiaDone} FIA</span>}
            {nbFiaRestant>0&&<span style={{marginLeft:4,background:"rgba(255,255,255,.2)",
              borderRadius:10,padding:"2px 8px"}}>⏳ {nbFiaRestant} en attente</span>}
          </div>
        </div>
        <span style={{color:"#fff",fontSize:18,fontWeight:700,
          display:"inline-flex",alignItems:"center",justifyContent:"center",width:36,height:36,
          transform:ouvert?"rotate(0deg)":"rotate(-90deg)",
          transition:"transform .2s",flexShrink:0}} title={ouvert?"Réduire":"Déplier"}>▼</span>
      </div>

      {ouvert&&<>
        {/* ── Bouton pour afficher/masquer le calendrier d'ajout ── */}
        <div style={{padding:"12px 14px",borderBottom:"1px solid #e2e8f0",background:"#f8fafc"}}>
          <button onClick={()=>setShowCal(v=>!v)}
            style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              background:showCal?"#f1f5f9":"#E6F1FB",
              border:`1px solid ${showCal?"#cbd5e1":"#B5D4F4"}`,color:showCal?"#334155":"#0C447C",
              borderRadius:10,padding:"12px 16px",
              cursor:"pointer",fontSize:14,fontWeight:600,minHeight:44}}>
            {showCal?"✕ Fermer le calendrier":"📅 Ajouter une journée"}
          </button>
        </div>

        {/* ── Calendrier ajout ── */}
        {showCal&&<div style={{padding:"14px",borderBottom:"1px solid #e2e8f0",background:"#f0f9ff"}}>
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

        {/* ── Jours triés : orange (sans FIA) en haut, vert (avec FIA) en bas ── */}
        {(()=>{
          const renderGroupe = (moisKey, dates, isVert) => {
            const [annee, mois] = moisKey.split("-").map(Number);
            const nbMin = dates.length * 90;
            const h = Math.floor(nbMin/60);
            const m2 = nbMin%60;
            const fiaRef = isVert ? fiaMois[dates[0]] : null;
            const fiaLabel = fiaRef
              ? `FIA ${MOIS_L[parseInt(fiaRef.slice(5,7))-1]} ${fiaRef.slice(0,4)}`
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
                          <div style={{display:"flex",alignItems:"center",gap:7,marginTop:7,flexWrap:"wrap"}}>
                            <span style={{fontSize:12,color:done?"#04342C":"#712B13",fontWeight:600,whiteSpace:"nowrap"}}>
                              Prise FIA :
                            </span>
                            <select value={moisFia} disabled={!done}
                              title={!done?"Confirme d'abord avec le bouton FIA pour pouvoir choisir un mois":""}
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
                            title={done?"Retirer FIA":"Marquer pris en compte FIA"}
                            style={{background:done?"#1D9E75":"#fff",
                              border:`1px solid ${done?"#0F6E56":"#F0997B"}`,
                              color:done?"#fff":"#712B13",
                              borderRadius:9,padding:"10px 13px",cursor:"pointer",
                              fontSize:13,fontWeight:600,whiteSpace:"nowrap",minHeight:42}}>
                            {done?"✓ FIA":"FIA ?"}
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
              Aucune pause figée enregistrée
            </div>
          );

          return(
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {parMoisOrange.length>0&&<>
                <div style={{padding:"5px 14px",background:"#FAECE7",
                  borderBottom:"1px solid #F0997B"}}>
                  <span style={{fontSize:10,fontWeight:700,color:"#712B13",letterSpacing:.5}}>
                    ⏳ EN ATTENTE DE PRISE EN COMPTE FIA ({datesOrange.length})
                  </span>
                </div>
                {parMoisOrange.map(([moisKey,dates])=>renderGroupe(moisKey,dates,false))}
              </>}

              {parMoisVert.length>0&&<>
                <div style={{padding:"5px 14px",background:"#E1F5EE",
                  borderBottom:"1px solid #5DCAA5",
                  borderTop:parMoisOrange.length>0?"2px solid #e2e8f0":"none"}}>
                  <span style={{fontSize:10,fontWeight:700,color:"#04342C",letterSpacing:.5}}>
                    ✅ PRISES EN COMPTE SUR FIA ({datesVertes.length})
                  </span>
                </div>
                {parMoisVert.map(([moisKey,dates])=>renderGroupe(moisKey,dates,true))}
              </>}

              <div style={{padding:"10px 14px",background:"#E6F1FB",
                display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                <span style={{fontSize:12,fontWeight:600,color:"#0C447C"}}>Total TC généré</span>
                <span style={{fontSize:13,fontWeight:700,color:"#0C447C"}}>
                  {totalHAll}h{String(totalMAll).padStart(2,'0')}
                  <span style={{fontSize:10,fontWeight:500,color:"#185FA5",marginLeft:5}}>
                    ({allDatesSorted.length} × 1h30)
                  </span>
                </span>
                {nbFiaDone>0&&<span style={{fontSize:11,color:"#0F6E56",fontWeight:600,width:"100%"}}>
                  ✅ {datesVertes.length} prise{datesVertes.length>1?"s":""} en compte FIA
                  {datesOrange.length>0&&` · ⏳ ${datesOrange.length} en attente`}
                </span>}
              </div>
            </div>
          );
        })()}
      </>}
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

// ─── VUE PLANNING (style Google Calendar) ────────────────────────────────────
// Grille 0h-24h scrollable verticalement, un bloc par jour en colonne

// Parse "06h10" → minutes depuis minuit
function parseHeures(h) {
  if(!h) return null;
  const m = h.match(/(\d{1,2})h(\d{2})/);
  if(!m) return null;
  return parseInt(m[1])*60 + parseInt(m[2]);
}

// Retourne {debut, fin} en minutes pour un code équipe
function getPlageMinutes(code) {
  const heures = EQ[code]?.heures || "";
  if(!heures) return null;
  const parts = heures.split("–");
  if(parts.length !== 2) return null;
  const debut = parseHeures(parts[0].trim());
  let fin   = parseHeures(parts[1].trim());
  if(debut===null||fin===null) return null;
  // Nuit : fin < debut → fin le lendemain (ex 22h15-06h17)
  if(fin < debut) fin += 1440;
  return {debut, fin};
}

function VuePlanning({dates, agent, schedule, getColor, getTc, isOwnProfile, onDayClick}){
  const todayRowRef = useRef(null);
  useEffect(()=>{ todayRowRef.current?.scrollIntoView({block:"center"}); },[dates]);
  useEffect(()=>{
    const handler=()=>todayRowRef.current?.scrollIntoView({block:"center",behavior:"smooth"});
    window.addEventListener("f2ppmp:scrolltoday",handler);
    return ()=>window.removeEventListener("f2ppmp:scrolltoday",handler);
  },[]);
  // Vue liste verticale scrollable (style Google Agenda mobile)
  // Un jour par ligne, bloc horaire visuel à droite

  const JOURS_LONG = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
  const BAR_PX_PER_MIN = 0.5; // 1px = 2 minutes → barre de 480px pour 24h

  const lignes = dates.map(dk=>{
    const agKeyL=agent?.immatriculation||agent?.cp||agent?.id;
    const en   = schedule[`${agKeyL}-${dk}`];
    const code = en?.equipe;
    const eq   = code ? EQ[code] : null;
    const isPrive  = en?.prive||eq?.prive||false;
    const showData = isOwnProfile||!isPrive;
    const jsCode = en?.jsCode||null;
    const dow   = new Date(dk).getDay();
    const isWE  = dow===0||dow===6;
    const isToday = dk===TODAY;

    let plage = null;
    let label = null;
    let couleur = "#f1f5f9";
    let tc = "#94a3b8";

    if(code && showData){
      label   = eq?.label||code;
      couleur = getColor(code);
      tc      = getTc(code);
      plage   = getPlageMinutes(code);
    }

    const d = new Date(dk);
    return {dk, code, eq, label, plage, couleur, tc, isWE, isToday, dow, jsCode, showData,
      jourNom: JOURS_LONG[dow],
      jourNum: d.getDate(),
      moisNom: d.toLocaleDateString("fr-FR",{month:"short"})};
  });

  // Grouper par semaine pour afficher un séparateur
  const lignesAvecSep = [];
  let dernSemaine = null;
  lignes.forEach(l=>{
    const d = new Date(l.dk);
    // Numéro de semaine ISO
    const sem = Math.ceil((((d - new Date(d.getFullYear(),0,1))/86400000)+1)/7);
    if(sem !== dernSemaine){
      dernSemaine = sem;
    }
    lignesAvecSep.push(l);
  });

  return(
    <div style={{border:"1.5px solid #e2e8f0",borderRadius:14,overflow:"hidden",background:"#fff"}}>
      {/* Légende */}
      <div style={{padding:"8px 14px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",
        display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:11,fontWeight:700,color:"#64748b"}}>📋 Vue Planning</span>
        <span style={{fontSize:9,color:"#94a3b8"}}>— Scroll pour naviguer dans le mois</span>
      </div>

      {/* Liste des jours */}
      <div style={{overflowY:"auto",maxHeight:"75vh",WebkitOverflowScrolling:"touch"}}>
        {lignesAvecSep.map((l,i)=>{
          const isFirstOfMonth = l.jourNum===1;
          return(
            <div key={l.dk}>
              {/* Séparateur semaine si lundi */}
              {l.dow===1&&i>0&&<div style={{height:1,background:"#e2e8f0",margin:"0 14px"}}/>}

              {/* Ligne jour */}
              <div ref={l.isToday?todayRowRef:null} onClick={()=>onDayClick&&onDayClick(l.dk, schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]||null)} style={{
                display:"flex",alignItems:"stretch",
                minHeight:48,
                background:l.isToday?"#eef2ff":l.isWE?"#fafafa":"#fff",
                borderBottom:"1px solid #f8fafc",
                borderLeft:l.isToday?"3px solid #6366f1":"3px solid transparent",
                cursor:"pointer",
              }}>
                {/* Colonne date */}
                <div style={{
                  width:56,flexShrink:0,
                  display:"flex",flexDirection:"column",
                  alignItems:"center",justifyContent:"center",
                  padding:"6px 4px",
                  borderRight:"1px solid #f1f5f9",
                }}>
                  <div style={{
                    fontSize:10,fontWeight:700,
                    color:l.isToday?"#6366f1":l.isWE?"#f97316":"#94a3b8",
                    textTransform:"uppercase",letterSpacing:.3,
                  }}>{l.jourNom.slice(0,3)}</div>
                  <div style={{
                    fontSize:18,fontWeight:l.isToday?900:600,
                    color:l.isToday?"#fff":"#1e293b",
                    background:l.isToday?"#6366f1":"transparent",
                    borderRadius:"50%",width:32,height:32,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    lineHeight:1,
                  }}>{l.jourNum}</div>
                  <div style={{fontSize:8,color:"#94a3b8",marginTop:1}}>{l.moisNom}</div>
                </div>

                {/* Contenu : bloc équipe */}
                <div style={{flex:1,padding:"6px 10px",display:"flex",
                  flexDirection:"column",justifyContent:"center",gap:4}}>
                  {schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]?.finNuit&&<div style={{fontSize:11,color:"#0369a1",background:"#f0f9ff",borderRadius:6,padding:"2px 8px",marginBottom:4,display:"inline-flex",alignItems:"center",gap:4,fontWeight:700}}>🌙 Descente de nuit</div>}
                  {isOwnProfile&&schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]?.notePerso&&<div style={{fontSize:11,color:"#fff",background:getColor("NOTE"),borderRadius:6,padding:"3px 9px",marginBottom:4,display:"inline-flex",alignItems:"center",gap:4,fontWeight:700}}>📝 {schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`].notePerso}</div>}
                    {l.code&&l.showData?(
                    <div>
                      {/* Badge code + label */}
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                        {l.code==="RPP"?(
                          <span style={{
                            display:"flex",alignItems:"center",justifyContent:"center",
                            width:36,height:36,borderRadius:"50%",
                            background:l.couleur,color:l.tc,
                            fontSize:11,fontWeight:800,
                            boxShadow:"0 1px 3px rgba(0,0,0,.12)",
                          }}>RPP</span>
                        ):(
                        <span style={{
                          background:l.couleur,color:l.tc,
                          borderRadius:8,padding:"3px 10px",
                          fontSize:12,fontWeight:800,
                          boxShadow:"0 1px 3px rgba(0,0,0,.12)",
                        }}>
                          {CODES_FETES[l.code]?"🩷":""}{l.label}
                        {l.jsCode&&!["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","DISPO","NU","TC","TY","RN","JF"].includes(l.jsCode)?<span style={{fontSize:10,opacity:.8}}> / {l.jsCode}</span>:null}</span>
                        )}
                        {l.eq?.heures&&<span style={{
                          fontSize:10,color:"#64748b",fontWeight:600,
                          fontFamily:"monospace",
                        }}>{l.eq.heures}</span>}
                      </div>

                      {/* Badge nuit du soir */}
                      {schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]?.equipe2==="N"&&l.code!=="N"&&l.showData&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                        <span style={{background:getColor("N"),color:getTc("N"),borderRadius:8,padding:"3px 10px",fontSize:12,fontWeight:800,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><span>Nuit</span>{schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]?.jsCode2&&<span style={{fontSize:10,opacity:.85,fontWeight:500}}>{schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]?.jsCode2}</span>}</span>
                      </div>}
                      {/* Barre horaire visuelle */}
                      {l.plage&&(()=>{
                        const totalMin = 24*60;
                        const debutPct = Math.min(l.plage.debut/totalMin*100,100);
                        const largeurPct = Math.min((l.plage.fin-l.plage.debut)/totalMin*100,100-debutPct);
                        return(
                          <div style={{position:"relative",height:8,
                            background:"#f1f5f9",borderRadius:4,overflow:"visible"}}>
                            {/* Fond barre */}
                            <div style={{
                              position:"absolute",
                              left:`${debutPct}%`,
                              width:`${largeurPct}%`,
                              height:"100%",
                              background:l.couleur,
                              borderRadius:4,
                              minWidth:3,
                            }}/>
                            {/* Marqueurs 6h, 12h, 18h */}
                            {[6,12,18].map(h=>(
                              <div key={h} style={{
                                position:"absolute",
                                left:`${h/24*100}%`,
                                top:-2,bottom:-2,
                                width:1,background:"rgba(0,0,0,.08)",
                              }}/>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Ligne "maintenant" si aujourd'hui */}
                      {l.isToday&&(()=>{
                        const now = new Date();
                        const minNow = now.getHours()*60+now.getMinutes();
                        const pct = minNow/1440*100;
                        return(
                          <div style={{position:"relative",height:2,marginTop:2}}>
                            <div style={{
                              position:"absolute",
                              left:`${pct}%`,
                              top:0,
                              width:3,height:3,
                              borderRadius:"50%",
                              background:"#ef4444",
                              transform:"translateX(-50%)",
                            }}/>
                            <div style={{
                              position:"absolute",
                              left:`${pct}%`,
                              right:0,
                              height:1,
                              background:"#ef4444",
                              opacity:.4,
                            }}/>
                          </div>
                        );
                      })()}
                    </div>
                  ):(
                    <div style={{fontSize:10,color:"#cbd5e1",fontStyle:"italic"}}>
                      {l.showData?"—":"·"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
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

// Détecte automatiquement la famille habilitée d'un réserviste
// en analysant les codes jsCode de son planning (PICCL-, PIADJ-, PAAC-, etc.)
function detectFamillesReserviste(agentId, schedule){
  let hasPRCI = false, hasPAR = false;
  Object.entries(schedule).forEach(([k,v])=>{
    if(!k.startsWith(agentId+"-")) return;
    const js = v?.jsCode||"";
    if(js.startsWith("PI") || js.startsWith("PI")) hasPRCI = true;
    if(js.startsWith("PA")) hasPAR = true;
  });
  if(hasPRCI && hasPAR) return "BOTH";
  if(hasPRCI) return "PRCI";
  if(hasPAR) return "PAR";
  return null;
}

function PersonalView({agent,schedule,setSchedule,weekOffset,setWeekOffset,onImportDP,agentProfiles,setAgentProfiles,onFetePaye,isAdmin,currentUser,agentCouleurs,setAgentCouleurs,echangesCount,onOpenEchanges}){
  const [echangesDismissedCount,setEchangesDismissedCount]=usePersist("echangesDismissedCount",0);
  const [showHab,setShowHab]=useState(false);
  const [showHabRoul,setShowHabRoul]=useState(false);
  const [calView,setCalView]=useState("mois");
  const [dayPopup,setDayPopup]=useState(null); // {dk, entry}
  const [monthOff,setMonthOff]=useState(0);
  const personalDateJumpRef=useRef();
  const jumpToWeekDate=(dateStr)=>{
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
  };
  const jumpToMonthDate=(dateStr)=>{
    const target=new Date(dateStr+"T12:00:00");
    const today=new Date();
    const diffMonths=(target.getFullYear()*12+target.getMonth())-(today.getFullYear()*12+today.getMonth());
    setMonthOff(diffMonths);
  };
  const swipeWeek=useSwipeHandlers(()=>setWeekOffset(w=>w+1),()=>setWeekOffset(w=>w-1));
  const swipeMonth=useSwipeHandlers(()=>setMonthOff(m=>m+1),()=>setMonthOff(m=>m-1));
  const [showColorPicker,setShowColorPicker]=useState(false);
  // agentColors : stocké dans agentProfiles pour sync Supabase + réactivité immédiate
  // Source unique de vérité : agentProfiles[agent.id].agentColors
  const agKeyColors=agent?.immatriculation||agent?.cp||agent?.id;const agentColors = agentProfiles[agKeyColors]?.agentColors || {};

  // Setter : met à jour agentProfiles directement (→ Supabase via useEffect save)
  const setAgentColors = (updater) => {
    if(typeof setAgentCouleurs !== "function") { console.error("setAgentCouleurs is not a function!"); return; }
    const current = agentCouleurs || {};
    const next = typeof updater==="function" ? updater(current) : updater;
    setAgentCouleurs(next||{});
    setAgentProfiles(p=>{
      const key=agent?.immatriculation||agent?.cp||agent?.id;
      return {...p,[key]:{...(p[key]||{}),agentColors:next||{}}};
    });
  };

  // v2 - Couleur effective pour un code
  const getColor=(code)=>{
    const colors = agentCouleurs || {};

    if(colors[code]) return colors[code];
    // Fêtes légales F1..VN → couleur perso de F1 ou défaut rose
    if(CODES_FETES[code]) return colors["F1"] || "#ec4899";
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
  const [showDemandeConges,setShowDemandeConges]=useState(false);
  const [showAccordConges,setShowAccordConges]=useState(false);
  const [demandeCourante,setDemandeCourante]=useState(null);
  const [accords,setAccords]=useState([]);
  const weekDates=useMemo(()=>getWeekDates(weekOffset),[weekOffset]);
  const currentYear=new Date().getFullYear();
  const [compteurYear,setCompteurYear]=useState(currentYear);

  if(!agent)return(<div style={{textAlign:"center",padding:"60px 20px",color:"#94a3b8"}}>
    <div style={{fontSize:40,marginBottom:12}}>👤</div>
    <div style={{fontSize:15,fontWeight:600,color:"#475569"}}>Sélectionne ton profil</div>
  </div>);

  const fam=FAMILLES[agent.famille];
 const agKey=agent.immatriculation||agent.cp||agent.id;
const profile=agentProfiles[agKey]||{};
const setProfile=u=>setAgentProfiles(p=>({...p,[agKey]:{...profile,...u}}));
  const hasPin=!!profile.pinHash;
  const ROULEMENTS=["Roulement 3×8","Journée"];
  const nbHab=Object.keys(profile.habilitations||{}).length;
  const nbValid=Object.values(profile.habilitations||{}).filter(v=>v==="HC").length;
  const postesDetectes=[...new Set(Object.entries(schedule).filter(([k])=>k.startsWith(agent.id+"-")).map(([,v])=>v?.poste||v?.jsCode).filter(Boolean))];

  return(<div style={{display:"flex",flexDirection:"column",gap:18}}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

    {/* ── BANDEAU PROFIL ÉTENDU ── */}
   
<AgentHeader agent={agent} profile={profile} compteurYear={compteurYear} setCompteurYear={setCompteurYear} onImportDP={onImportDP} onDemandeConges={()=>setShowDemandeConges(true)} onCouleurs={()=>setShowColorPicker(true)} onHabilitations={()=>setShowHab(true)} onRoulementChange={r=>setProfile({roulement:r})} onReservisteChange={v=>setProfile({isReserve:v})} isOwnProfile={isOwnProfile}/>
    {typeof onOpenEchanges==="function"&&(echangesCount||0)>echangesDismissedCount&&<div style={{display:"flex",alignItems:"stretch",gap:6,border:"1.5px solid "+(echangesCount>0?"#fdba74":"#e2e8f0"),background:echangesCount>0?"#fef3c7":"#f8fafc",borderRadius:12,padding:"4px 4px 4px 16px"}}>
      <button onClick={onOpenEchanges} style={{display:"flex",alignItems:"center",justifyContent:"space-between",border:"none",background:"none",cursor:"pointer",fontSize:14,fontWeight:700,color:"#1e293b",flex:1,padding:"8px 0",textAlign:"left"}}>
        <span>🔄 Échanges</span>
        {echangesCount>0&&<span style={{background:"#dc2626",color:"#fff",borderRadius:10,padding:"2px 9px",fontSize:12,fontWeight:700,marginRight:8}}>{echangesCount}</span>}
      </button>
      <button onClick={()=>setEchangesDismissedCount(echangesCount||0)} title="Masquer ce bandeau" style={{border:"none",background:"none",cursor:"pointer",fontSize:17,color:"#94a3b8",padding:"0 10px"}}>✕</button>
    </div>}
    {demandeCourante&&(()=>{
      const acc=accords.find(a=>a.demandeId===demandeCourante.id);
      const isAccorde=acc&&acc.accorde; const isRefuse=acc&&!acc.accorde;
      return <div style={{background:isAccorde?"#d1fae5":isRefuse?"#fee2e2":"#fff7ed",border:`1.5px solid ${isAccorde?"#6ee7b7":isRefuse?"#fca5a5":"#fed7aa"}`,borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"flex-start",gap:10}}>
        <span style={{fontSize:18}}>{isAccorde?"✅":isRefuse?"❌":"⏳"}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:800,color:isAccorde?"#065f46":isRefuse?"#991b1b":"#c2410c"}}>{isAccorde?"Congé ACCORDÉ":isRefuse?"Congé REFUSÉ":"Congé DEMANDÉ — en attente"}</div>
          <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{demandeCourante.nature} · Du {demandeCourante.debut1&&new Date(demandeCourante.debut1).toLocaleDateString("fr-FR")} au {demandeCourante.fin1&&new Date(demandeCourante.fin1).toLocaleDateString("fr-FR")} · <strong>{demandeCourante.nb_jours}j</strong></div>
          <div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>Demandé le {demandeCourante.datedemande&&new Date(demandeCourante.datedemande).toLocaleDateString("fr-FR")}{acc?.dateAccord&&` · ${isAccorde?"Accordé":"Refusé"} le ${new Date(acc.dateAccord).toLocaleDateString("fr-FR")}`}</div>
          {isAccorde&&acc.decompte&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:5}}>{Object.entries(acc.decompte).filter(([,v])=>v>0).map(([k,v])=><span key={k} style={{fontSize:9,background:"rgba(255,255,255,.7)",border:"1px solid #6ee7b7",borderRadius:6,padding:"1px 7px",fontWeight:700,color:"#065f46"}}>{k}:{v}j</span>)}</div>}
        </div>
        {!isAccorde&&!isRefuse&&<button onClick={()=>setShowAccordConges(true)} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>📥 Importer accord</button>}
      </div>;
    })()}

    {/* Toggle vue semaine / mois */}
    {/* Toggle vue semaine / mois */}
    {/* BULLETIN_IMPORT_REPOSITIONNE */}
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <div style={{display:"flex",background:"#f1f5f9",borderRadius:10,padding:3,gap:2}}>
        {[["mois","📆 Mois"],["semaine","📅 Semaine"],["planning","📋 Planning"]].map(([k,l])=>(
          <button key={k} onClick={()=>setCalView(k)} style={{border:"none",borderRadius:8,padding:"7px 16px",cursor:"pointer",background:calView===k?"#fff":"transparent",color:calView===k?"#1e293b":"#475569",fontSize:"clamp(12px,1.4vw,15px)",fontWeight:calView===k?700:600,boxShadow:calView===k?"0 1px 4px rgba(0,0,0,.08)":"none"}}>
            {l}
          </button>
        ))}
      </div>
      {/* Nav selon la vue */}
      {calView==="semaine"?<>
        <button onClick={()=>setWeekOffset(0)} style={{display:"flex",alignItems:"center",gap:5,border:"1.5px solid #6366f1",background:weekOffset===0?"#f1f5f9":"#eef2ff",color:weekOffset===0?"#475569":"#4f46e5",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:"clamp(12px,1.4vw,15px)",fontWeight:700}}>Aujourd'hui</button>
        <button onClick={()=>{try{personalDateJumpRef.current.showPicker();}catch(e){personalDateJumpRef.current&&personalDateJumpRef.current.click();}}} style={{display:"flex",alignItems:"center",gap:4,border:"none",background:"none",cursor:"pointer",flex:1}}>
          <span style={{fontSize:12,color:"#475569",fontWeight:700}}>{weekDates[0]?.slice(8)}/{weekDates[0]?.slice(5,7)}–{weekDates[6]?.slice(8)}/{weekDates[6]?.slice(5,7)}</span>
          <span style={{fontSize:11,color:"#94a3b8"}}>▾</span>
        </button>
      </>:<>
        <button onClick={()=>{setMonthOff(0);window.dispatchEvent(new CustomEvent("f2ppmp:scrolltoday"));}} style={{display:"flex",alignItems:"center",gap:5,border:"1.5px solid #6366f1",background:monthOff===0?"#f1f5f9":"#eef2ff",color:monthOff===0?"#475569":"#4f46e5",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:"clamp(12px,1.4vw,15px)",fontWeight:700,flexShrink:0}}>Aujourd'hui</button>
        <button onClick={()=>{try{personalDateJumpRef.current.showPicker();}catch(e){personalDateJumpRef.current&&personalDateJumpRef.current.click();}}} style={{display:"flex",alignItems:"center",gap:4,border:"none",background:"none",cursor:"pointer",flex:1}}>
          <span style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{MOIS_L[curMonth].slice(0,4)} {curYear}</span>
          <span style={{fontSize:11,color:"#94a3b8"}}>▾</span>
        </button>
      </>}
      {isOwnProfile && <BulletinImportButton agentCp={agent.immatriculation||agent.cp||agent.id} onImported={()=>{
        const agCp=agent.immatriculation||agent.cp||agent.id;
        api.planning.getSchedule(agCp).then(entries=>{ if (entries) setSchedule(prev=>({...prev, ...entries})); });
      }}/>}
    </div>

    <input ref={personalDateJumpRef} type="date" onChange={e=>{if(e.target.value){if(calView==="semaine")jumpToWeekDate(e.target.value);else jumpToMonthDate(e.target.value);}}} style={{position:"absolute",width:0,height:0,opacity:0,pointerEvents:"none",border:"none"}}/>
    {/* ── VUE SEMAINE ── */}
    {calView==="semaine"&&<>
      <div onTouchStart={swipeWeek.onTouchStart} onTouchEnd={swipeWeek.onTouchEnd} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
        {weekDates.map((dk,i)=>{
          const en=schedule[`${agent.id}-${dk}`];
          const code=en?.equipe;
          const eq=EQ_COLORS[code]||EQ[code];
          const isPrive=en?.prive||eq?.prive||false;
          const showData=isOwnProfile||!isPrive;
          const isToday=dk===TODAY;
          const dow=new Date(dk).getDay();
          const isWE=dow===0||dow===6;
          const hasNuit2=en?.equipe2==="N";
          const isFinNuit2=en?.finNuit;
          const barColor=isFinNuit2?"#1e3a8a":code&&showData?getColor(code):isWE?"#e2e8f0":"#f1f5f9";

          return <div key={dk}
            onClick={()=>{
              if(isOwnProfile) setDayPopup({dk, entry:en||null});
            }}
            style={{
            borderRadius:12,
            overflow:"hidden",
            background:codeActif&&code===codeActif?"#fafafa":"#fff",
            border:codeActif?(code===codeActif?"2px solid #6366f1":"1.5px solid rgba(99,102,241,.3)")
              :isToday?"2px solid #6366f1":"1.5px solid #e2e8f0",
            boxShadow:isToday?"0 0 0 3px #eef2ff":"0 1px 3px rgba(0,0,0,.06)",
            display:"flex",
            flexDirection:"column",
            minHeight:110,
            cursor:"pointer",
          }}>
            {/* Barre colorée en haut */}
            <div style={{
              height:6,
              background:barColor,
              borderRadius:"10px 10px 0 0",
            }}/>

            {/* Header jour */}
            <div style={{
              padding:"6px 8px 4px",
              borderBottom:"1px solid #f1f5f9",
              background:isToday?"#f5f3ff":isWE?"#f8fafc":"#fff",
            }}>
              <div style={{fontSize:"clamp(11px,1.4vw,15px)",fontWeight:isToday?800:700,
                color:isToday?"#6366f1":isWE?"#b45309":"#1e293b"}}>
                {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"][i]}
              </div>
              <div style={{fontSize:"clamp(11px,1.4vw,15px)",fontWeight:700,color:isToday?"#6366f1":"#334155",marginTop:1}}>
                {dk?.slice(8)}/{dk?.slice(5,7)}
              </div>
            </div>

            {/* Contenu */}
            <div style={{padding:"6px 7px",flex:1,display:"flex",flexDirection:"column",gap:4}}>
           {/* ZONE 1 — 🌙 descente de nuit (haut) */}
              {en?.finNuit&&showData&&<div style={{
                background:"#f0f9ff",color:"#0369a1",
                borderRadius:5,padding:"2px 6px",
                fontSize:10,fontWeight:700,
                display:"inline-flex",alignItems:"center",gap:4,
                alignSelf:"flex-start",
              }}>🌙</div>}
              {isOwnProfile&&en?.notePerso&&!code&&<div style={{
                background:getColor("NOTE"),color:"#fff",
                borderRadius:5,padding:"3px 7px",
                fontSize:10,fontWeight:700,lineHeight:1.3,
                display:"flex",alignItems:"flex-start",gap:4,
              }}>📝 <span>{en.notePerso}</span></div>}

              {/* ZONE 2 — Utilisation journée (milieu) */}
              {code&&showData&&code!=="N"&&code!=="RPP"&&<div style={{
                background:getColor(code),color:getTc(code),
                borderRadius:8,padding:"4px 8px",
                fontSize:10,fontWeight:700,textAlign:"center",
                display:"flex",flexDirection:"column",gap:2,
              }}>
                <span style={CODES_FETES[code]?{fontSize:15,fontWeight:800}:undefined}>{CODES_FETES[code]?`🩷 ${code}`:(eq?.label||code)}</span>
                {en?.jsCode&&!["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","DISPO","NU","TC","TY","RN","JF"].includes(en.jsCode)&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{getPosteLabelFromCode(en.jsCode)||en.jsCode}</span>}
                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:9,fontWeight:700,color:"#fff",background:getColor("NOTE"),borderRadius:4,padding:"1px 5px",marginTop:1}}>📝 {en.notePerso}</span>}
              </div>}

              {/* ZONE 2bis — RPP : badge rond dédié, centré, palette dissociée de RP */}
              {code==="RPP"&&showData&&<div style={{
                display:"flex", alignItems:"center", justifyContent:"center",
                width:32, height:32, borderRadius:"50%",
                background:getColor("RPP"), color:getTc("RPP"),
                fontSize:10, fontWeight:800, alignSelf:"center",
                flexShrink:0, margin:"2px auto",
              }}>
                RPP
              </div>}
              {code==="RPP"&&showData&&isOwnProfile&&en?.notePerso&&<span style={{
                fontSize:9, color:"#fff", fontWeight:700,
                background:getColor("NOTE"), borderRadius:4, padding:"1px 6px",
                textAlign:"center", display:"block", margin:"0 auto",
              }}>📝 {en.notePerso}</span>}

              {/* ZONE 3 — Nuit (bas) */}
              {(code==="N"||en?.equipe2==="N")&&showData&&<div style={{
                background:getColor("N"),color:getTc("N"),
                borderRadius:8,padding:"4px 8px",
                fontSize:10,fontWeight:700,textAlign:"center",
                display:"flex",flexDirection:"column",gap:2,
              }}>
                <span>Nuit</span>
                {(code==="N"?en?.jsCode:en?.jsCode2)&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{getPosteLabelFromCode(code==="N"?en?.jsCode:en?.jsCode2)||(code==="N"?en?.jsCode:en?.jsCode2)}</span>}
              </div>}


              {/* Pastilles RC fêtes */}
              {(()=>{
                const rcFetes = getRCFetesDuJour(agent.id, dk, schedule, agentProfiles, parseInt(dk.slice(0,4)));
                if(!rcFetes.length) return null;
                return <div style={{display:"flex",flexWrap:"wrap",gap:2,marginTop:2}}>
                  {rcFetes.map(f=>(
                    <span key={f.code}
                      title={`${f.type==="fete"?"Fête prise":f.type==="RC_manuel"?"RC manuel":"RC"} : ${f.label}`}
                      style={{
                        display:"inline-flex",alignItems:"center",gap:2,
                        background:"#ec4899",color:"#fff",
                        borderRadius:6,padding:"1px 5px",
                        fontSize:8,fontWeight:800,
                        border:"1px solid #db2777",
                      }}>
                      🩷 {f.type!=="fete"?"RC-":""}{f.code}{f.type==="RC_manuel"&&<span style={{fontSize:6,opacity:.8}}> ✎</span>}
                    </span>
                  ))}
                </div>;
              })()}

              {/* Vide */}
              {!en&&<div style={{
                flex:1,display:"flex",alignItems:"center",justifyContent:"center",
                color:"#e2e8f0",fontSize:18,
              }}>—</div>}
            </div>

            

            
          </div>;
        })}
      </div>
    </>}

    {/* ── VUE MOIS ── */}
    {calView==="mois"&&<>

      {/* Grille mensuelle */}
      <div onTouchStart={swipeMonth.onTouchStart} onTouchEnd={swipeMonth.onTouchEnd} style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,overflow:"hidden"}}>
        {/* En-têtes jours */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#f8fafc",borderBottom:"1px solid #e2e8f0"}}>
          {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(d=>(
            <div key={d} style={{padding:"6px 4px",textAlign:"center",fontSize:"clamp(9px,1.2vw,13px)",fontWeight:800,color:"#475569",letterSpacing:.3}}>{d}</div>
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
            const posteLabel = en?.jsCode && !["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","DISPO","NU","TC","TY","RN","JF"].includes(en.jsCode) ? (getPosteLabelFromCode(en.jsCode) || en.jsCode) : null;

            const isNuitSeuleCell = code === "N" && !en?.equipe2 && !en?.finNuit;
            return <div key={dk}
              onClick={()=>{ if(isOwnProfile) setDayPopup({dk, entry:en||null}); }}
              style={{
                background:"#fff",
                border:isToday?"2px solid #6366f1":"1px solid #e8edf2",
                borderRadius:10, cursor:"pointer",
                position:"relative",
                boxShadow:isToday?"0 0 0 3px #eef2ff":"0 1px 3px rgba(0,0,0,.04)",
 padding:"4px 5px 5px", minHeight:48,
                display:"flex", flexDirection:"column", gap:3,
justifyContent: "flex-start",
              }}>
       {/* Numéro du jour */}
              <div style={{fontSize:"clamp(13px,1.8vw,18px)",fontWeight:isToday?800:700,
                color:isToday?"#6366f1":isWE?"#b45309":"#1e293b",
                lineHeight:1.3, marginBottom:1}}>{dayNum}</div>

              {/* ZONE 1 — 🌙 descente de nuit + 📝 note perso (toujours en haut) */}
              {en?.finNuit&&<div style={{
                background:"#f0f9ff", color:"#0369a1",
                borderRadius:5, padding:"2px 6px",
                fontSize:10, fontWeight:700,
                display:"inline-flex", alignItems:"center", gap:4,
                alignSelf:"flex-start",
              }}>
                🌙
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
                borderRadius:5, padding:CODES_FETES[code]?"4px 7px":"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span style={CODES_FETES[code]?{fontSize:14,fontWeight:800}:undefined}>{CODES_FETES[code]?("🩷 "+code):(EQ_COLORS[code]?.label||code)?.slice(0,5)}</span>
                {posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}
                {isOwnProfile&&en?.notePerso&&<span style={{fontSize:8,fontWeight:700,color:"#fff",background:getColor("NOTE"),borderRadius:4,padding:"1px 4px",marginTop:1,display:"inline-block"}}>📝 {en.notePerso}</span>}
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
              {code==="RPP"&&showData&&isOwnProfile&&en?.notePerso&&<span style={{
                fontSize:8, color:"#fff", fontWeight:700,
                background:getColor("NOTE"), borderRadius:4, padding:"1px 5px",
                textAlign:"center", display:"block", margin:"0 auto",
              }}>📝 {en.notePerso}</span>}

              {/* ZONE 3 — Nuit (toujours en bas) */}
              {(code==="N"||en?.equipe2==="N")&&showData&&<div style={{
                background:getColor("N"), color:getTc("N"),
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>Nuit</span>
                {(code==="N"?posteLabel:posteNuitLabel)&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{code==="N"?posteLabel:posteNuitLabel}</span>}
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
                      {f.type!=="fete"?"RC-":""}{f.code}{f.type==="RC_manuel"?" ✎":""}
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


    </>}
    {showColorPicker&&<ColorCustomizer
      agentColors={agentCouleurs||{}}
      setAgentColors={setAgentColors}
      onClose={()=>{
          setShowColorPicker(false);
          const agKeyS=agent?.immatriculation||agent?.cp||agent?.id;
          if(agentCouleurs&&Object.keys(agentCouleurs).length>0) api.profil.save(agKeyS, {agentColors: agentCouleurs});
        }}/>}

    {dayPopup&&<DayEditPopup
      date={dayPopup.dk}
      entry={dayPopup.entry}
      agent={agent}
      agentProfiles={agentProfiles}
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
          impressionAt: null,
        };
        // Sauvegarder localement
        setDayPopup(null);
        // Si tout vide (pas d'equipe, pas de nuit, pas de finNuit, pas de note) : supprimer la case
        const hasContent = !!(fullEntry.equipe || fullEntry.equipe2 || fullEntry.finNuit || fullEntry.notePerso);
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
          api.planning.getSchedule(agCp).then(entries=>{if(entries)setSchedule(prev=>({...prev,...entries}));});
        } catch(e) { console.error('Erreur save:', e); }
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
        } catch(e) { console.error('Erreur delete:', e); }
      }}
      onClose={()=>setDayPopup(null)}
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
    {/* ── VUE PLANNING ── */}
    {calView==="planning"&&<div onTouchStart={swipeMonth.onTouchStart} onTouchEnd={swipeMonth.onTouchEnd}>
      <VuePlanning
        dates={monthDates}
        agent={agent}
        schedule={schedule}
        getColor={getColor}
        getTc={getTc}
        isOwnProfile={isOwnProfile}
        onDayClick={(dk,en)=>{ if(isOwnProfile) setDayPopup({dk,entry:en||null}); }}
      />
    </div>}

    {/* Tableau de bord compteurs */}
    {agent&&<DashboardCompteurs agent={agent} schedule={schedule} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles}
        agentCouleurs={agentCouleurs} setAgentCouleurs={setAgentCouleurs} isOwnProfile={isOwnProfile} isAdmin={isAdmin}/>}
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

  const cloturer=async(id)=>{
    if(!cloturantCp){alert("Choisis avec qui tu as échangé.");return;}
    if(!window.confirm("Rappel : n'oublie pas d'indiquer cet échange dans le planning CPS officiel.\n\nConfirmer la clôture ?"))return;
    try{await api.echanges.cloturer(id,cloturantCp);setCloturantId(null);setCloturantCp("");charger();}catch(e){alert(e.message||"Erreur.");}
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

function ProfilPersoView({currentAgent,onPartageChange}){
  const [pinActuel,setPinActuel]=useState("");
  const [pinNouveau,setPinNouveau]=useState("");
  const [pinConfirme,setPinConfirme]=useState("");
  const [msg,setMsg]=useState(null);
  const [busy,setBusy]=useState(false);
  const [partageActif,setPartageActif]=useState(!!currentAgent?.partage_previsionnel);
  const [partageBusy,setPartageBusy]=useState(false);
  const [partageMsg,setPartageMsg]=useState(null);
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
  const dateKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  let jsCode=null, posteLabel=null;
  if(uoRow.cps_type==="journee"){
    const def=POSTES_JOURNEE.find(p=>p.jsCode===uoRow.cps_code);
    jsCode=uoRow.cps_code; posteLabel=def?.label||null;
  }else{
    const heure=now.getHours()*60+now.getMinutes();
    const shiftKey=(heure>=1335||heure<370)?"N":(heure<845)?"M":"AM";
    const liste=uoRow.cps_famille==="PAR"?POSTES_PAR_3x8:POSTES_PRCI_3x8;
    const def=liste.find(p=>p.code===uoRow.cps_code);
    if(!def) return null;
    jsCode=def[shiftKey]; posteLabel=def.label;
    if(!jsCode) return null;
  }
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

    <div>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",color:"#94a3b8",marginBottom:6,paddingLeft:2}}>Accès rapide</div>
      {accesRapide.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(78px,1fr))",gap:8}}>
        {accesRapide.map(a=>(
          <a key={a.id} href={`tel:${a.numero}`} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"10px 4px",borderRadius:12,border:"1.5px solid #e2e8f0",background:"#fff",textDecoration:"none"}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:"#D85A30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📞</div>
            <span style={{fontSize:11,fontWeight:600,textAlign:"center",lineHeight:1.2,color:"#1e293b"}}>{a.libelle}</span>
          </a>
        ))}
      </div>}
      {!gererAcces&&
        <button onClick={()=>setGererAcces(true)} style={{border:"none",background:"none",color:"#0C447C",fontWeight:600,fontSize:12,cursor:"pointer",marginTop:8,padding:0}}>Gérer les numéros d'accès rapide</button>}
      {gererAcces&&<div style={{marginTop:10,padding:12,borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc"}}>
        <button onClick={()=>setNouvelAcces(true)} style={{display:"flex",alignItems:"center",gap:5,border:"none",background:"none",color:"#0C447C",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:8,padding:0}}>+ Ajouter un numéro</button>
        {nouvelAcces&&<AccesRapideForm onCancel={()=>setNouvelAcces(false)} onSaved={()=>{setNouvelAcces(false);recharger();}}/>}
        {accesRapide.length===0&&!nouvelAcces&&<div style={{fontSize:13,color:"#64748b",marginBottom:4}}>Aucun numéro pour l'instant.</div>}
        {accesRapide.map(a=>editAccesId===a.id
          ? <AccesRapideForm key={a.id} initial={a} onCancel={()=>setEditAccesId(null)} onSaved={()=>{setEditAccesId(null);recharger();}} onDelete={()=>{api.annuaire.deleteAccesRapide(a.id).then(recharger);}}/>
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

    {activeTab==="agents"&&<div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:18}}>
      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        {filtreAgents.map(a=>(
          <div key={a.cp} style={{display:"flex",flexDirection:"column",gap:8,padding:"12px 4px",borderBottom:"1px solid #f1f5f9"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:16,color:"#1e293b"}}>{a.nom?.toUpperCase()} <span style={{fontWeight:500}}>{a.prenom}</span></div>
                <div style={{fontSize:13,color:"#64748b",fontWeight:500}}>{a.fonction||a.grade||""}</div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {a.telephone&&<a href={`tel:${a.telephone}`} style={{display:"flex",alignItems:"center",gap:7,textDecoration:"none",padding:"7px 12px",borderRadius:8,background:"#fef2f2",border:"1px solid #fecaca"}}>
                  <IconTel size={15}/>
                  <span style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{a.telephone}</span>
                </a>}
                {a.telephone&&<a href={`sms:${a.telephone}`} title="SMS" style={{display:"flex",alignItems:"center",justifyContent:"center",width:36,height:36,textDecoration:"none",borderRadius:8,background:"#f0fdf4",border:"1px solid #bbf7d0",fontSize:16}}>💬</a>}
                {a.email&&<a href={`mailto:${a.email}`} style={{display:"flex",alignItems:"center",gap:7,textDecoration:"none",padding:"7px 12px",borderRadius:8,background:"#eff6ff",border:"1px solid #bfdbfe"}}>
                  <span style={{fontSize:15}}>✉️</span>
                  <span style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{a.email}</span>
                </a>}
                {!a.telephone&&!a.email&&<span style={{fontSize:13,color:"#64748b",fontWeight:600}}>Non communiqué</span>}
              </div>
            </div>
          </div>
        ))}
        {filtreAgents.length===0&&<div style={{fontSize:13,color:"#94a3b8"}}>Aucun agent trouvé.</div>}
      </div>
    </div>}

    {activeTab==="uo"&&<div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:18}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
        <button onClick={()=>setNouvelUo(true)} style={{display:"flex",alignItems:"center",gap:5,border:"none",background:"none",color:"#0C447C",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Ajouter un poste</button>
      </div>
      {nouvelUo&&<UoForm onCancel={()=>setNouvelUo(false)} onSaved={()=>{setNouvelUo(false);recharger();}}/>}
      {filtreUo.length===0&&!nouvelUo&&<div style={{fontSize:13,color:"#94a3b8"}}>Aucun poste UO pour l'instant.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtreUo.map(u=>editUoId===u.id
          ? <UoForm key={u.id} initial={u} onCancel={()=>setEditUoId(null)} onSaved={()=>{setEditUoId(null);recharger();}} onDelete={()=>{api.annuaire.deleteUo(u.id).then(recharger);}}/>
          : <div key={u.id} style={{padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>
              <div onClick={()=>toggleExpandUo(u.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",cursor:"pointer"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{u.fonction}</div>
                  <div style={{fontSize:12,color:"#64748b"}}><TitulaireUo uo={u} agents={agents} cpsSchedule={cpsSchedule} cpsAleas={cpsAleas}/></div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{display:"flex",alignItems:"center",gap:4,fontSize:12,fontWeight:700,color:"#0C447C",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:20,padding:"5px 10px",whiteSpace:"nowrap"}}>
                    {expandedUo.includes(u.id)?"Masquer":"Voir les contacts"}
                    <span style={{transform:expandedUo.includes(u.id)?"rotate(180deg)":"none",transition:"transform .15s",display:"inline-block"}}>▾</span>
                  </span>
                  <button onClick={(e)=>{e.stopPropagation();setEditUoId(u.id);}} style={{border:"none",background:"none",cursor:"pointer",fontSize:16,color:"#64748b"}}>✎</button>
                </div>
              </div>
              {expandedUo.includes(u.id)&&<div style={{marginTop:10}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>
                  <ContactLigne label="Mobile pro" valeur={u.mobile_pro}/>
                  <ContactLigne label="Mobile perso" valeur={u.mobile_perso}/>
                  <ContactLigne label="Fixe" valeur={u.fixe}/>
                  {u.email&&<a href={`mailto:${u.email}`} style={{display:"flex",alignItems:"center",gap:8,textDecoration:"none",padding:"7px 10px",borderRadius:8,background:"#eff6ff",border:"1px solid #bfdbfe"}}>
                    <span style={{fontSize:15}}>✉️</span>
                    <div>
                      <div style={{fontSize:10,fontWeight:700,color:"#0C447C",textTransform:"uppercase",letterSpacing:"0.03em"}}>Email</div>
                      <div style={{fontSize:13,fontWeight:700,color:"#1e293b",wordBreak:"break-all"}}>{u.email}</div>
                    </div>
                  </a>}
                </div>
                {!u.mobile_pro&&!u.mobile_perso&&!u.fixe&&!u.email&&<span style={{fontSize:12,color:"#64748b",fontWeight:500}}>Aucun contact renseigné</span>}
                {u.note&&u.note.trim()&&<div style={{marginTop:10,padding:"8px 10px",borderRadius:8,background:"#fffbeb",borderLeft:"4px solid #f59e0b"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#92400e",textTransform:"uppercase",letterSpacing:"0.03em",marginBottom:2}}>📝 Note</div>
                  <div style={{fontSize:13,color:"#1e293b",fontWeight:500}}>{u.note}</div>
                </div>}
              </div>}
            </div>
        )}
      </div>
    </div>}
  </div>);
}

function IconTel({size}){
  const s=size||16;
  return(<svg width={s} height={s} viewBox="0 0 24 24" fill="#D22B2B" style={{flexShrink:0}}><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.57 1 1 0 0 1-.24 1.01l-2.21 2.21z"/></svg>);
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
  {code:"PIPA1J", label:"Pauseur PA1", subtitle:"Pauseur PA1 · 08h45–18h15",  type:"J"},
  {code:"PIPA2J", label:"Pauseur PA2", subtitle:"Pauseur PA2 · 10h15–19h45",  type:"J"},
  {code:"PIPA3J", label:"Pauseur PA3", subtitle:"Pauseur PA3 · 08h45–16h30",  type:"J"},
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

const ADMIN_MATRICULES_DEFAULT = ["6810186B"]; // BEFFARAL Olivierlivier — premier admin

// Hash simple pour PIN (en prod utiliser bcrypt via Supabase Edge Function)
function hashPin(CP, pin) {
  // Combine CP + pin pour un hash unique par agent
  const str = `${CP}-${pin}-f2ppmp2026`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).padStart(8, '0');
}

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

function LoginPage({ onLogin, authData, setAuthData }) {
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
      onLogin({ agent: {...agent, id: agent.cp, immatriculation: agent.cp}, isAdmin: agent.is_admin });
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
      onLogin({ agent: {...agent, id: agent.cp, immatriculation: agent.cp}, isAdmin: agent.is_admin });
    } catch(e) {
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

// Panneau de gestion des comptes (admin)
// DEAD_CODE_REMOVED_MARKER (ancien AdminAuthPanel, remplace par toggle admin reel dans AdminPanel.jsx)
export default function App(){
  // ── PERSISTANCE & ÉTATS ───────────────────────────────────────────────────
  const [view,setView]=usePersist("view","personal");
  const [agents,setAgents]=usePersist("agents",AGENTS_INIT);
  const [currentAgent,setCurrentAgent]=useState(null);
  const [weekOffset,setWeekOffset]=useState(0);
  const [profileOpen,setProfileOpen]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const [profileSearch,setProfileSearch]=useState("");
  const [unlockedAgents,setUnlockedAgents]=usePersist("unlockedAgents",{});
  const [schedule,setSchedule]=usePersist("schedule",{});
  const [cpsSchedule,setCpsSchedule]=usePersist("cpsSchedule",{});
  const [cpsAleas,setCpsAleas]=usePersist("cpsAleas",[]);
  const [previsionnelSignalements,setPrevisionnelSignalements]=usePersist("previsionnelSignalements",[]);
  const [journeeSpecialeNotes,setJourneeSpecialeNotes]=usePersist("journeeSpecialeNotes",[]);
  const [previsionnelSchedule,setPrevisionnelSchedule]=usePersist("previsionnelSchedule",{});
  const [agentCouleurs, setAgentCouleurs] = React.useState({});
  const [agentProfiles,setAgentProfiles]=usePersist("agentProfiles",{});
  const [importDPTarget,setImportDPTarget]=useState(null);
  const [addAgentOpen,setAddAgentOpen]=useState(false);
  const [notifications,setNotifications]=usePersist("notifications",[]);
  const [departDates,setDepartDates]=usePersist("departDates",{});
  // ── AUTH ──────────────────────────────────────────────────────────────────
  const [authData,setAuthData]=usePersist("authData",{});
  const [currentUser,setCurrentUser]=usePersist("currentUser",null);
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
      }));
      setAgents(mapped);
      // Synchroniser le statut admin de l'utilisateur connecte : une promotion/
      // retrait fait par un autre admin ne doit pas attendre une reconnexion
      // pour faire apparaitre/disparaitre l'onglet Admin du panneau lateral.
      const myId = currentUser?.agent?.immatriculation||currentUser?.agent?.cp||currentUser?.agent?.id;
      const me = mapped.find(a=>a.id===myId);
      if(me) setCurrentUser(prev=>(prev&&prev.isAdmin!==me.is_admin)?{...prev,isAdmin:me.is_admin}:prev);
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
  const rechargerEchangesCount=()=>{
    if(!currentUser?.agent?.id) return;
    api.echanges.getAll().then(rows=>{
      setEchangesOuvertesCount((rows||[]).filter(r=>r.statut==="ouverte").length);
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
        if(entries) setSchedule(prev=>({...prev,...entries}));
      }).catch(()=>{});
    };
    chargerPlanningVisualise();
    const interval=setInterval(chargerPlanningVisualise,45000);
    return ()=>clearInterval(interval);
  },[currentAgent]); // eslint-disable-line
  
  const [loginTarget,setLoginTarget]=useState(null);
  const isAdmin=currentUser?.isAdmin||false;


  const handleLogin=(user)=>{
    setCurrentUser(user);
    setCurrentAgent(user.agent);
    setView("personal");const agentId = user.agent.immatriculation || user.agent.cp || user.agent.id;
    api.planning.getSchedule(agentId).then(entries=>{
      if(entries&&Object.keys(entries).length>0){
        setSchedule(prev=>{
          // Railway gagne toujours sur le localStorage
          const next={...prev};
          Object.entries(entries).forEach(([k,v])=>{ next[k]=v; });
          return next;
        });
      }
    }).catch(()=>{});

    api.profil.get(agentId).then(p=>{
    if(p){
      if(p.habilitations) setAgentProfiles(prev=>({...prev,[agentId]:{...(prev[agentId]||{}),...p,habilitations:p.habilitations}}));
      if(p.agentColors && Object.keys(p.agentColors).length>0) setAgentCouleurs(p.agentColors);
    }
  }).catch(()=>{});
  };
  const handleLogout=()=>{
    setCurrentUser(null);
    setCurrentAgent(null);
    setProfileOpen(false);
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
      api.profil.get(agentId).then(profile=>{
        if(!profile) return;
        setAgentProfiles(prev=>({...prev,[agentId]:{
          ...(prev[agentId]||{}),
          pinHash:             profile.pin_hash,
          isAdmin:             profile.is_admin,
          roulement:           profile.roulement,
          isReserve:           profile.is_reserve,
          famillesHab:         profile.familles_hab,
          habilitations:       Array.isArray(profile.habilitations) ? Object.fromEntries((profile.habilitations||[]).map(h=>[h.code_poste,'HC'])) : (profile.habilitations||{}),
          agentColors:         profile.agent_colors||{},
          pauseFigee:          profile.pause_figee||{},
          compteurCorrections: profile.compteur_corrections||{},
          fetesTracking:       profile.fetes_tracking||{},
          pauseFigeeFiaMois:   profile.pause_figee_fia_mois||{},
          pauseFigeeFiaDone:   profile.pause_figee_fia_done||{},
          demandesConges:      profile.demandes_conges||[],
          notificationsAcquittees: profile.notifications_acquittees||[],
        }}));
        if(profile.agentColors&&Object.keys(profile.agentColors).length>0) setAgentCouleurs(profile.agentColors);
        // Restaurer acquittements
        if(profile.notifications_acquittees?.length){
          setNotifications(prev=>prev.map(n=>
            profile.notifications_acquittees.includes(n.id)?{...n,acquitte:true}:n
          ));
        }
      });
      // Recharger planning
      api.planning.getSchedule(agentId).then(entries=>{
        if(entries&&Object.keys(entries).length>0){
          setSchedule(prev=>({...prev,...entries}));
        }
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
    api.profil.get(agentId).then(profile=>{
      if(!profile) return;
      setAgentProfiles(prev=>({...prev,[agentId]:{
        ...(prev[agentId]||{}),
        pinHash:              profile.pin_hash,
        isAdmin:              profile.is_admin,
        roulement:            profile.roulement,
        isReserve:            profile.is_reserve,
        famillesHab:          profile.familles_hab,
        habilitations:        profile.habilitations||{},
        agentColors:          profile.agent_colors||{},
        pauseFigee:           profile.pause_figee||{},
        compteurCorrections:  profile.compteur_corrections||{},
        fetesTracking:        profile.fetes_tracking||{},
        pauseFigeeFiaMois:    profile.pause_figee_fia_mois||{},
        pauseFigeeFiaDone:    profile.pause_figee_fia_done||{},
        demandesConges:       profile.demandes_conges||[],
        notificationsAcquittees: profile.notifications_acquittees||[],
      }}));
    if(profile.agentColors&&Object.keys(profile.agentColors).length>0) setAgentCouleurs(profile.agentColors);
      // Restaurer les notifications acquittées sur cet appareil
      if(profile.notifications_acquittees?.length){
        setNotifications(prev=>prev.map(n=>
          profile.notifications_acquittees.includes(n.id)
            ? {...n, acquitte:true} : n
        ));
      }
    });
    // Charger le planning
    api.planning.getSchedule(agentId).then(entries=>{
      if(!entries||Object.keys(entries).length===0) return;
      setSchedule(prev=>({...prev,...entries}));
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
        setCpsSchedule(prev=>({...prev,...entries}));
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
    const profile = agentProfiles[agentId];
    if(profile && Object.keys(profile.agentColors||{}).length > 0) api.profil.save(agentId, profile);
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
  if(!currentUser) return <LoginPage onLogin={handleLogin} authData={authData} setAuthData={setAuthData}/>;

  // Charger les données Supabase si pas encore fait (au premier rendu après login)
  if(currentUser?.agent?.id && !loadedRef.current[currentUser.agent.id]){
    loadedRef.current[currentUser.agent.id] = true;
    const agentId = currentUser.agent.immatriculation || currentUser.agent.cp || currentUser.agent.id;
    api.planning.getSchedule(agentId).then(entries=>{
      if(entries && Object.keys(entries).length>0){
        setSchedule(prev=>({...prev,...entries}));
      }
    });
  }



  const handleFetePaye=(agentId,date,code,paye)=>{
    setSchedule(prev=>{const next={...prev};const key=`${agentId}-${date}`;if(next[key])next[key]={...next[key],fetePaye:paye};return next;});
  };


  const isOwnProfile=currentAgent?unlockedAgents[currentAgent.id]||false:false;
  const profils=agents.filter(a=>`${a.prenom} ${a.nom}`.toLowerCase().includes(profileSearch.toLowerCase()));

  const VIEWS=[
    {k:"personal",l:"📊 Mon planning"},
    {k:"global",  l:"📋 CPS Officiel"},
    {k:"previsionnel", l:"\u{1F4C5} Planning Prévisionnel"},
    {k:"echanges",l:"🔄 Échanges"},
    {k:"annuaire",l:(<><svg width="15" height="15" viewBox="0 0 24 24" fill="#D22B2B" style={{verticalAlign:"-2px",marginRight:2}}><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.57 1 1 0 0 1-.24 1.01l-2.21 2.21z"/></svg> Annuaire</>)},
    {k:"conges",l:"🗓️ Demande de congés"},
    {k:"profil",  l:"👤 Mon profil"},
    ...(isAdmin ? [{k:"admin", l:"\u{1F451} Admin"}] : [])
  ];

  return(<div style={{minHeight:"100vh",background:"#ffffff",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;}button:hover{opacity:.85;}`}</style>

    {/* ── HEADER ── */}
    <div style={{background:"#fff",borderBottom:"1.5px solid #e2e8f0",
      position:"sticky",top:0,zIndex:50,
      boxShadow:"0 1px 6px rgba(0,0,0,.06)"}}>

      {/* Ligne 1 : Logo + actions */}
      <div style={{maxWidth:1100,margin:"0 auto",
        display:"flex",alignItems:"center",gap:8,
        height:48,padding:"0 12px"}}>
        <button onClick={()=>setMenuOpen(true)} style={{border:"none",background:"none",cursor:"pointer",padding:6,marginRight:2,flexShrink:0,display:"flex",alignItems:"center"}}>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            <div style={{width:18,height:2,background:"#475569",borderRadius:1}}/>
            <div style={{width:18,height:2,background:"#475569",borderRadius:1}}/>
            <div style={{width:18,height:2,background:"#475569",borderRadius:1}}/>
          </div>
        </button>

        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <div style={{width:28,height:28,background:"linear-gradient(135deg,#0f4c81,#1e3a5f)",
            borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:14}}>🚄</span>
          </div>
          <div style={{lineHeight:1}}>
            <div style={{fontSize:12,fontWeight:800,color:"#0f4c81",letterSpacing:-.3}}>F2P.PMP</div>
            <div style={{fontSize:7,color:"#94a3b8",letterSpacing:.4,fontFamily:"monospace"}}>PRCI · PAR</div>
          </div>
        </div>

        <div style={{flex:1}}/>

        {/* Admin badges — masqués sur très petit écran */}
        {isAdmin&&<div style={{display:"flex",alignItems:"center",gap:4}}>
          <div style={{background:"#fff8e1",border:"1px solid #fde68a",borderRadius:6,
            padding:"2px 6px",fontSize:9,fontWeight:700,color:"#92400e"}}>👑</div>
          
        </div>}

        {/* Déco */}
        

        {/* Profil selector */}
        <div style={{position:"relative",flexShrink:0}}>
          <button onClick={()=>{if(isAdmin) setProfileOpen(p=>!p);}}
            style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"5px 8px",
              background:"#fff",cursor:isAdmin?"pointer":"default",display:"flex",alignItems:"center",
              gap:5,fontSize:11,color:"#1e293b",fontWeight:700,maxWidth:130}}>
            {currentAgent&&<Av initials={currentAgent.initials} size={18} famille={currentAgent.famille}/>}
            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
              maxWidth:70}}>{currentAgent?.prenom||"Profil"}</span>
            {isOwnProfile&&<span style={{fontSize:9,color:"#10b981",flexShrink:0}}>🔓</span>}
            <span style={{fontSize:9,opacity:.4,flexShrink:0}}>▼</span>
          </button>

          {profileOpen&&(
            <div style={{position:"absolute",top:"calc(100% + 5px)",right:0,
              width:260,background:"#fff",border:"1.5px solid #e2e8f0",
              borderRadius:13,boxShadow:"0 8px 30px rgba(0,0,0,.14)",
              zIndex:100,overflow:"hidden"}}>
              <div style={{padding:"8px 10px",borderBottom:"1px solid #f1f5f9"}}>
                <input  placeholder="Rechercher…"
                  value={profileSearch} onChange={e=>setProfileSearch(e.target.value)}
                  style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:7,
                    padding:"5px 8px",fontSize:11,outline:"none"}}/>
              </div>
              {["PRCI","PAR"].map(fKey=>{
                const rows=profils.filter(a=>a.famille===fKey);
                if(!rows.length) return null;
                const fam=FAMILLES[fKey];
                return(<div key={fKey}>
                  <div style={{padding:"4px 11px",fontSize:8,fontWeight:800,
                    color:"#94a3b8",letterSpacing:.8,
                    background:fam.color+"11",borderBottom:"1px solid #f1f5f9"}}>
                    {fam.label.toUpperCase()}
                  </div>
                  <div style={{maxHeight:160,overflowY:"auto"}}>
                    {rows.map(a=>(
                      <button key={a.id} onClick={()=>{
                        if(currentUser&&a.id===currentUser.agent?.id){
                          setCurrentAgent(a);setProfileOpen(false);setProfileSearch("");
                        } else if(isAdmin){
                          setCurrentAgent(a);setProfileOpen(false);setProfileSearch("");
                        } else {
                          setLoginTarget(a);setProfileOpen(false);setProfileSearch("");
                        }
                      }} style={{width:"100%",border:"none",
                        background:currentAgent?.id===a.id?"#eff6ff":"transparent",
                        padding:"6px 11px",cursor:"pointer",
                        display:"flex",alignItems:"center",gap:7,textAlign:"left"}}>
                        <Av initials={a.initials} size={22} famille={a.famille}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:600,color:"#1e293b",
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {a.prenom} {a.nom}
                          </div>
                          <div style={{fontSize:9,color:"#94a3b8"}}>{a.poste}</div>
                        </div>
                        {currentAgent?.id===a.id&&<span style={{color:fam.accent,fontSize:11}}>✓</span>}
                      </button>
                    ))}
                  </div>
                </div>);
              })}
            </div>
          )}
        </div>
      </div>

      {/* Ligne 2 : Onglets navigation — pleine largeur, scrollable */}
      <div style={{borderTop:"1px solid #f1f5f9",overflowX:"hidden"}}>
        <div style={{display:"flex",width:"100%",
          padding:"0 6px",gap:2}}>
          {VIEWS.filter(v=>["personal","previsionnel","global"].includes(v.k)).map(({k,l})=>{
            const actif = view===k;
            return(
              <button key={k} onClick={()=>setView(k)}
                style={{
                  border:"none",background:"transparent",
                  padding:"9px 6px",cursor:"pointer",flex:1,minWidth:0,
                  fontSize:"clamp(11px,1.6vw,15px)",fontWeight:700,
                  color:actif?"#0a3a63":"#334155",
                  borderBottom:actif?"2.5px solid #0a3a63":"2.5px solid transparent",
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
      <div style={{position:"relative",width:260,maxWidth:"80vw",height:"100%",background:"#fff",boxShadow:"4px 0 24px rgba(0,0,0,.15)",display:"flex",flexDirection:"column",padding:"16px 0",overflowY:"auto"}}>
        <div style={{padding:"0 16px 12px",borderBottom:"1px solid #f1f5f9",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:14,fontWeight:800,color:"#0f4c81"}}>F2P.PMP</div>
          <button onClick={()=>setMenuOpen(false)} style={{border:"none",background:"none",cursor:"pointer",fontSize:18,color:"#94a3b8",padding:4}}>×</button>
        </div>
        {VIEWS.map(({k,l})=>{
          const actif=view===k;
          const aDesEchanges=k==="echanges"&&echangesOuvertesCount>0;
          return(<button key={k} onClick={()=>{setView(k);setMenuOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,border:"none",background:actif?"#eff6ff":(aDesEchanges?"#fef3c7":"transparent"),padding:"12px 16px",cursor:"pointer",fontSize:14,fontWeight:actif?700:500,color:actif?"#0f4c81":"#1e293b",textAlign:"left",width:"100%"}}>
            {l}
            {aDesEchanges&&<span style={{marginLeft:"auto",background:"#dc2626",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:11,fontWeight:700}}>{echangesOuvertesCount}</span>}
          </button>);
        })}
        <div style={{flex:1}}/>
        <button onClick={()=>{setMenuOpen(false);handleLogout();}} style={{display:"flex",alignItems:"center",gap:10,border:"none",borderTop:"1px solid #f1f5f9",background:"transparent",padding:"14px 16px",cursor:"pointer",fontSize:14,fontWeight:600,color:"#ef4444",textAlign:"left",width:"100%"}}>
          Déconnexion
        </button>
      </div>
    </div>}
    {/* CONTENU */}
    <div style={{maxWidth:1100,margin:"0 auto",padding:"14px"}}>
      {view==="global"&&<GlobalView agents={agents} schedule={cpsSchedule} setSchedule={setCpsSchedule} cpsAleas={cpsAleas} setCpsAleas={setCpsAleas} currentAgent={currentAgent} weekOffset={weekOffset} setWeekOffset={setWeekOffset} previsionnelSignalements={[]} setPrevisionnelSignalements={()=>{}} journeeSpecialeNotes={journeeSpecialeNotes} setJourneeSpecialeNotes={setJourneeSpecialeNotes}
        onImport={ag=>{setCurrentAgent(ag);setImportDPTarget(ag);}}
        onAddAgent={()=>setAddAgentOpen(true)}
        onRemoveAgent={ag=>{if(window.confirm(`Supprimer ${ag.prenom} ${ag.nom} ?`))setAgents(p=>p.filter(a=>a.id!==ag.id));}}
        isAdmin={isAdmin}
        notifications={notifications} setNotifications={setNotifications}
        currentAgentId={currentAgent?.immatriculation||currentAgent?.cp||currentAgent?.id}/>}
      {view==="personal"&&<PersonalView
        agent={currentAgent||currentUser?.agent}
        schedule={schedule} setSchedule={setSchedule}
        weekOffset={weekOffset} setWeekOffset={setWeekOffset}
        onImportDP={setImportDPTarget}
        agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles}
        onFetePaye={handleFetePaye}
        onDepart={(id)=>setDepartDates(prev=>({...prev,[id]:TODAY}))}
        departDates={departDates}
        isAdmin={isAdmin}
        currentUser={currentUser}
        agentCouleurs={agentCouleurs}
        setAgentCouleurs={setAgentCouleurs}
        echangesCount={echangesOuvertesCount}
        onOpenEchanges={()=>setView("echanges")}/>}
      {view==="echanges"&&<EchangesView agents={agents} currentAgent={currentAgent||currentUser?.agent}/>}
  {view==="annuaire"&&<AnnuaireView currentAgent={currentAgent||currentUser?.agent} isAdmin={isAdmin} agents={agents} cpsSchedule={cpsSchedule} cpsAleas={cpsAleas}/>}
  {view==="conges"&&<DemandeCongesView currentAgent={currentAgent||currentUser?.agent}/>}
      {view==="profil"&&<ProfilPersoView currentAgent={currentAgent||currentUser?.agent} onPartageChange={(val)=>{setCurrentUser(prev=>prev?{...prev,agent:{...prev.agent,partage_previsionnel:val}}:prev);setCurrentAgent(prev=>prev?{...prev,partage_previsionnel:val}:prev);api.planning.getAllPublic().then(entries=>{if(entries)setPrevisionnelSchedule(entries);}).catch(()=>{});}}/>}
      {view==="previsionnel"&&<GlobalView agents={agents} schedule={previsionnelSchedule} setSchedule={setPrevisionnelSchedule} cpsAleas={[]} setCpsAleas={()=>{}} currentAgent={currentAgent} weekOffset={weekOffset} setWeekOffset={setWeekOffset} onImport={()=>{}} onAddAgent={()=>{}} onRemoveAgent={()=>{}} isAdmin={isAdmin} isPrevisionnel={true} previsionnelSignalements={previsionnelSignalements} setPrevisionnelSignalements={setPrevisionnelSignalements} journeeSpecialeNotes={journeeSpecialeNotes} setJourneeSpecialeNotes={setJourneeSpecialeNotes}/>}
      {view==="admin"&&<AdminPanel currentUser={currentUser} onAgentsChanged={rechargerAgents}/>}
    </div>

    {/* MODALS */}
      {importDPTarget&&<ImportDeroulement agent={importDPTarget} onClose={()=>setImportDPTarget(null)} onImport={jours=>handleImportSchedule(importDPTarget.id,jours)}/>}
    {addAgentOpen&&<AddAgentModal onClose={()=>setAddAgentOpen(false)} onAdd={ag=>{setAgents(p=>[...p,ag]);}}/>}
    {profileOpen&&<div onClick={()=>setProfileOpen(false)} style={{position:"fixed",inset:0,zIndex:49}}/>}
    

    {/* Modale login pour accéder au profil d'un autre agent */}
    {loginTarget&&(()=>{
      const fam=FAMILLES[loginTarget.famille];
      const [mat,setMat]=React.useState("");
      const [pin,setPin]=React.useState(["","","","",""]);
      const [err,setErr]=React.useState("");
      const lt0=React.useRef(),lt1=React.useRef(),lt2=React.useRef(),lt3=React.useRef();
      const pinRefs=[lt0,lt1,lt2,lt3];
      const pinStr=pin.join("");
      const tryLogin=()=>{
        const m=mat.trim().toUpperCase();
        if(m!==(loginTarget.immatriculation||"").toUpperCase()){setErr("CP incorrect");return;}
        const stored=authData[m];
        if(!stored?.pinHash){setErr("Aucun compte créé pour cet agent");return;}
        if(hashPin(m,pinStr)!==stored.pinHash){setErr("Code PIN incorrect");return;}
        const user={agent:loginTarget,isAdmin:stored.isAdmin||ADMIN_MATRICULES_DEFAULT.includes(m)};
        setCurrentUser(user);setCurrentAgent(loginTarget);
        setLoginTarget(null);setView("personal");
      };
      return <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.75)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(6px)"}}>
        <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:380,boxShadow:"0 24px 60px rgba(0,0,0,.35)",overflow:"hidden"}}>
          <div style={{background:`linear-gradient(135deg,${fam?.color||"#1e293b"},#334155)`,padding:"20px 22px",textAlign:"center"}}>
            <div style={{fontSize:28,marginBottom:6}}>🔐</div>
            <div style={{color:"#fff",fontSize:15,fontWeight:800}}>Connexion requise</div>
            <div style={{color:"rgba(255,255,255,.6)",fontSize:12,marginTop:3}}>{loginTarget.prenom} {loginTarget.nom}</div>
          </div>
          <div style={{padding:"20px 22px",display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:"#eff6ff",borderRadius:10,padding:"9px 12px",fontSize:12,color:"#1e40af"}}>
              Seul(e) <strong>{loginTarget.prenom} {loginTarget.nom}</strong> peut accéder à son planning.
            </div>
            <input value={mat} onChange={e=>{setMat(e.target.value.toUpperCase());setErr("");}}
              placeholder="CP SNCF"
              style={{width:"100%",border:"2px solid #e2e8f0",borderRadius:9,padding:"9px 12px",fontSize:13,fontFamily:"monospace",fontWeight:700,letterSpacing:2,textAlign:"center",outline:"none",boxSizing:"border-box"}}/>
            <div style={{display:"flex",justifyContent:"center",gap:8}}>
              {[0,1,2,3].map(i=>(
                <input key={i} ref={pinRefs[i]} type="password" inputMode="numeric" maxLength={1}
                  value={pin[i]}
                  onChange={e=>{
                    const digit=e.target.value.replace(/[^0-9]/g,'').slice(-1);
                    const next=[...pin];next[i]=digit;setPin(next);
                    if(digit&&i<3) setTimeout(()=>pinRefs[i+1].current?.focus(),10);
                    if(!digit&&i>0) setTimeout(()=>pinRefs[i-1].current?.focus(),10);
                    setErr("");
                  }}
                  onKeyDown={e=>{if(e.key==="Enter"&&pin.every(d=>d))tryLogin();if(e.key==="Backspace"&&!pin[i]&&i>0)pinRefs[i-1].current?.focus();}}
                  style={{width:46,height:54,textAlign:"center",fontSize:22,fontWeight:800,border:`2px solid ${err?"#ef4444":"#e2e8f0"}`,borderRadius:9,outline:"none"}}/>
              ))}
            </div>
            {err&&<div style={{background:"#fee2e2",borderRadius:9,padding:"8px 12px",fontSize:12,color:"#991b1b",fontWeight:600,textAlign:"center"}}>{err}</div>}
            <button onClick={tryLogin} disabled={!mat||pinStr.length<4}
              style={{background:mat&&pinStr.length===4?(fam?.color||"#1e293b"):"#e2e8f0",color:mat&&pinStr.length===4?"#fff":"#94a3b8",border:"none",borderRadius:10,padding:"12px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>
              Se connecter →
            </button>
            <button onClick={()=>setLoginTarget(null)} style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:12,textAlign:"center"}}>Annuler</button>
          </div>
        </div>
      </div>;
    })()}
  </div>);
}
