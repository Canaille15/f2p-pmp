import React from "react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";


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
  { jsCode:"PIPA1J",  label:"Pauseur PA1",     horaires:"08h45–18h15", famille:"PRCI", maxSlots:1, allowFormation:true,  pause:"13h15–15h00", principal:true  },
  { jsCode:"PIPA2J",  label:"Pauseur PA2",     horaires:"10h15–19h45", famille:"PRCI", maxSlots:1, allowFormation:true,  pause:"13h15–15h00", principal:true  },
  { jsCode:"PIPA3J",  label:"Pauseur PA3",     horaires:"08h45–16h30", famille:"PRCI", maxSlots:1, allowFormation:false, pause:null,           principal:true  },
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
  { jsCode:"PAASMJ",  label:"ASMTE PAR",        horaires:"08h00–16h45", famille:"PAR",  maxSlots:1, allowFormation:true,  pause:"12h00–13h00",  principal:true  },
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

// Couleurs compteurs agenda perso
const COMPTEUR_COLORS = {
  TRAVAIL:{ bg:"#fee2e2", text:"#991b1b",  label:"Jours travaillés" },
  RP:     { bg:"#d1fae5", text:"#065f46",  label:"Repos (RP)"       },
  FETE:   { bg:"#fce7f3", text:"#9d174d",  label:"Fêtes"            },
  RU:     { bg:"#fef9c3", text:"#713f12",  label:"Repos RU/RQ"      },
  TC:     { bg:"#dbeafe", text:"#1e40af",  label:"TC"               },
  RN:     { bg:"#ede9fe", text:"#5b21b6",  label:"RN"               },
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
const TODAY=new Date().toISOString().slice(0,10);

const DAYS_L=["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
const DAYS_S=["Di","Lu","Ma","Me","Je","Ve","Sa"];
const MOIS_L=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function getWeekDates(offset=0){
  const d=new Date();
  d.setDate(d.getDate()-d.getDay()+1+(offset*7)); // lundi
  return Array.from({length:7},(_,i)=>{
    const day=new Date(d);
    day.setDate(d.getDate()+i);
    return day.toISOString().slice(0,10);
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

// Compteurs planning perso par année civile
// agentProfiles optionnel : si fourni, enrichit les fêtes avec fetesTracking
function computeCompteurs(schedule, agentId, year, agentProfiles) {
  const counts = { TRAVAIL:0, RP:0, RU:0, TC:0, RN:0, FETE:[] };
  const fetesDejaVues = new Set(); // éviter doublons fête

  Object.entries(schedule).forEach(([k,v])=>{
    if (!k.startsWith(agentId+"-")) return;
    const date=k.slice(agentId.length+1);
    if (!date.startsWith(String(year))) return;
    const code=v?.equipe||v?.jsCode||"";
    const eq=EQ[code];
    if (!eq) return;
    if (eq.compteur==="TRAVAIL" && code!=="NU" && !CODES_FETES[code]) counts.TRAVAIL++;
    else if (eq.compteur==="RP") counts.RP++;
    else if (eq.compteur==="RU") counts.RU++;
    else if (eq.compteur==="TC") counts.TC++;
    else if (eq.compteur==="RN") counts.RN++;
    else if (eq.compteur==="FETE") {
      counts.FETE.push({date,code,label:CODES_FETES[code]||code,paye:v?.fetePaye||false,source:"planning"});
      fetesDejaVues.add(code);
    }
  });

  // Ajouter les fêtes prises/RC enregistrés dans fetesTracking (manuel ou RC)
  // Ces fêtes n'ont pas forcément de code F1/F2 saisi dans le planning
  if(agentProfiles){
    const tracking = agentProfiles[agentId]?.fetesTracking?.[year] || {};
    Object.entries(tracking).forEach(([code, data])=>{
      if(!CODES_FETES[code]) return;
      if(fetesDejaVues.has(code)) return; // déjà dans le planning
      if(data?.priseLe) {
        // La date de prise est-elle dans l'année ?
        const anneeTracking = parseInt((data.priseLe||"").slice(0,4));
        counts.FETE.push({
          date: data.priseLe,
          code,
          label: CODES_FETES[code],
          paye: data.estPayee||false,
          source: data.priseType==="manuel"?"manuel":"RC",
        });
        fetesDejaVues.add(code);
      } else if(data?.estPayee) {
        // Fête payée sans date de prise explicite
        counts.FETE.push({
          date:"—", code, label:CODES_FETES[code], paye:true, source:"payee"
        });
        fetesDejaVues.add(code);
      }
    });
  }

  return counts;
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
        <div style={{display:"flex",gap:12}}>
          {[0,1,2,3].map(i=>(<input key={i} ref={refs[i]} type="password" inputMode="numeric" maxLength={1}
            value={active[i]} onChange={e=>handleDigit(i,e.target.value,active,setActive)}
            onKeyDown={e=>{if(e.key==="Enter"&&active.every(d=>d))submit();if(e.key==="Backspace"&&!active[i]&&i>0)refs[i-1].current?.focus();}}
            style={{width:54,height:62,textAlign:"center",fontSize:28,fontWeight:800,border:`2px solid ${error?"#ef4444":"#e2e8f0"}`,borderRadius:12,outline:"none",transition:"border-color .15s"}}/>))}
        </div>
        {error&&<div style={{fontSize:12,color:"#ef4444",fontWeight:600,background:"#fee2e2",borderRadius:8,padding:"6px 14px"}}>{error}</div>}
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
  M:     { header:"#7f1d1d", border:"#fecaca", bg:"#fff5f5", badge:"#ef4444" },
  J:     { header:"#1e3a5f", border:"#bfdbfe", bg:"#eff6ff", badge:"#3b82f6" },
  AM:    { header:"#713f12", border:"#fde68a", bg:"#fffbeb", badge:"#f59e0b" },
  N:     { header:"#1e1b4b", border:"#c7d2fe", bg:"#eef2ff", badge:"#6366f1" },
  DIVERS:{ header:"#374151", border:"#e5e7eb", bg:"#f9fafb", badge:"#6b7280" },
};

// ─── VUE GLOBALE ─────────────────────────────────────────────────────────────
function buildSections(schedule, dateKey, filterF, agents){
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
        rows.push({poste:{...poste,label:`${jsCode} · ${lneLabel}`},jsCode,agents:ags,famille:"PRCI",isJournee:false,maxSlots:1});
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
        rows.push({poste:{...poste,label:`${jsCode} · ${poste.label}`},jsCode,agents:ags,famille:"PAR",isJournee:false,maxSlots:1});
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

  // Postes journée non principaux PRCI
  if(filterF!=="PAR"){
    POSTES_JOURNEE.filter(x=>x.famille==="PRCI"&&!x.principal).forEach(poste=>{
      const ags=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&(en.jsCode===poste.jsCode||en.poste===poste.label);});
      if(ags.length>0)diversRows.push({poste,jsCode:poste.jsCode,agents:ags,famille:"PRCI",isJournee:true,maxSlots:poste.maxSlots||99});
    });
  }
  // Postes journée non principaux PAR
  if(filterF!=="PRCI"){
    POSTES_JOURNEE.filter(x=>x.famille==="PAR"&&!x.principal).forEach(poste=>{
      const ags=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&(en.jsCode===poste.jsCode||en.poste===poste.label);});
      if(ags.length>0)diversRows.push({poste,jsCode:poste.jsCode,agents:ags,famille:"PAR",isJournee:true,maxSlots:poste.maxSlots||99});
    });
  }
  // Disponibles
  const dispos=agents.filter(a=>{const en=schedule[`${a.id}-${dateKey}`];return en&&en.equipe==="DISPO";});
  if(dispos.length>0){
    diversRows.push({poste:{jsCode:"DISPO",label:"Disponibles",subtitle:""},jsCode:"DISPO",agents:dispos,famille:null,isDispo:true,maxSlots:99});
  }

  if(diversRows.length>0){
    sections.push({id:"DIVERS",label:"🗂 Divers",equipe:"J",pc:pcD,rows:diversRows});
  }

  return sections;
}

function GlobalView({agents,schedule,weekOffset,setWeekOffset,onImport,currentAgent,onAddAgent,onRemoveAgent,isAdmin}){
  const [dayIdx,setDayIdx]=useState(()=>{const d=new Date().getDay();return d===0?6:d-1;});
  const [filterF,setFilterF]=useState("ALL");
  const [search,setSearch]=useState("");
  const weekDates=useMemo(()=>getWeekDates(weekOffset),[weekOffset]);
  const dateKey=weekDates[dayIdx];
  const sections=useMemo(()=>buildSections(schedule,dateKey,filterF,agents),[schedule,dateKey,filterF,agents]);

  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
      <input placeholder="🔍 Rechercher…" value={search} onChange={e=>setSearch(e.target.value)}
        style={{border:"1.5px solid #e2e8f0",borderRadius:10,padding:"8px 14px",fontSize:13,flex:1,minWidth:140,outline:"none"}}/>
      <div style={{display:"flex",gap:3,background:"#f1f5f9",borderRadius:10,padding:3}}>
        {[["ALL","Tous"],["PRCI","PRCI"],["PAR","PAR"]].map(([k,l])=>(
          <button key={k} onClick={()=>setFilterF(k)} style={{border:"none",borderRadius:8,padding:"6px 13px",cursor:"pointer",background:filterF===k?"#fff":"transparent",color:filterF===k?"#1e293b":"#94a3b8",fontSize:12,fontWeight:filterF===k?700:400}}>{l}</button>
        ))}
      </div>
      {isAdmin&&<button onClick={onAddAgent} style={{background:"#1e293b",color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>➕ Agent</button>}
    </div>

    {/* Nav semaine */}
    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
      <button onClick={()=>setWeekOffset(w=>w-1)} style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:14}}>‹</button>
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        {DAYS_S.map((d,i)=>{const isToday=weekDates[i]===TODAY;return(
          <button key={d} onClick={()=>setDayIdx(i)} style={{border:isToday?"2px solid #3b82f6":"none",borderRadius:10,padding:"5px 10px",cursor:"pointer",background:dayIdx===i?"#1e293b":isToday?"#eff6ff":"#f1f5f9",color:dayIdx===i?"#fff":isToday?"#1e40af":"#64748b",fontSize:11,fontWeight:dayIdx===i||isToday?700:400,lineHeight:1.4}}>
            {d}<br/><span style={{opacity:.7,fontSize:10}}>{weekDates[i]?.slice(8)}/{weekDates[i]?.slice(5,7)}</span>
          </button>);})}
      </div>
      <button onClick={()=>setWeekOffset(w=>w+1)} style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:14}}>›</button>
      {weekOffset!==0&&<button onClick={()=>setWeekOffset(0)} style={{border:"1.5px solid #6366f1",background:"#eef2ff",color:"#4f46e5",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>Auj.</button>}
    </div>

    {/* Sections */}
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
          return(<div key={`${row.jsCode}-${ri}`} style={{display:"flex",alignItems:"stretch",borderBottom:ri<section.rows.length-1?`1px solid ${pc.border}`:"none",background:ri%2===0?pc.bg:"#fff"}}>
            <div style={{width:210,flexShrink:0,padding:"9px 14px",borderRight:`1px solid ${pc.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                <span style={{fontFamily:"monospace",fontSize:10,fontWeight:800,color:fam?.color||"#7c3aed",background:(fam?.color||"#7c3aed")+"18",borderRadius:5,padding:"1px 6px"}}>{row.jsCode}</span>
                {fam&&<span style={{fontSize:9,background:fam.light,color:fam.color,borderRadius:10,padding:"1px 6px",fontWeight:700}}>{row.famille}</span>}
                {row.allowFormation&&<span style={{fontSize:9,background:"#bbf7d0",color:"#14532d",borderRadius:10,padding:"1px 6px",fontWeight:700}}>/F</span>}
                {(row.maxSlots||1)>1&&row.maxSlots<99&&<span style={{fontSize:9,background:"#dbeafe",color:"#1e40af",borderRadius:10,padding:"1px 5px",fontWeight:700}}>×{row.maxSlots}</span>}
              </div>
              <div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginTop:3}}>{pJ?`${pJ.jsCode} · ${pJ.label}`:row.poste.label}</div>
              {pJ?.subtitle&&<div style={{fontSize:9,color:"#94a3b8",fontStyle:"italic"}}>{pJ.subtitle}</div>}
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
                    const isForm=en?.equipe==="JF";const isMe=ag&&currentAgent?.id===ag.id;
                    if(ag)return(<div key={si} style={{display:"flex",alignItems:"center",gap:6,background:isForm?"#f0fdf4":isMe?"#fafdf0":"rgba(255,255,255,.8)",border:`1.5px solid ${isForm?"#22c55e":isMe?(fam?.accent||"#6366f1"):"rgba(0,0,0,.07)"}`,borderRadius:9,padding:"4px 9px"}}>
                      <Av initials={ag.initials} size={22} famille={ag.famille}/>
                      <div>
                        <div style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{ag.prenom} {ag.nom}{isMe&&<span style={{fontSize:8,color:fam?.accent||"#6366f1",marginLeft:3}}>●</span>}</div>
                        <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>{ag.grade}</div>
                      </div>
                      <button onClick={()=>onImport(ag)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,opacity:.4,padding:1}}>✏️</button>
                    </div>);
                    if(row.maxSlots<99)return(<div key={si} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,.5)",border:"1.5px dashed rgba(0,0,0,.08)",borderRadius:9,padding:"4px 9px",opacity:.4}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:"#e2e8f0"}}/>
                      <div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>Vacant</div>
                    </div>);
                    return null;
                  })
              }
            </div>
          </div>);
        })}
      </div>
    ))}

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
  </div>);
}

// ─── COMPTEURS AGENDA PERSO ───────────────────────────────────────────────────
function CompteursBadges({counts,year,onFetePaye,schedule,agentId}){
  const badges=[];
  if(counts.TRAVAIL>0)badges.push(<span key="T" style={{background:COMPTEUR_COLORS.TRAVAIL.bg,color:COMPTEUR_COLORS.TRAVAIL.text,borderRadius:10,padding:"3px 10px",fontSize:11,fontWeight:700}}>💼 {counts.TRAVAIL} jour{counts.TRAVAIL>1?"s":""} travaillés</span>);
  if(counts.RP>0)badges.push(<span key="RP" style={{background:COMPTEUR_COLORS.RP.bg,color:COMPTEUR_COLORS.RP.text,borderRadius:10,padding:"3px 10px",fontSize:11,fontWeight:700}}>🟢 {counts.RP} RP</span>);
  if(counts.RU>0)badges.push(<span key="RU" style={{background:COMPTEUR_COLORS.RU.bg,color:COMPTEUR_COLORS.RU.text,borderRadius:10,padding:"3px 10px",fontSize:11,fontWeight:700}}>🟡 {counts.RU} RU/RQ</span>);
  if(counts.TC>0)badges.push(<span key="TC" style={{background:COMPTEUR_COLORS.TC.bg,color:COMPTEUR_COLORS.TC.text,borderRadius:10,padding:"3px 10px",fontSize:11,fontWeight:700}}>🔵 {counts.TC} TC</span>);
  if(counts.RN>0)badges.push(<span key="RN" style={{background:COMPTEUR_COLORS.RN.bg,color:COMPTEUR_COLORS.RN.text,borderRadius:10,padding:"3px 10px",fontSize:11,fontWeight:700}}>🟣 {counts.RN} RN</span>);
  if(counts.FETE.length>0)badges.push(
    <details key="F" style={{display:"inline-block"}}>
      <summary style={{background:"#ec4899",color:"#fff",borderRadius:10,padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer",listStyle:"none"}}>
        🩷 {counts.FETE.length} fête{counts.FETE.length>1?"s":""}
      </summary>
      <div style={{background:"#fff",border:"1px solid #fbcfe8",borderRadius:10,padding:"8px 12px",marginTop:4,display:"flex",flexDirection:"column",gap:6,zIndex:10,position:"relative",minWidth:260}}>
        {counts.FETE.map((f,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,borderBottom:i<counts.FETE.length-1?"1px solid #fce7f3":"none",paddingBottom:i<counts.FETE.length-1?5:0}}>
            {/* Code fête */}
            <span style={{background:"#ec4899",color:"#fff",borderRadius:6,padding:"1px 6px",fontFamily:"monospace",fontSize:10,fontWeight:800,flexShrink:0}}>🩷 {f.code}</span>
            {/* Détail */}
            <div style={{flex:1}}>
              <div style={{fontSize:10,fontWeight:600,color:"#1e293b"}}>{f.label}</div>
              <div style={{fontSize:9,color:"#94a3b8",display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                {f.date&&f.date!=="—"&&<span>📅 {f.date}</span>}
                {f.source==="RC"&&<span style={{background:"#fce7f3",color:"#9d174d",borderRadius:4,padding:"0px 4px",fontSize:8,fontWeight:700}}>RC auto</span>}
                {f.source==="manuel"&&<span style={{background:"#ede9fe",color:"#7c3aed",borderRadius:4,padding:"0px 4px",fontSize:8,fontWeight:700}}>Manuel ✎</span>}
                {f.source==="payee"&&<span style={{background:"#dbeafe",color:"#1e40af",borderRadius:4,padding:"0px 4px",fontSize:8,fontWeight:700}}>Payée</span>}
                {f.paye&&<span style={{background:"#dbeafe",color:"#1e40af",borderRadius:4,padding:"0px 4px",fontSize:8,fontWeight:700}}>💶 Fiche paye</span>}
              </div>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",flexShrink:0}}>
              <input type="checkbox" checked={f.paye||false} onChange={e=>onFetePaye&&onFetePaye(agentId,f.date,f.code,e.target.checked)}/>
              <span style={{fontSize:9,color:"#9d174d"}}>Payée</span>
            </label>
          </div>
        ))}
      </div>
    </details>
  );
  if(!badges.length)return null;
  return(<div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>{badges}</div>);
}

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
  RP:"#16a34a", RU:"#ca8a04", RQ:"#ca8a04", TC:"#0284c7", TY:"#0284c7", RN:"#4338ca",
  NU:"#475569", CA:"#eab308", CP:"#eab308",
  MA:"#dc2626", ABS:"#dc2626", VT:"#eab308", VM:"#6b7280",
  FOR:"#b45309", DISPO:"#059669",
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
    RP:"RP", RU:"RU", RQ:"RQ", TC:"TC", TY:"TY", RN:"RN",
    NU:"NU", CA:"Congés", CP:"Congés", MA:"Maladie",
    ABS:"Absent", VT:"VT", VM:"Visite méd.", FOR:"Formation", DISPO:"Dispo",
    FETE:"Fêtes légales",
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
      codes:["RP","RU","RQ","TC","TY","RN"],
      note:"RP = Repos Périodique · RU/RQ = Repos Utilisation · TC/TY = Temps Compensé · RN = Repos Nuit",
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
    if(code==="FETE") return agentColors["F1"]||"#ec4899";
    return agentColors[code]||DEFAULT_COLORS[code]||"#f8fafc";
  };
  const setColor = (code, color) => {
    if(code==="FETE"){
      // Appliquer à tous les codes fête
      const feteKeys = Object.keys(CODES_FETES);
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
    const c = {travail:0,RP:0,RU:0,RQ:0,RN:0,TC:0,TY:0,CA:0,CP:0,MA:0,VT:0,ABS:0,FOR:0,NU:0};
    Object.entries(schedule).forEach(([key,val])=>{
      if(!key.startsWith(agent.id+"-")) return;
      const dk = key.slice(agent.id.length+1);
      if(dk < start || dk > end) return;
      const eq = val?.equipe;
      if(!eq) return;
      if(["M","AM","N","J","JF"].includes(eq)) c.travail++;
      if(c[eq]!==undefined) c[eq]++;
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
    {key:"RN",      label:"RN",              color:"#4338ca", icon:"🔵", subtitle:"Repos nuit"},
    {key:"TC",      label:"TC",              color:"#0284c7", icon:"🔵", subtitle:"Temps compensé"},
    {key:"TY",      label:"TY",              color:"#0284c7", icon:"🔵", subtitle:"Temps compensé"},
    {key:"VT",      label:"VT",              color:"#eab308", icon:"⏱️", subtitle:"Temps partiel"},
    {key:"FOR",     label:"Formation",       color:"#b45309", icon:"📚", subtitle:"Jours formation"},
    {key:"MA",      label:"Maladie",         color:"#dc2626", icon:"🤒", subtitle:"Jours maladie"},
  ];

  return(
    <div style={{margin:"20px 0 8px",padding:"0 2px"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <span style={{fontSize:16}}>📊</span>
        <span style={{fontSize:14,fontWeight:800,color:"#1e293b"}}>Compteurs</span>
        {/* Onglets années */}
        <div style={{display:"flex",gap:4,background:"#f1f5f9",borderRadius:8,padding:2}}>
          {availableYears.map(y=>(
            <button key={y} onClick={()=>{setSelectedYear(y);setEditMode(false);}}
              style={{border:"none",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:700,
                background:y===selectedYear?"#fff":"transparent",
                color:y===selectedYear?"#1e293b":"#94a3b8",
                boxShadow:y===selectedYear?"0 1px 3px rgba(0,0,0,.08)":"none"}}>
              {y}
            </button>
          ))}
        </div>
        <div style={{flex:1}}/>
        <div style={{fontSize:9,color:"#94a3b8"}}>⚠️ Selon planning saisi</div>
        <button onClick={()=>setEditMode(e=>!e)}
          style={{background:editMode?"#1e293b":"#f1f5f9",color:editMode?"#fff":"#475569",
            border:"none",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>
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
  
  const setFetesData = (updater) => {
    setAgentProfiles(prev=>{
      const curr = prev[agent.id]?.fetesTracking?.[year] || {};
      const next = typeof updater === 'function' ? updater(curr) : updater;
      return {...prev, [agent.id]:{
        ...(prev[agent.id]||{}),
        fetesTracking:{
          ...(prev[agent.id]?.fetesTracking||{}),
          [year]: next,
        }
      }};
    });
  };

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
    const estReserviste = profil.isReserve || false;
    const roulement = profil.roulement || null; // ex: "Roulement A", "Roulement B"…

    // Roulement prévisionnel : si pas de planning saisi, on regarde le roulement
    // Les roulements 3x8 SNCF tournent sur 5 semaines (M/AM/N/RP/RP…)
    // On utilise le roulement enregistré dans le profil comme indicateur d'équipe habituelle
    // Pour un dimanche : en roulement 3x8, le dimanche peut être M, AM, N ou RP selon la semaine
    // Sans table de roulement complète, on se base sur le planning saisi
    // Si planning non saisi ET fête dans le futur : on marque "indéterminé"
    const estFutur = dateFete > today;
    const planningRenseigneCeJour = !!equipeJour;

    // Travail prévisionnel (planning OU réserviste)
    // Pour F3 dimanche : réserviste = potentiellement utilisé → RC possible
    const estUtiliseOuReserviste = estTravaillePlanning || (estF3Dimanche && estReserviste);

    // ── RÈGLES PAR CAS ────────────────────────────────────────────────────────

    // Toutes fêtes dimanche (hors F2/F5 jamais dimanche, hors F3 cas particulier) :
    // → RC accordé si agent travaillait OU était en RP ce jour (règlement al.2 et al.3)
    // → Si planning non saisi + fête future → statut "indéterminé" (on anticipe PERDUE par défaut
    //   mais on laisse l'agent corriger)
    // → Si planning non saisi + fête passée → PERDUE (on ne sait pas → défavorable)

    // F3 dimanche : PERDUE sauf si service imposé (planning M/AM/N/J) OU réserviste
    // → réserviste = "en attente de confirmation" (peut être appelé)
    // → on affiche "PERDUE probable" si réserviste sans planning saisi
    // → on affiche "PERDUE" si ni travail ni réserviste

    let estPerdue = false;
    let estPerdueProbable = false; // fête dimanche future sans planning saisi
    let estRCAccorde = false;      // fête dimanche avec RC confirmé (RP ou travail)
    let estIndetermine = false;    // fête future dimanche, planning non saisi

    if(estDimanche){
      if(estF3Dimanche){
        // F3 = 1er mai dimanche
        if(estTravaillePlanning){
          estRCAccorde = true; // Service imposé confirmé → RC
        } else if(estReserviste && !planningRenseigneCeJour){
          estIndetermine = true; // Réserviste sans planning → peut être appelé → indéterminé
        } else if(estRPCeJour){
          estRCAccorde = true; // RP ce jour → RC accordé (al.3)
        } else if(!planningRenseigneCeJour && estFutur){
          estPerdueProbable = true; // Futur non renseigné → probable perdue
        } else {
          estPerdue = true; // Ni travail, ni RP, ni réserviste → PERDUE
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
      motifReglementaire = "Lorsque le 1er mai tombe un dimanche, seuls les agents dont l'utilisation est imposée par les nécessités du service bénéficient d'un RC. Aucun service imposé ni RP détecté. (Réf. GRH00143)";
    } else if(estPerdueProbable && estF3Dimanche){
      motifReglementaire = "1er mai dimanche — Agent réserviste : RC possible si appelé en service. En attente de confirmation du planning. (Réf. GRH00143)";
    } else if(estIndetermine && estF3Dimanche){
      motifReglementaire = "1er mai dimanche — Agent réserviste : RC possible si service imposé. Programmez votre planning pour confirmer. (Réf. GRH00143)";
    } else if(estPerdue && !estF3Dimanche && estFutur){
      motifReglementaire = "Fête tombant un dimanche — aucun planning saisi. PERDUE par anticipation si ni service imposé ni RP ce jour. Corrigeable si planning mis à jour. (Réf. GRH00143)";
    } else if(estPerdue && !estF3Dimanche && !estFutur){
      motifReglementaire = "Fête tombant un dimanche — aucun service imposé ni RP détecté dans le planning. (Réf. GRH00143)";
    } else if(estRCAccorde && estDimanche){
      motifReglementaire = estRPCeJour
        ? "Agent en repos périodique ce jour : RC accordé dans le trimestre civil suivant. (Réf. GRH00143)"
        : "Agent utilisé ce jour : RC accordé dans le trimestre civil suivant. (Réf. GRH00143)";
    } else if(estIndetermine){
      motifReglementaire = "Planning non saisi — statut indéterminé. (Réf. GRH00143)";
    } else if(code === "VN"){
      motifReglementaire = "Les agents chôment le samedi veille de Noël lorsque cette fête tombe un dimanche. Ceux utilisés ou en RP bénéficient d'un RC dans le trimestre suivant. (Réf. GRH00143)";
    }

    // Override manuel
    const override = fetesData[code] || {};
    const priseLeFinal = override.priseLe !== undefined ? override.priseLe : priseLe;
    const priseTypeFinal = override.priseType || priseType;
    const estPayee = override.estPayee || (!priseLeFinal && !estPerdue && !estIndetermine && today > limiteDate);
    const snoozeJusquau = override.snoozeJusquau || null;

    // Statut final
    let statut = "attente";
    if(estPerdue)         statut = "perdue";
    else if(estPerdueProbable) statut = "perdue_probable";
    else if(estIndetermine)    statut = "indetermine";
    else if(dateFete > today)  statut = "futur";
    else if(priseLeFinal)      statut = "prise";
    else if(estPayee)          statut = "payee";
    else if(today > limiteDate)statut = "payee_auto";
    else                       statut = "attente";

    // Notif active ? (pas pour perdues/indéterminées)
    const notifActive = !estPerdue && !estIndetermine && !priseLeFinal && !estPayee
      && today >= notifDate && today <= limiteDate
      && (!snoozeJusquau || today >= snoozeJusquau);

    return {
      code, label, dateFete, estDimanche, estF3Dimanche,
      estPerdue, estPerdueProbable, estIndetermine, estRCAccorde,
      estRPCeJour, estTravaillePlanning, estReserviste, motifReglementaire,
      limiteDate, notifDate, moisPaye, anneePaye,
      priseLe: priseLeFinal, priseType: priseTypeFinal,
      estPayee, statut, notifActive, override,
    };
  }).filter(Boolean);

  const [editingCode, setEditingCode] = useState(null);
  const [editVal, setEditVal] = useState("");

  const prendreEnCompte = (code) => {
    setFetesData(prev=>({...prev,[code]:{...(prev[code]||{}),snoozeJusquau:null,priseLe:today,priseType:"manuel"}}));
  };
  const snooze10j = (code) => {
    const d = new Date(); d.setDate(d.getDate()+10);
    setFetesData(prev=>({...prev,[code]:{...(prev[code]||{}),snoozeJusquau:d.toISOString().slice(0,10)}}));
  };
  const setManualDate = (code, val) => {
    setFetesData(prev=>({...prev,[code]:{...(prev[code]||{}),priseLe:val||null,priseType:val?"manuel":null}}));
    setEditingCode(null);
  };
  const setManualPayee = (code, val) => {
    setFetesData(prev=>({...prev,[code]:{...(prev[code]||{}),estPayee:val}}));
  };

  const notifCount = lignes.filter(l=>l.notifActive).length;
  const [ouvert, setOuvert] = useState(true);
  const [motifOuvert, setMotifOuvert] = useState(null); // code dont le motif est déroulé

  // Couleurs par statut
  const statutStyle = {
    futur:          {bg:"#f8fafc", border:"#e2e8f0", badge:"#94a3b8", badgeTc:"#fff",     icon:"🔜", label:"À venir"},
    prise:          {bg:"#f0fdf4", border:"#86efac", badge:"#16a34a", badgeTc:"#fff",     icon:"✅", label:"Prise"},
    attente:        {bg:"#fffbeb", border:"#fde68a", badge:"#f59e0b", badgeTc:"#fff",     icon:"⏳", label:"En attente"},
    payee:          {bg:"#eff6ff", border:"#bfdbfe", badge:"#3b82f6", badgeTc:"#fff",     icon:"💶", label:"Payée"},
    payee_auto:     {bg:"#eff6ff", border:"#bfdbfe", badge:"#3b82f6", badgeTc:"#fff",     icon:"💶", label:"Payée"},
    perdue:         {bg:"#fef2f2", border:"#fecaca", badge:"#dc2626", badgeTc:"#fff",     icon:"❌", label:"PERDUE"},
    perdue_probable:{bg:"#fff7ed", border:"#fed7aa", badge:"#ea580c", badgeTc:"#fff",     icon:"⚠️", label:"Prob. perdue"},
    indetermine:    {bg:"#faf5ff", border:"#e9d5ff", badge:"#7c3aed", badgeTc:"#fff",     icon:"❓", label:"Indéterminé"},
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

  return(
    <div style={{marginTop:14,border:"1.5px solid #e2e8f0",borderRadius:14,overflow:"hidden",background:"#fff"}}>

      {/* ── HEADER cliquable ── */}
      <div onClick={()=>setOuvert(o=>!o)}
        style={{background:"linear-gradient(135deg,#9d174d,#be185d)",padding:"11px 16px",
          display:"flex",alignItems:"center",gap:8,cursor:"pointer",userSelect:"none"}}>
        <span style={{fontSize:15}}>🩷</span>
        <span style={{fontSize:13,fontWeight:800,color:"#fff",flex:1}}>
          Suivi des fêtes légales {year}
        </span>
        {notifCount>0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:20,
          padding:"2px 9px",fontSize:11,fontWeight:700,flexShrink:0}}>
          {notifCount} rappel{notifCount>1?"s":""}
        </span>}
        <span style={{fontSize:9,color:"rgba(255,255,255,.4)",fontStyle:"italic",marginRight:4}}>GRH00143</span>
        <span style={{color:"#fff",fontSize:14,fontWeight:700,transition:"transform .2s",
          display:"inline-block",transform:ouvert?"rotate(0deg)":"rotate(-90deg)"}}>
          ▼
        </span>
      </div>

      {ouvert&&<>
        {/* ── Alertes actives ── */}
        {lignes.filter(l=>l.notifActive).map(l=>(
          <div key={"alert-"+l.code} style={{background:"#fff7ed",borderBottom:"1px solid #fed7aa",
            padding:"9px 14px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:15,flexShrink:0}}>⚠️</span>
            <div style={{flex:1,minWidth:160}}>
              <div style={{fontSize:11,fontWeight:800,color:"#c2410c"}}>
                🩷 {l.code} — {l.label}
              </div>
              <div style={{fontSize:10,color:"#92400e",marginTop:1}}>
                À prendre avant le <strong>
                  {new Date(l.limiteDate).toLocaleDateString("fr-FR",{
                    day:"2-digit",month:"long",
                    year:parseInt(l.limiteDate.slice(0,4))!==year?"numeric":undefined
                  })}
                </strong>
              </div>
            </div>
            {canEdit&&<div style={{display:"flex",gap:5,flexShrink:0}}>
              <button onClick={e=>{e.stopPropagation();prendreEnCompte(l.code);}}
                style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:7,
                  padding:"5px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>✓ Pris</button>
              <button onClick={e=>{e.stopPropagation();snooze10j(l.code);}}
                style={{background:"#f1f5f9",color:"#475569",border:"1px solid #e2e8f0",
                  borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:10}}>⏰ +10j</button>
            </div>}
          </div>
        ))}

        {/* ── Cartes portrait (1 par fête) ── */}
        <div style={{display:"flex",flexDirection:"column",gap:0}}>
          {lignes.map((l,i)=>{
            const s = statutStyle[l.statut]||statutStyle.futur;
            const isEditing = editingCode===l.code;
            const motifVisible = motifOuvert===l.code;
            const priseLe = labelPriseLe(l);
            return(
              <div key={l.code} style={{
                borderBottom:"1px solid #f1f5f9",
                background:s.bg,
              }}>
                {/* Ligne principale */}
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px"}}>

                  {/* Badge code fête */}
                  <span style={{
                    background:"#ec4899",color:"#fff",
                    borderRadius:7,padding:"3px 8px",
                    fontFamily:"monospace",fontSize:11,fontWeight:800,
                    flexShrink:0,minWidth:36,textAlign:"center",
                  }}>🩷{l.code}</span>

                  {/* Nom + date fête */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#1e293b",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {l.label}
                      {l.estDimanche&&<span style={{fontSize:9,color:"#dc2626",marginLeft:5,fontWeight:800}}>⚠️Dim.</span>}
                    </div>
                    <div style={{fontSize:9,color:"#64748b",marginTop:1,display:"flex",gap:6,flexWrap:"wrap"}}>
                      <span style={{fontFamily:"monospace"}}>
                        {new Date(l.dateFete).toLocaleDateString("fr-FR",{
                          weekday:"short",day:"2-digit",month:"2-digit"
                        })}
                      </span>
                      <span style={{color:"#94a3b8"}}>→</span>
                      <span style={{
                        fontWeight:600,
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
                    borderRadius:20,padding:"3px 9px",
                    fontSize:9,fontWeight:700,whiteSpace:"nowrap",flexShrink:0,
                  }}>
                    {s.icon} {s.label}
                    {(l.statut==="payee"||l.statut==="payee_auto")&&
                      ` ${MOIS_NOMS[l.moisPaye-1]}`}
                  </span>
                </div>

                {/* Ligne prise le + actions */}
                <div style={{display:"flex",alignItems:"center",gap:6,
                  padding:"0 12px 8px",flexWrap:"wrap"}}>

                  {/* Prise le */}
                  {isEditing?(
                    <div style={{display:"flex",gap:4,alignItems:"center",flex:1}}>
                      <input type="date" defaultValue={l.priseLe||""} autoFocus
                        onChange={e=>setEditVal(e.target.value)}
                        style={{border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 7px",
                          fontSize:10,outline:"none",flex:1}}/>
                      <button onClick={()=>setManualDate(l.code,editVal)}
                        style={{background:"#16a34a",color:"#fff",border:"none",
                          borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10}}>✓</button>
                      <button onClick={()=>setEditingCode(null)}
                        style={{background:"#f1f5f9",color:"#475569",border:"none",
                          borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10}}>✕</button>
                    </div>
                  ):(
                    <div style={{flex:1,fontSize:10}}>
                      {priseLe
                        ? <span style={{color:"#16a34a",fontWeight:700}}>{priseLe}</span>
                        : (l.statut==="payee"||l.statut==="payee_auto")
                          ? <span style={{color:"#3b82f6",fontWeight:600}}>
                              💶 Fiche {MOIS_NOMS[l.moisPaye-1]}{l.anneePaye!==year?` ${l.anneePaye}`:""}
                            </span>
                          : <span style={{color:"#94a3b8",fontStyle:"italic"}}>Non renseigné</span>
                      }
                    </div>
                  )}

                  {/* Boutons actions */}
                  {canEdit&&!isEditing&&<div style={{display:"flex",gap:4,flexShrink:0}}>
                    <button onClick={()=>{setEditingCode(l.code);setEditVal(l.priseLe||"");}}
                      title="Modifier la date de prise"
                      style={{background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:6,
                        padding:"3px 7px",cursor:"pointer",fontSize:10}}>📅</button>
                    <button onClick={()=>setManualPayee(l.code,!l.estPayee)}
                      title={l.estPayee?"Non payé":"Marquer payé"}
                      style={{background:l.estPayee?"#dbeafe":"#f1f5f9",
                        border:`1px solid ${l.estPayee?"#bfdbfe":"#e2e8f0"}`,
                        borderRadius:6,padding:"3px 7px",cursor:"pointer",fontSize:10}}>💶</button>
                    {/* Bouton motif réglementaire */}
                    {l.motifReglementaire&&<button
                      onClick={()=>setMotifOuvert(motifVisible?null:l.code)}
                      title="Motif réglementaire"
                      style={{background:motifVisible?"#fce7f3":"#f1f5f9",
                        border:`1px solid ${motifVisible?"#fbcfe8":"#e2e8f0"}`,
                        borderRadius:6,padding:"3px 7px",cursor:"pointer",fontSize:10,
                        color:motifVisible?"#9d174d":"#64748b"}}>📋</button>}
                  </div>}
                </div>

                {/* Motif réglementaire déroulant */}
                {motifVisible&&l.motifReglementaire&&<div style={{
                  margin:"0 12px 10px",
                  background:l.estPerdue?"#fef2f2":l.code==="VN"?"#faf5ff":"#f8fafc",
                  borderRadius:8,padding:"8px 10px",
                  fontSize:9,lineHeight:1.5,
                  color:l.estPerdue?"#991b1b":l.code==="VN"?"#6b21a8":"#475569",
                  border:`1px solid ${l.estPerdue?"#fecaca":l.code==="VN"?"#e9d5ff":"#e2e8f0"}`,
                }}>
                  {l.estPerdue&&<div style={{fontWeight:800,fontSize:10,marginBottom:3}}>❌ PERDUE</div>}
                  {l.motifReglementaire}
                </div>}
              </div>
            );
          })}
        </div>

        {/* ── Légende compacte ── */}
        <div style={{padding:"7px 12px",borderTop:"1px solid #f1f5f9",
          display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",background:"#fafafa"}}>
          {[
            {bg:"#16a34a",l:"Prise"},
            {bg:"#f59e0b",l:"Attente"},
            {bg:"#3b82f6",l:"Payée"},
            {bg:"#dc2626",l:"Perdue"},
            {bg:"#ea580c",l:"Prob."},
            {bg:"#7c3aed",l:"Indét."},
            {bg:"#94a3b8",l:"À venir"},
          ].map(({bg,l})=>(
            <span key={l} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:9}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:bg,flexShrink:0}}/>
              <span style={{color:"#64748b"}}>{l}</span>
            </span>
          ))}
          <span style={{flex:1}}/>
          <span style={{fontSize:8,color:"#cbd5e1",fontStyle:"italic"}}>GRH00143</span>
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
  // fiaMois : {dk: "2026-07"} — mois de prise en compte FIA par journée
  // fiaDone : {dk: true} — journée marquée "prise en compte FIA"
  const fiaMois = agentProfiles[agent?.id]?.pauseFigeeFiaMois || {};
  const fiaDone = agentProfiles[agent?.id]?.pauseFigeeFiaDone || {};

  const allDates = agentProfiles[agent?.id]?.pauseFigee || {};
  const allDatesSorted = Object.keys(allDates).sort();

  const totalMinutesAll = allDatesSorted.length * 90;
  const totalHAll = Math.floor(totalMinutesAll/60);
  const totalMAll = totalMinutesAll%60;

  // Mettre à jour une propriété du profil agent
  const setAgentProp = (prop, val) => {
    setAgentProfiles(prev=>({
      ...prev,
      [agent.id]:{...(prev[agent.id]||{}), [prop]: val}
    }));
  };

  const toggleDate = (dk) => {
    const current = {...allDates};
    if(current[dk]){ delete current[dk]; } 
    else { current[dk] = new Date().toISOString(); }
    setAgentProp("pauseFigee", current);
  };

  const setFiaMois = (dk, moisKey) => {
    setAgentProp("pauseFigeeFiaMois", {...fiaMois, [dk]: moisKey||null});
  };
  const toggleFiaDone = (dk) => {
    setAgentProp("pauseFigeeFiaDone", {...fiaDone, [dk]: !fiaDone[dk]});
  };

  // Tri des journées :
  // - En haut : journées SANS mois FIA (orange) — triées par date croissante (les plus urgentes en premier)
  // - En bas  : journées AVEC mois FIA (vert)   — triées par mois FIA décroissant (les plus récentes en premier)
  const {datesOrange, datesVertes} = useMemo(()=>{
    const orange = allDatesSorted.filter(dk => !fiaMois[dk]);
    const verte  = allDatesSorted.filter(dk =>  fiaMois[dk]);
    // Vertes triées par mois FIA décroissant (ex: 2026-07 avant 2026-03)
    verte.sort((a,b)=>(fiaMois[b]||"").localeCompare(fiaMois[a]||""));
    return {datesOrange: orange, datesVertes: verte};
  },[allDatesSorted.join(","), JSON.stringify(fiaMois)]);

  // Regrouper par mois de pause (date de la journée) — utilisé pour les en-têtes
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
    // Trier les groupes par mois FIA décroissant (on prend le moisFia de la première date du groupe)
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

  // Options mois pour sélecteur FIA
  // Depuis janvier 2026 jusqu'à aujourd'hui + 12 mois, sur 3 dernières années max
  const moisOptions = useMemo(()=>{
    const opts = [];
    const now = new Date();
    const limite3ans = new Date(now.getFullYear()-3, now.getMonth(), 1);
    // Début fixe : janvier 2026 ou il y a 3 ans, le plus récent des deux
    const debut = new Date(Math.max(
      new Date(2026, 0, 1).getTime(),
      limite3ans.getTime()
    ));
    // Fin : aujourd'hui + 12 mois
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

  // Compteurs FIA
  const nbFiaDone = allDatesSorted.filter(dk=>fiaDone[dk]).length;
  const nbFiaRestant = allDatesSorted.length - nbFiaDone;

  return(
    <div style={{marginTop:16,background:"#fff",borderRadius:14,border:"1.5px solid #e2e8f0",
      overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>

      {/* ── Header cliquable ── */}
      <div onClick={()=>setOuvert(o=>!o)}
        style={{background:"linear-gradient(135deg,#0369a1,#0284c7)",padding:"12px 16px",
          display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
        <span style={{fontSize:15}}>⏸️</span>
        <div style={{flex:1}}>
          <div style={{color:"#fff",fontSize:13,fontWeight:800}}>Mémo pauses figées</div>
          <div style={{color:"rgba(255,255,255,.7)",fontSize:10,marginTop:1}}>
            {allDatesSorted.length} jour{allDatesSorted.length>1?"s":""} · {totalHAll}h{String(totalMAll).padStart(2,'0')} TC
            {nbFiaDone>0&&<span style={{marginLeft:8,background:"rgba(255,255,255,.2)",
              borderRadius:10,padding:"0px 6px"}}>✅ {nbFiaDone} FIA</span>}
            {nbFiaRestant>0&&<span style={{marginLeft:4,background:"rgba(255,255,255,.15)",
              borderRadius:10,padding:"0px 6px"}}>⏳ {nbFiaRestant} en attente</span>}
          </div>
        </div>
        <button onClick={e=>{e.stopPropagation();setShowCal(v=>!v);}}
          style={{background:"rgba(255,255,255,.25)",border:"1px solid rgba(255,255,255,.4)",
            color:"#fff",borderRadius:8,padding:"6px 11px",cursor:"pointer",fontSize:11,fontWeight:700,
            flexShrink:0}}>
          {showCal?"✕":"📅 Ajouter"}
        </button>
        <span style={{color:"#fff",fontSize:14,fontWeight:700,
          display:"inline-block",transform:ouvert?"rotate(0deg)":"rotate(-90deg)",
          transition:"transform .2s",flexShrink:0}}>▼</span>
      </div>

      {ouvert&&<>
        {/* ── Calendrier ajout ── */}
        {showCal&&<div style={{padding:"12px 14px",borderBottom:"1px solid #e2e8f0",background:"#f0f9ff"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <button onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}}
              style={{border:"1px solid #bbf7d0",borderRadius:6,padding:"3px 9px",cursor:"pointer",background:"#fff",fontSize:13}}>‹</button>
            <div style={{flex:1,textAlign:"center",fontWeight:700,fontSize:13,color:"#0369a1"}}>
              {MOIS_L[calMonth]} {calYear}
            </div>
            <button onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}}
              style={{border:"1px solid #bbf7d0",borderRadius:6,padding:"3px 9px",cursor:"pointer",background:"#fff",fontSize:13}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:4}}>
            {JOURS.map(j=><div key={j} style={{textAlign:"center",fontSize:9,fontWeight:700,color:"#94a3b8"}}>{j}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
            {Array.from({length:firstDow}).map((_,i)=><div key={`e${i}`}/>)}
            {daysList.map(({dk,d,dow})=>{
              const isWE=dow===0||dow===6;
              const isSel=!!allDates[dk];
              return(
                <button key={dk} onClick={()=>toggleDate(dk)}
                  style={{borderRadius:7,
                    border:isSel?"2px solid #0284c7":"1.5px solid #e2e8f0",
                    background:isSel?"#0284c7":isWE?"#f1f5f9":"#fff",
                    color:isSel?"#fff":isWE?"#94a3b8":"#1e293b",
                    cursor:"pointer",padding:"6px 0",fontSize:11,
                    fontWeight:isSel?700:400,textAlign:"center"}}>
                  {d}
                </button>
              );
            })}
          </div>
          <div style={{fontSize:9,color:"#94a3b8",marginTop:7,textAlign:"center"}}>
            Appuyez sur un jour pour ajouter/retirer · 1h30 TC par jour
          </div>
        </div>}

        {/* ── Jours triés : orange (sans FIA) en haut, vert (avec FIA) en bas ── */}
        {(()=>{
          // Rendu d'un groupe de mois avec ses journées
          const renderGroupe = (moisKey, dates, isVert) => {
            const [annee, mois] = moisKey.split("-").map(Number);
            const nbMin = dates.length * 90;
            const h = Math.floor(nbMin/60);
            const m2 = nbMin%60;
            // Pour les groupes verts, le sous-titre indique le mois FIA de référence
            const fiaRef = isVert ? fiaMois[dates[0]] : null;
            const fiaLabel = fiaRef
              ? `FIA ${MOIS_L[parseInt(fiaRef.slice(5,7))-1]} ${fiaRef.slice(0,4)}`
              : null;
            return(
              <div key={`${isVert?"v":"o"}-${moisKey}`} style={{borderBottom:"1px solid #f1f5f9"}}>
                {/* En-tête mois */}
                <div style={{
                  padding:"6px 14px",
                  background:isVert?"#f0fdf4":"#fff7ed",
                  display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,
                }}>
                  <span style={{fontSize:11,fontWeight:800,color:isVert?"#15803d":"#c2410c"}}>
                    {MOIS_L[mois-1]} {annee}
                  </span>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {fiaLabel&&<span style={{fontSize:9,background:"#dcfce7",color:"#15803d",
                      borderRadius:6,padding:"1px 6px",fontWeight:700}}>✅ {fiaLabel}</span>}
                    <span style={{fontSize:10,color:isVert?"#16a34a":"#f97316",fontWeight:600}}>
                      {dates.length} j · {h}h{String(m2).padStart(2,'0')}
                    </span>
                  </div>
                </div>
                {/* Cartes journées */}
                <div style={{display:"flex",flexDirection:"column",gap:0}}>
                  {dates.map(dk=>{
                    const dow = new Date(dk).getDay();
                    const jourLabel = new Date(dk).toLocaleDateString("fr-FR",{weekday:"long",day:"2-digit",month:"long"});
                    const moisFia = fiaMois[dk]||"";
                    const done = !!fiaDone[dk];
                    return(
                      <div key={dk} style={{
                        display:"flex",alignItems:"center",gap:8,
                        padding:"7px 14px 7px 12px",
                        borderBottom:"1px solid #f8fafc",
                        borderLeft:`3px solid ${moisFia?"#16a34a":"#f97316"}`,
                        background:moisFia?"#f0fdf4":"#fff7ed",
                      }}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:600,
                            color:moisFia?"#15803d":"#c2410c",
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {done&&<span style={{marginRight:4}}>✅</span>}
                            {jourLabel}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:5,marginTop:4,flexWrap:"wrap"}}>
                            <span style={{fontSize:9,color:"#64748b",fontWeight:600,whiteSpace:"nowrap"}}>
                              Prise FIA :
                            </span>
                            <select value={moisFia}
                              onChange={e=>setFiaMois(dk,e.target.value)}
                              style={{fontSize:9,
                                border:`1px solid ${moisFia?"#86efac":"#fed7aa"}`,
                                borderRadius:6,padding:"2px 5px",
                                background:moisFia?"#f0fdf4":"#fff",
                                color:moisFia?"#15803d":"#94a3b8",
                                cursor:"pointer",outline:"none",maxWidth:130}}>
                              <option value="">— Sélectionner le mois —</option>
                              {moisOptions.map(o=>(
                                <option key={o.key} value={o.key}>{o.label}</option>
                              ))}
                            </select>
                            {moisFia&&<span style={{fontSize:9,background:"#dcfce7",
                              color:"#15803d",borderRadius:6,padding:"1px 6px",fontWeight:700}}>
                              Fiche {moisFia.slice(5,7)}/{moisFia.slice(0,4)}
                            </span>}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:4,flexShrink:0,alignItems:"center"}}>
                          <button onClick={()=>toggleFiaDone(dk)}
                            title={done?"Retirer FIA":"Marquer pris en compte FIA"}
                            style={{background:done?"#16a34a":"#f1f5f9",
                              border:`1px solid ${done?"#15803d":"#e2e8f0"}`,
                              color:done?"#fff":"#64748b",
                              borderRadius:7,padding:"4px 8px",cursor:"pointer",
                              fontSize:9,fontWeight:700,whiteSpace:"nowrap"}}>
                            {done?"✅ FIA":"FIA ?"}
                          </button>
                          <button onClick={()=>toggleDate(dk)}
                            style={{background:"#fef2f2",border:"1px solid #fecaca",
                              color:"#dc2626",borderRadius:7,padding:"4px 7px",
                              cursor:"pointer",fontSize:11,fontWeight:700}}>×</button>
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
            <div style={{padding:"16px",textAlign:"center",fontSize:11,color:"#94a3b8"}}>
              Aucune pause figée enregistrée
            </div>
          );

          return(
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {/* ── ORANGE : sans FIA ── */}
              {parMoisOrange.length>0&&<>
                <div style={{padding:"4px 14px",background:"#fff7ed",
                  borderBottom:"1px solid #fed7aa"}}>
                  <span style={{fontSize:9,fontWeight:800,color:"#c2410c",letterSpacing:.5}}>
                    ⏳ EN ATTENTE DE PRISE EN COMPTE FIA ({datesOrange.length})
                  </span>
                </div>
                {parMoisOrange.map(([moisKey,dates])=>renderGroupe(moisKey,dates,false))}
              </>}

              {/* ── VERT : avec FIA ── */}
              {parMoisVert.length>0&&<>
                <div style={{padding:"4px 14px",background:"#f0fdf4",
                  borderBottom:"1px solid #bbf7d0",
                  borderTop:parMoisOrange.length>0?"2px solid #e2e8f0":"none"}}>
                  <span style={{fontSize:9,fontWeight:800,color:"#15803d",letterSpacing:.5}}>
                    ✅ PRISES EN COMPTE SUR FIA ({datesVertes.length})
                  </span>
                </div>
                {parMoisVert.map(([moisKey,dates])=>renderGroupe(moisKey,dates,true))}
              </>}

              {/* Total */}
              <div style={{padding:"9px 14px",background:"#f0f9ff",
                display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                <span style={{fontSize:11,fontWeight:700,color:"#0369a1"}}>Total TC généré</span>
                <span style={{fontSize:12,fontWeight:800,color:"#0284c7"}}>
                  {totalHAll}h{String(totalMAll).padStart(2,'0')}
                  <span style={{fontSize:9,fontWeight:400,color:"#7dd3fc",marginLeft:5}}>
                    ({allDatesSorted.length} × 1h30)
                  </span>
                </span>
                {nbFiaDone>0&&<span style={{fontSize:10,color:"#16a34a",fontWeight:600,width:"100%"}}>
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

        {/* Bouton annuler si mode actif */}
        {codeActif&&<button onClick={()=>{setCodeActif(null);setShowFetesMenu(false);}}
          style={{background:"#fef2f2",color:"#dc2626",border:"2px solid #fecaca",
            borderRadius:10,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700,
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
      {codeActif&&<div style={{fontSize:10,color:"#6366f1",fontWeight:700,
        background:"#eef2ff",borderRadius:8,padding:"4px 10px"}}>
        ✏️ Mode saisie : {CODES_FETES[codeActif]
          ? `🩷 ${codeActif} — ${CODES_FETES[codeActif]}`
          : `"${CODES_BARRE.find(x=>x.c===codeActif)?.l||codeActif}"`
        } — tape sur un jour pour appliquer
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

  // 1. Code fête saisi directement dans le planning ce jour
  const entry = schedule[`${agentId}-${dk}`];
  if(entry?.equipe && CODES_FETES[entry.equipe]){
    result.push({code: entry.equipe, label: CODES_FETES[entry.equipe], type:"fete"});
    dejaPush.add(entry.equipe);
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

  // 3. RP automatique détecté dans le trimestre suivant pour une fête
  Object.entries(datesFetes).forEach(([code, dateFete])=>{
    if(!dateFete) return;
    if(dejaPush.has(code)) return; // déjà traité ci-dessus
    if(dk === dateFete) return;

    const {limiteDate} = getFeteRegles(dateFete);
    const moisFete = parseInt(dateFete.slice(5,7));
    const t = getTrimestre(moisFete);
    let tSuiv = t+1; let aSuiv = year;
    if(tSuiv>4){tSuiv=1;aSuiv=year+1;}
    const debutT={1:`${aSuiv}-01-01`,2:`${aSuiv}-04-01`,3:`${aSuiv}-07-01`,4:`${aSuiv}-10-01`};
    const debutTrimSuiv = debutT[tSuiv];

    if(dk >= debutTrimSuiv && dk <= limiteDate){
      const e = schedule[`${agentId}-${dk}`];
      if(e?.equipe === "RP"){
        // Pas de date manuelle déjà enregistrée pour cette fête
        const tracking = trackingAnnee[code];
        if(tracking?.priseLe && tracking.priseLe !== dk) return; // une autre date manuelle existe

        // Premier RP dans la fenêtre pour cette fête ?
        let premierRP = true;
        Object.entries(schedule).forEach(([k,v])=>{
          if(!k.startsWith(agentId+"-")) return;
          const d2 = k.slice(agentId.length+1);
          if(d2 >= debutTrimSuiv && d2 < dk && v?.equipe === "RP") premierRP = false;
        });
        if(premierRP){
          result.push({code, label: CODES_FETES[code], type:"RC"});
          dejaPush.add(code);
        }
      }
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

function PersonalView({agent,schedule,setSchedule,weekOffset,setWeekOffset,onImportDP,agentProfiles,setAgentProfiles,onFetePaye,isAdmin,currentUser}){
  const [showHab,setShowHab]=useState(false);
  const [calView,setCalView]=useState("mois");
  const [monthOff,setMonthOff]=useState(0);
  const [showColorPicker,setShowColorPicker]=useState(false);
  // agentColors : stocké dans agentProfiles pour sync Supabase + réactivité immédiate
  // Source unique de vérité : agentProfiles[agent.id].agentColors
  const agentColors = agentProfiles[agent?.id]?.agentColors || {};

  // Setter : met à jour agentProfiles directement (→ Supabase via useEffect save)
  const setAgentColors = useCallback((updater)=>{
    setAgentProfiles(p=>{
      const prev = p[agent.id]?.agentColors || {};
      const next = typeof updater==="function" ? updater(prev) : updater;
      return {...p, [agent.id]:{...(p[agent.id]||{}), agentColors:next}};
    });
  },[agent?.id, setAgentProfiles]);

  // Couleur effective pour un code
  const getColor=(code)=>{
    // Lire directement agentProfiles pour la réactivité maximale
    const colors = agentProfiles[agent?.id]?.agentColors || {};
    // Couleur perso agent en priorité
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
          const eq=EQ[code]||EQ_COLORS[code]||{prive:false,heures:""};
          next[key]={...(next[key]||{}),equipe:code,jsCode:code,horaires:eq.heures||"",prive:eq.prive||false};
        } else { delete next[key]; }
      }
      // Sync Supabase directe
      setTimeout(()=>{
        if(next[key]) sbSaveEntry(agent.id, dk, next[key]);
        else sbDeleteEntry(agent.id, dk);
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
  const profile=agentProfiles[agent.id]||{};
  const setProfile=u=>setAgentProfiles(p=>({...p,[agent.id]:{...profile,...u}}));
  const hasPin=!!profile.pinHash;
  const ROULEMENTS=["Roulement 3×8","Journée"];
  const counts=useMemo(()=>computeCompteurs(schedule,agent.id,compteurYear,agentProfiles),[schedule,agent.id,compteurYear,agentProfiles]);
  const nbHab=Object.keys(profile.habilitations||{}).length;
  const nbValid=Object.values(profile.habilitations||{}).filter(v=>v==="VALIDE").length;
  const postesDetectes=[...new Set(Object.entries(schedule).filter(([k])=>k.startsWith(agent.id+"-")).map(([,v])=>v?.poste||v?.jsCode).filter(Boolean))];

  return(<div style={{display:"flex",flexDirection:"column",gap:18}}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

    {/* ── BANDEAU PROFIL ÉTENDU ── */}
    <div style={{background:`linear-gradient(135deg,${fam?.color||"#1e293b"},#334155)`,borderRadius:16,overflow:"hidden",color:"#fff"}}>

      {/* Ligne 1 : identité + boutons principaux */}
      <div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <Av initials={agent.initials} size={48} famille={agent.famille}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:16,fontWeight:800,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{agent.prenom} {agent.nom}</div>
          <div style={{fontSize:10,opacity:.65,marginTop:1}}>{agent.grade} · {agent.poste} · {fam?.label}</div>
        </div>
        {/* Actions principales */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <button onClick={()=>onImportDP(agent)} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.25)",color:"#fff",borderRadius:9,padding:"6px 11px",cursor:"pointer",fontSize:11,fontWeight:700}}>📋 Déroulé</button>
          <button onClick={()=>setShowDemandeConges(true)} style={{background:"rgba(234,88,12,.35)",border:"1px solid rgba(253,186,116,.4)",color:"#fff",borderRadius:9,padding:"6px 11px",cursor:"pointer",fontSize:11,fontWeight:700}}>📝 Congés</button>
          <button onClick={()=>setShowColorPicker(true)} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.25)",color:"#fff",borderRadius:9,padding:"6px 11px",cursor:"pointer",fontSize:11,fontWeight:700}}>🎨</button>
        </div>
      </div>

      {/* Ligne 2 : Roulement + Réserviste côte à côte dans le bandeau */}
      <div style={{borderTop:"1px solid rgba(255,255,255,.12)",padding:"12px 20px",
        display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>

        {/* ── Roulement ── */}
        <div>
          <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.5)",letterSpacing:.8,marginBottom:7}}>🔄 ROULEMENT</div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {ROULEMENTS.map(r=>{
              const sel=profile.roulement===r;
              return(
                <button key={r} onClick={()=>setProfile({roulement:sel?null:r})}
                  style={{display:"flex",alignItems:"center",gap:6,
                    border:`1.5px solid ${sel?"rgba(255,255,255,.8)":"rgba(255,255,255,.2)"}`,
                    background:sel?"rgba(255,255,255,.2)":"rgba(255,255,255,.07)",
                    color:"#fff",borderRadius:8,padding:"5px 10px",
                    cursor:"pointer",fontSize:11,fontWeight:sel?700:400,textAlign:"left"}}>
                  <span style={{width:10,height:10,borderRadius:"50%",flexShrink:0,
                    border:`2px solid ${sel?"#fff":"rgba(255,255,255,.4)"}`,
                    background:sel?"#fff":"transparent"}}/>
                  {r}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Réserviste ── */}
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
            <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.5)",letterSpacing:.8}}>🛡️ RÉSERVISTE</div>
            <Toggle value={profile.isReserve||false} onChange={v=>setProfile({isReserve:v})} color="#10b981"/>
          </div>
          {profile.isReserve?(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {/* Familles habilitées */}
              {(()=>{
                const detected=detectFamillesReserviste(agent.id,schedule);
                const current=profile.famillesHab||null;
                const suggestion=detected&&!current?detected:null;
                const OPTS=[
                  {k:"PRCI",l:"PRCI",     bg:"rgba(59,130,246,.3)",bd:"rgba(147,197,253,.5)"},
                  {k:"PAR", l:"PAR",      bg:"rgba(16,185,129,.3)",bd:"rgba(110,231,183,.5)"},
                  {k:"BOTH",l:"PRCI+PAR", bg:"rgba(139,92,246,.3)",bd:"rgba(196,181,253,.5)"},
                ];
                return(
                  <div>
                    {suggestion&&<div style={{fontSize:8,color:"#fde68a",marginBottom:4,fontWeight:600}}>
                      💡 {suggestion==="BOTH"?"PRCI+PAR":suggestion} détecté automatiquement
                    </div>}
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {OPTS.map(o=>{const sel=current===o.k;const isSug=suggestion===o.k;
                        return <button key={o.k} onClick={()=>setProfile({famillesHab:sel?null:o.k})}
                          style={{border:`1.5px solid ${sel?"rgba(255,255,255,.8)":isSug?o.bd:"rgba(255,255,255,.2)"}`,
                            background:sel?o.bg:"rgba(255,255,255,.07)",
                            color:"#fff",borderRadius:7,padding:"4px 9px",
                            cursor:"pointer",fontSize:10,fontWeight:sel?800:400}}>
                          {sel&&"✓ "}{o.l}
                        </button>;
                      })}
                    </div>
                    {current&&<div style={{fontSize:8,color:"rgba(255,255,255,.6)",marginTop:4}}>
                      ✓ {current==="BOTH"?"PRCI et PAR":current==="PRCI"?"PRCI uniquement":"PAR uniquement"}
                    </div>}
                  </div>
                );
              })()}
              {/* Habilitations résumé + bouton */}
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                {nbHab>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                  {Object.entries(profile.habilitations||{}).slice(0,3).map(([code,niv])=>{
                    const n=NIV_HAB.find(x=>x.code===niv);
                    const h=[...HAB_PRCI,...HAB_PAR].find(x=>x.code===code);
                    return h?<span key={code} style={{fontSize:8,background:n?.color,color:n?.textColor,borderRadius:6,padding:"1px 5px",fontWeight:700}}>{h.label}</span>:null;
                  })}
                  {nbHab>3&&<span style={{fontSize:8,color:"rgba(255,255,255,.5)"}}>+{nbHab-3}</span>}
                </div>}
                <button onClick={()=>setShowHab(true)}
                  style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.25)",
                    color:"#fff",borderRadius:7,padding:"4px 9px",cursor:"pointer",fontSize:10,fontWeight:700}}>
                  ⚙️ Hab. ({nbHab})
                </button>
              </div>
              <div style={{fontSize:8,color:"rgba(255,255,255,.5)"}}>
                {nbHab===0?"Aucune habilitation":`${nbValid} validée${nbValid>1?"s":""} · ${nbHab-nbValid} en cours`}
              </div>
            </div>
          ):(
            <div style={{fontSize:10,color:"rgba(255,255,255,.4)",fontStyle:"italic"}}>
              Activez pour gérer vos habilitations.
            </div>
          )}
        </div>
      </div>

      {/* Ligne 3 : compteurs si profil déverrouillé */}
      {isOwnProfile&&<div style={{borderTop:"1px solid rgba(255,255,255,.12)",padding:"10px 20px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7,flexWrap:"wrap",gap:6}}>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.5)",letterSpacing:.8}}>📊 COMPTEURS {compteurYear}</div>
            <div style={{fontSize:8,color:"rgba(255,255,255,.3)",fontStyle:"italic"}}>CONGÉS DU PERSONNEL DE LA SNCF — GRH00143</div>
          </div>
          <div style={{display:"flex",gap:3}}>
            {[currentYear-1,currentYear,currentYear+1].map(y=>(
              <button key={y} onClick={()=>setCompteurYear(y)}
                style={{border:`1px solid ${compteurYear===y?"rgba(255,255,255,.8)":"rgba(255,255,255,.2)"}`,
                  background:compteurYear===y?"rgba(255,255,255,.2)":"transparent",
                  color:"#fff",borderRadius:6,padding:"2px 7px",cursor:"pointer",
                  fontSize:10,fontWeight:compteurYear===y?700:400}}>{y}</button>
            ))}
          </div>
        </div>
        <CompteursBadges counts={counts} year={compteurYear} onFetePaye={onFetePaye} schedule={schedule} agentId={agent.id}/>
      </div>}
    </div>

    {/* Bandeau congé en cours */}
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
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <div style={{display:"flex",background:"#f1f5f9",borderRadius:10,padding:3,gap:2}}>
        {[["mois","📆 Mois"],["semaine","📅 Semaine"]].map(([k,l])=>(
          <button key={k} onClick={()=>setCalView(k)} style={{border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",background:calView===k?"#fff":"transparent",color:calView===k?"#1e293b":"#94a3b8",fontSize:12,fontWeight:calView===k?700:400,boxShadow:calView===k?"0 1px 4px rgba(0,0,0,.08)":"none"}}>
            {l}
          </button>
        ))}
      </div>
      {/* Nav selon la vue */}
      {calView==="semaine"?<>
        <button onClick={()=>setWeekOffset(w=>w-1)} style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:13}}>‹</button>
        <span style={{fontSize:12,fontWeight:600,color:"#475569",flex:1,textAlign:"center"}}>{weekDates[0]?.slice(8)}/{weekDates[0]?.slice(5,7)} – {weekDates[6]?.slice(8)}/{weekDates[6]?.slice(5,7)}/{weekDates[6]?.slice(0,4)}</span>
        <button onClick={()=>setWeekOffset(w=>w+1)} style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:13}}>›</button>
        {weekOffset!==0&&<button onClick={()=>setWeekOffset(0)} style={{border:"1.5px solid #6366f1",background:"#eef2ff",color:"#4f46e5",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>Auj.</button>}
      </>:<>
        <button onClick={()=>setMonthOff(m=>m-1)} style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:13}}>‹</button>
        <span style={{fontSize:13,fontWeight:700,color:"#1e293b",flex:1,textAlign:"center"}}>{MOIS_L[curMonth]} {curYear}</span>
        <button onClick={()=>setMonthOff(m=>m+1)} style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:13}}>›</button>
        {monthOff!==0&&<button onClick={()=>setMonthOff(0)} style={{border:"1.5px solid #6366f1",background:"#eef2ff",color:"#4f46e5",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>Auj.</button>}
      </>}
    </div>

    {/* ── VUE SEMAINE ── */}
    {calView==="semaine"&&<>
      {/* ── BARRE DE SAISIE RAPIDE (roulement/journée uniquement) ── */}
      {!profile.isReserve && <BarreSaisieRapide
        barreConfig={barreConfig} setBarreConfig={setBarreConfig}
        codeActif={codeActif} setCodeActif={setCodeActif}
        getColor={getColor} getTc={getTc}
        showConfig={showBarreConfig} setShowConfig={setShowBarreConfig}
        CODES_BARRE={CODES_BARRE}
      />}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
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
            onClick={()=>{if(codeActif) setDay(dk, code===codeActif?null:codeActif);}}
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
            cursor:codeActif?"pointer":"default",
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
              <div style={{fontSize:11,fontWeight:isToday?800:600,
                color:isToday?"#6366f1":isWE?"#94a3b8":"#475569"}}>
                {DAYS_L[i].slice(0,3)}
              </div>
              <div style={{fontSize:9,color:"#94a3b8",marginTop:1}}>
                {dk?.slice(8)}/{dk?.slice(5,7)}
              </div>
            </div>

            {/* Contenu */}
            <div style={{padding:"6px 7px",flex:1,display:"flex",flexDirection:"column",gap:4}}>
              {/* Fin de nuit J+1 */}
              {isFinNuit2&&<div style={{
                background:"#eff6ff",borderRadius:6,padding:"3px 6px",
                fontSize:9,fontWeight:700,color:"#1e3a8a",lineHeight:1.3,
                border:"1px solid #bfdbfe",
              }}>
                🌙 Nuit → matin<br/>
                <span style={{fontWeight:400,color:"#3b82f6",fontSize:8}}>Libre ensuite</span>
              </div>}

              {/* Badge équipe principale */}
              {code&&showData&&<div style={{
                background: getColor(code),
                color: getTc(code),
                borderRadius:8,
                padding:"4px 8px",
                fontSize:10,
                fontWeight:700,
                textAlign:"center",
              }}>
                {CODES_FETES[code] ? `🩷 ${code}` : (eq?.label||code)}
              </div>}

              {/* Badge prise de nuit */}
              {hasNuit2&&showData&&<div style={{
                background:"#1e3a8a",
                color:"#fff",
                borderRadius:8,
                padding:"3px 8px",
                fontSize:9,
                fontWeight:700,
                textAlign:"center",
              }}>
                🌙 Nuit
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

            {/* Sélecteur équipe */}
            <div style={{padding:"4px 6px",borderTop:"1px solid #f1f5f9",background:"#fafafa"}}>
              <select value={code||""} onChange={e=>{
                  if(codeActif) setCodeActif(null); // désactive la saisie rapide si on utilise le select
                  setDay(dk,e.target.value||null);
                }}
                style={{width:"100%",fontSize:9,border:"1px solid #e2e8f0",borderRadius:6,
                  padding:"3px 4px",background:"#fff",color:"#475569",cursor:"pointer",outline:"none"}}>
                <option value="">— choisir —</option>
                {[{c:"M",l:"Matinée"},{c:"AM",l:"Soirée"},{c:"N",l:"Nuit"},{c:"J",l:"Journée"},
                  {c:"RP",l:"RP"},{c:"RU",l:"RU"},{c:"RQ",l:"RQ"},{c:"NU",l:"NU"},
                  {c:"CA",l:"Congés"},{c:"MA",l:"Maladie"},{c:"VT",l:"VT"},
                  {c:"TY",l:"TY"},{c:"FOR",l:"Formation"},{c:"DISPO",l:"Dispo"}
                ].map(o=><option key={o.c} value={o.c}>{o.l}</option>)}
              </select>
            </div>

            {/* Bouton prise de nuit */}
            {code&&<div style={{
              padding:"3px 6px",
              background:hasNuit2?"#1e3a8a":"#f8fafc",
              borderTop:"1px solid #f1f5f9",
            }}>
              <select value={en?.equipe2||""} onChange={e=>setDay(dk,e.target.value||null,true)}
                style={{width:"100%",fontSize:9,border:"none",background:"transparent",
                  color:hasNuit2?"#bfdbfe":"#94a3b8",cursor:"pointer",outline:"none",
                  fontWeight:hasNuit2?700:400}}>
                <option value="">🌙 + prise de nuit</option>
                <option value="N">🌙 Nuit ce soir ✓</option>
              </select>
            </div>}
          </div>;
        })}
      </div>
    </>}

    {/* ── VUE MOIS ── */}
    {calView==="mois"&&<>
      {/* ── BARRE DE SAISIE RAPIDE (roulement/journée uniquement) ── */}
      {!profile.isReserve && <BarreSaisieRapide
        barreConfig={barreConfig} setBarreConfig={setBarreConfig}
        codeActif={codeActif} setCodeActif={setCodeActif}
        getColor={getColor} getTc={getTc}
        showConfig={showBarreConfig} setShowConfig={setShowBarreConfig}
        CODES_BARRE={CODES_BARRE}
      />}

      {/* Grille mensuelle */}
      <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,overflow:"hidden"}}>
        {/* En-têtes jours */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#f8fafc",borderBottom:"1px solid #e2e8f0"}}>
          {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(d=>(
            <div key={d} style={{padding:"6px 4px",textAlign:"center",fontSize:9,fontWeight:800,color:"#94a3b8",letterSpacing:.3}}>{d}</div>
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
            return <div key={dk} style={{background:bg,border:isToday?"2px solid #6366f1":"1px solid #e2e8f0",borderRadius:8,padding:"4px 5px",minHeight:52,cursor:"pointer",position:"relative",boxShadow:isToday?"0 0 0 2px #eef2ff":"none"}}
              onClick={()=>{
                if(codeActif){
                  // Mode saisie rapide : applique ou efface le code actif
                  setDay(dk, code===codeActif ? null : codeActif);
                } else {
                  // Mode cycle classique
                  const codes=["","M","AM","N","J","RP","RU","NU","CA","MA","VT","FOR","DISPO"];
                  const cur=codes.indexOf(code||"");
                  const next=codes[(cur+1)%codes.length];
                  setDay(dk,next||null);
                }
              }}>
              <div style={{fontSize:10,fontWeight:isToday?800:600,color:isToday?"#6366f1":isWE?"#94a3b8":"#1e293b",marginBottom:2}}>{dayNum}</div>
              {en?.finNuit&&showData&&<div style={{fontSize:7,fontWeight:700,color:"#1e3a8a",background:"#dbeafe",borderRadius:3,padding:"1px 3px",textAlign:"center",lineHeight:1.4}}>🌙 fin nuit<br/><span style={{fontWeight:400,fontSize:6}}>libre</span></div>}
              {code&&<div style={{fontSize:8,fontWeight:700,
                color:getTc(code),
                background:getColor(code),
                borderRadius:4,padding:"1px 4px",display:"inline-block"}}>
                {CODES_FETES[code]?`🩷 ${code}`:(eq?.label||code)?.slice(0,4)}
              </div>}
              {en?.equipe2&&(()=>{const eq2=EQ[en.equipe2]||EQ_COLORS[en.equipe2];return <div style={{fontSize:7,fontWeight:700,color:eq2?.textColor||eq2?.tc,background:eq2?.color||eq2?.bg,borderRadius:4,padding:"1px 3px",display:"inline-block",marginTop:1}}>🌙N</div>;})()} 
              {en?.jsCode&&en.jsCode!==code&&<div style={{fontSize:7,color:"#94a3b8",fontFamily:"monospace",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{en.jsCode}</div>}
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
        {codeActif
          ? `✏️ Mode saisie : tap sur un jour pour appliquer "${codeActif}" — tap à nouveau pour effacer`
          : "💡 Tap sur un jour pour faire défiler les statuts · Ou sélectionne un code ci-dessus"
        }
      </div>


    </>}
    {showColorPicker&&<ColorCustomizer
      agentColors={agentColors}
      setAgentColors={setAgentColors}
      onClose={()=>setShowColorPicker(false)}/>}
    {/* Tableau de bord compteurs */}
    {agent&&<DashboardCompteurs agent={agent} schedule={schedule} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} isOwnProfile={isOwnProfile} isAdmin={isAdmin}/>}
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
                  <input type="date" value={form.debut1} onChange={e=>setForm(p=>({...p,debut1:e.target.value}))}
                    style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 8px",fontSize:13,outline:"none"}}/>
                </div>
                <div>
                  <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:3}}>Au (inclus)</label>
                  <input type="date" value={form.fin1} onChange={e=>setForm(p=>({...p,fin1:e.target.value}))}
                    style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 8px",fontSize:13,outline:"none"}}/>
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
                    <input type="date" value={form.debut2} onChange={e=>setForm(p=>({...p,debut2:e.target.value}))}
                      style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 8px",fontSize:13,outline:"none"}}/>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:3}}>Au (inclus)</label>
                    <input type="date" value={form.fin2} onChange={e=>setForm(p=>({...p,fin2:e.target.value}))}
                      style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"7px 8px",fontSize:13,outline:"none"}}/>
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
      setLoading(false);
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


function CpsView({agents, schedule, setSchedule, notifications, setNotifications, currentAgentId, setAgentProfiles}){
  const [loading,setLoading]=useState(false);
  const [results,setResults]=useState([]);
  const [uploading,setUploading]=useState(false);

  const handleCpsPdf=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    setUploading(true);setLoading(true);
    const reader=new FileReader();
    reader.onload=async()=>{
      const b64=reader.result.split(",")[1];const mt=file.type==="application/pdf"?"application/pdf":file.type;
      try{
        const res=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:4000,messages:[{role:"user",content:[
            {type:"document",source:{type:"base64",media_type:mt,data:b64}},
            {type:"text",text:`Tu analyses une feuille de présence officielle SNCF (CPS).
Extrais toutes les affectations de tous les agents présents dans ce document.
Retourne UNIQUEMENT un JSON valide sans markdown :
{
  "date": "YYYY-MM-DD",
  "uop": "PRCI ou PAR",
  "affectations": [
    {
      "nom": "NOM",
      "prenom": "PRENOM",
      "jsCode": "PICCL-",
      "poste": "CCL",
      "equipe": "M|AM|N|J|CA|RP|RU|MA (CA=Congés)",
      "horaires": "06h15–14h17",
      "impressionAt": "YYYY-MM-DD HH:MM"
    }
  ]
}`}
          ]}]})});
        const data=await res.json();
        const raw=data.content?.map(c=>c.text||"").join("")||"";
        const parsed=JSON.parse(raw.replace(/```json|```/g,"").trim());

        // Comparer avec schedule existant et détecter écarts
        const ecarts=[];
        const updates=[];
        (parsed.affectations||[]).forEach(aff=>{
          const ag=agents.find(a=>a.nom.toUpperCase()===aff.nom.toUpperCase()||a.prenom.toUpperCase()===aff.prenom.toUpperCase());
          if(!ag)return;
          const key=`${ag.id}-${parsed.date}`;
          const existing=schedule[key];
          updates.push({agentId:ag.id,date:parsed.date,key,cpsEntry:{equipe:aff.equipe,jsCode:aff.jsCode,poste:aff.poste,horaires:aff.horaires,impressionAt:aff.impressionAt},existingEntry:existing});
          if(existing&&(existing.equipe!==aff.equipe||existing.jsCode!==aff.jsCode)){
            ecarts.push({agent:ag,date:parsed.date,cps:aff,existant:existing,acquitte:false});
          }
        });
        setResults(updates);

        // Appliquer les mises à jour CPS (version la plus récente gagne)
        setSchedule(prev=>{
          const next={...prev};
          updates.forEach(u=>{
            const existing=next[u.key];
            // Garder la plus récente selon impressionAt
            if(!existing||!existing.impressionAt||(u.cpsEntry.impressionAt&&u.cpsEntry.impressionAt>existing.impressionAt)){
              next[u.key]={...u.cpsEntry};
            }
          });
          return next;
        });

        // Créer notifications pour les écarts
        if(ecarts.length>0){
          setNotifications(prev=>[...prev,...ecarts.map(e=>({
            id:Date.now()+Math.random(),
            agentId:e.agent.id,
            agentNom:`${e.agent.prenom} ${e.agent.nom}`,
            date:e.date,
            message:`Écart CPS détecté le ${e.date} : CPS indique ${e.cps.jsCode} (${e.cps.equipe}) mais ton planning indique ${e.existant?.jsCode||"non renseigné"} (${e.existant?.equipe||"—"})`,
            cps:e.cps,
            existant:e.existant,
            acquitte:false,
          }))]);
        }

        setResults(updates);
      }catch(err){
        alert("Erreur lecture CPS : "+err.message);
      }
      setLoading(false);setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const acquitter=(id)=>{
    setNotifications(prev=>prev.map(n=>n.id===id?{...n,acquitte:true}:n));
    // Persister l'acquittement dans le profil pour sync multi-appareils
    if(currentAgentId){
      setAgentProfiles(prev=>{
        const profile = prev[currentAgentId]||{};
        const already = profile.notificationsAcquittees||[];
        if(already.includes(id)) return prev;
        return {...prev,[currentAgentId]:{
          ...profile,
          notificationsAcquittees:[...already,id],
        }};
      });
    }
  };
  const activeNotifs=notifications.filter(n=>!n.acquitte&&n.type!=="protocole"&&n.type!=="reliquats");
  const notifsProtocole=notifications.filter(n=>!n.acquitte&&n.type==="protocole");
  const notifsReliquats=notifications.filter(n=>!n.acquitte&&n.type==="reliquats");

  return(<div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div style={{background:"linear-gradient(135deg,#1e293b,#334155)",borderRadius:14,padding:"16px 20px",color:"#fff"}}>
      <div style={{fontSize:16,fontWeight:800,marginBottom:4}}>📋 Onglet CPS</div>
      <div style={{fontSize:12,opacity:.7}}>Import des feuilles de présence officielles. L'IA compare avec les plannings des agents et signale les écarts.</div>
    </div>

    {/* Upload */}
    <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:"16px 20px"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#64748b",marginBottom:12}}>IMPORTER UNE FEUILLE CPS</div>
      <label style={{display:"flex",alignItems:"center",gap:12,border:"2px dashed #cbd5e1",borderRadius:12,padding:"16px 20px",cursor:"pointer",background:"#f8fafc"}}>
        <span style={{fontSize:28}}>{loading?"⏳":"📄"}</span>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{loading?"Analyse en cours…":"Importer PDF ou photo feuille de présence"}</div>
          <div style={{fontSize:11,color:"#94a3b8"}}>Même format que les feuilles journalières · Comparaison automatique</div>
        </div>
        <input type="file" accept=".pdf,image/*" style={{display:"none"}} onChange={handleCpsPdf} disabled={loading}/>
      </label>
      {results.length>0&&(<div style={{marginTop:12,background:"#f0fdf4",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#065f46"}}>
        ✅ {results.length} affectation(s) importée(s) · {notifications.filter(n=>!n.acquitte).length} écart(s) détecté(s)
      </div>)}
    </div>

    {/* Rappels congés protocolaires */}
    {notifsProtocole.map(n=>(
      <div key={n.id} style={{background:n.bgCouleur,border:`1.5px solid ${n.borderCouleur}`,borderRadius:14,padding:"14px 18px",display:"flex",alignItems:"flex-start",gap:12}}>
        <div style={{fontSize:26,flexShrink:0}}>📅</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:800,color:n.textCouleur,marginBottom:4}}>{n.titre}</div>
          <div style={{fontSize:12,color:n.textCouleur,opacity:.85}}>{n.message}</div>
        </div>
        <button onClick={()=>acquitter(n.id)}
          style={{background:"rgba(0,0,0,.08)",border:"none",borderRadius:8,padding:"4px 10px",
            cursor:"pointer",fontSize:11,fontWeight:700,color:n.textCouleur,flexShrink:0,whiteSpace:"nowrap"}}>
          ✓ Fermer
        </button>
      </div>
    ))}

    {/* Rappels reliquats congés annuels */}
    {notifsReliquats.map(n=>(
      <div key={n.id} style={{background:n.bgCouleur,border:`1.5px solid ${n.borderCouleur}`,borderRadius:14,padding:"14px 18px",display:"flex",alignItems:"flex-start",gap:12}}>
        <div style={{fontSize:26,flexShrink:0}}>🏖️</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:800,color:n.textCouleur,marginBottom:4}}>{n.titre}</div>
          <div style={{fontSize:12,color:n.textCouleur,opacity:.9,marginBottom:6}}>{n.message}</div>
          <div style={{fontSize:10,color:n.textCouleur,opacity:.7,fontStyle:"italic"}}>
            Réf. : PROGRAMMATION DE L'ATTRIBUTION DES RELIQUATS DE CONGÉS RÉGLEMENTAIRES — IN01458
          </div>
        </div>
        <button onClick={()=>acquitter(n.id)}
          style={{background:"rgba(0,0,0,.08)",border:"none",borderRadius:8,padding:"4px 10px",
            cursor:"pointer",fontSize:11,fontWeight:700,color:n.textCouleur,flexShrink:0,whiteSpace:"nowrap"}}>
          ✓ Fermer
        </button>
      </div>
    ))}

    {/* Notifications écarts */}
    {activeNotifs.length>0&&(<div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{fontSize:12,fontWeight:800,color:"#991b1b",letterSpacing:.5}}>⚠️ ÉCARTS DÉTECTÉS ({activeNotifs.length})</div>
      {activeNotifs.map(n=>(
        <div key={n.id} style={{background:"#fff",border:"1.5px solid #fca5a5",borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>🔔 {n.agentNom}</div>
              <div style={{fontSize:12,color:"#475569",marginTop:3}}>{n.message}</div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div style={{background:"#eff6ff",borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#1e40af",marginBottom:3}}>CPS OFFICIEL</div>
              <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>{n.cps?.jsCode}</div>
              <div style={{fontSize:11,color:"#64748b"}}>{n.cps?.poste} · {n.cps?.equipe}</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>{n.cps?.horaires}</div>
            </div>
            <div style={{background:"#fef9c3",borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#713f12",marginBottom:3}}>PLANNING AGENT</div>
              <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>{n.existant?.jsCode||"—"}</div>
              <div style={{fontSize:11,color:"#64748b"}}>{n.existant?.poste||"Non renseigné"} · {n.existant?.equipe||"—"}</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>{n.existant?.horaires||""}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>acquitter(n.id)} style={{flex:1,background:"#1e293b",color:"#fff",border:"none",borderRadius:8,padding:"8px 0",cursor:"pointer",fontSize:12,fontWeight:700}}>✓ Acquitter</button>
          </div>
        </div>
      ))}
    </div>)}

    {notifications.filter(n=>n.acquitte).length>0&&(
      <div style={{fontSize:11,color:"#94a3b8",textAlign:"center"}}>{notifications.filter(n=>n.acquitte).length} écart(s) acquitté(s)</div>
    )}
  </div>);
}

// ─── ÉCHANGES ─────────────────────────────────────────────────────────────────

function EchangesView({agents,schedule,currentAgent,agentProfiles,setAgentProfiles}){
  const [demandes,setDemandes]=useState([]);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({date:"",motif:""});
  const myProfile=currentAgent?agentProfiles[currentAgent.id]||{}:{};
  const pasEchange=myProfile.pasEchange||false;
  const setPasEchange=v=>currentAgent&&setAgentProfiles(p=>({...p,[currentAgent.id]:{...(p[currentAgent.id]||{}),pasEchange:v}}));
  const habilis=agents.filter(a=>{if(!currentAgent||a.id===currentAgent.id)return false;return a.poste===currentAgent?.poste;});

  if(!currentAgent)return(<div style={{textAlign:"center",padding:"60px 20px",color:"#94a3b8"}}><div style={{fontSize:40,marginBottom:12}}>🔄</div><div style={{fontSize:15,fontWeight:600,color:"#475569"}}>Sélectionne ton profil</div></div>);

  const soumettre=()=>{
    if(!form.date||!currentAgent)return;
    const en=schedule[`${currentAgent.id}-${form.date}`];if(!en)return;
    setDemandes(p=>[{id:Date.now().toString(),demandeur:currentAgent,date:form.date,jsCode:en.jsCode,equipe:en.equipe,motif:form.motif,reponses:{},createdAt:new Date().toISOString()},...p]);
    setShowForm(false);setForm({date:"",motif:""});
  };
  const repondre=(id,agId,statut)=>setDemandes(p=>p.map(d=>d.id===id?{...d,reponses:{...d.reponses,[agId]:statut}}:d));
  const STATUS={ACCEPTE:{label:"Accepté ✓",color:"#d1fae5",tc:"#065f46"},REFUSE:{label:"Refusé ✗",color:"#fee2e2",tc:"#991b1b"},OCCASIONNEL:{label:"Occasionnel ⚡",color:"#fef3c7",tc:"#92400e"}};

  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{background:"#fff",border:`1.5px solid ${pasEchange?"#fca5a5":"#e2e8f0"}`,borderRadius:14,padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>Mon statut d'échange</div>
        <div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>{pasEchange?"Pas d'échange en ce moment":"Disponible pour des échanges"}</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:12,color:pasEchange?"#991b1b":"#065f46",fontWeight:600}}>{pasEchange?"🚫 Fermé":"✅ Ouvert"}</span>
        <Toggle value={pasEchange} onChange={setPasEchange} color="#ef4444"/>
      </div>
    </div>
    {!pasEchange&&<button onClick={()=>setShowForm(p=>!p)} style={{background:"#1e293b",color:"#fff",border:"none",borderRadius:12,padding:"11px 20px",cursor:"pointer",fontSize:13,fontWeight:700}}>🔄 Demander un échange</button>}
    {showForm&&(<div style={{background:"#f8fafc",borderRadius:12,padding:"14px 16px",border:"1.5px solid #e2e8f0",display:"flex",flexDirection:"column",gap:10}}>
      <input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13,outline:"none"}}/>
      <input value={form.motif} onChange={e=>setForm(p=>({...p,motif:e.target.value}))} placeholder="Motif (optionnel)" style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:13,outline:"none"}}/>
      <div style={{display:"flex",gap:8}}>
        <button onClick={soumettre} style={{flex:1,background:"#1e293b",color:"#fff",border:"none",borderRadius:9,padding:"9px 0",cursor:"pointer",fontSize:13,fontWeight:700}}>Envoyer</button>
        <button onClick={()=>setShowForm(false)} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:9,padding:"9px 12px",cursor:"pointer",fontSize:13}}>Annuler</button>
      </div>
    </div>)}
    {demandes.length===0&&<div style={{textAlign:"center",padding:"30px 20px",color:"#94a3b8",fontSize:13}}>Aucune demande en cours.</div>}
    {demandes.filter(d=>d.demandeur?.id===currentAgent.id).map(d=>(
      <div key={d.id} style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"13px 15px"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginBottom:6}}>{d.date} · <EqBadge code={d.equipe} small/> {d.jsCode}</div>
        {d.motif&&<div style={{fontSize:11,color:"#64748b",marginBottom:8,fontStyle:"italic"}}>"{d.motif}"</div>}
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
          {Object.entries(d.reponses).map(([agId,st])=>{const ag=agents.find(a=>a.id===agId);const s=STATUS[st];return ag?<span key={agId} style={{fontSize:10,background:s?.color,color:s?.tc,borderRadius:10,padding:"2px 8px",fontWeight:700}}>{ag.prenom} {ag.nom} — {s?.label}</span>:null;})}
          {Object.keys(d.reponses).length===0&&<span style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>En attente…</span>}
        </div>
      </div>
    ))}
    {demandes.filter(d=>d.demandeur?.id!==currentAgent.id&&habilis.some(h=>h.id===d.demandeur?.id)).map(d=>{
      const monStatut=d.reponses[currentAgent.id];const s=monStatut?STATUS[monStatut]:null;
      return(<div key={d.id} style={{background:"#fff",border:`1.5px solid ${s?s.color:"#e2e8f0"}`,borderRadius:12,padding:"13px 15px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><Av initials={d.demandeur?.initials||"?"} size={26} famille={d.demandeur?.famille}/><div><div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>{d.demandeur?.prenom} {d.demandeur?.nom}</div><div style={{fontSize:10,color:"#94a3b8"}}>{d.date}</div></div></div>
        {d.motif&&<div style={{fontSize:11,color:"#64748b",marginBottom:8,fontStyle:"italic"}}>"{d.motif}"</div>}
        {!pasEchange&&<div style={{display:"flex",gap:6}}>
          {["ACCEPTE","REFUSE","OCCASIONNEL"].map(st=>{const s2=STATUS[st];return(<button key={st} onClick={()=>repondre(d.id,currentAgent.id,st)} style={{border:`1.5px solid ${monStatut===st?"#1e293b":"#e2e8f0"}`,background:monStatut===st?s2.color:"#f8fafc",color:monStatut===st?s2.tc:"#475569",borderRadius:9,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>{s2.label}</button>);})}
        </div>}
      </div>);
    })}
  </div>);
}

// ─── IMPORT DÉROULÉ PRÉVISIONNEL ─────────────────────────────────────────────
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
function HabilitationsModal({agent,habilitations,onSave,onClose,suggestedPostes}){
  const [hab,setHab]=useState(()=>JSON.parse(JSON.stringify(habilitations)));
  const toggle=(code,niveau)=>setHab(prev=>{const next={...prev};if(next[code]===niveau)delete next[code];else next[code]=niveau;return next;});
  const fam=FAMILLES[agent.famille];
  const groupes=[{titre:"PRCI — 3×8",items:HAB_PRCI.filter(h=>h.type==="3x8")},{titre:"PRCI — Journée",items:HAB_PRCI.filter(h=>h.type==="J")},{titre:"PAR — 3×8",items:HAB_PAR.filter(h=>h.type==="3x8")},{titre:"PAR — Journée",items:HAB_PAR.filter(h=>h.type==="J")}];
  return(<div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.65)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:520,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,.25)",overflow:"hidden"}}>
      <div style={{background:`linear-gradient(135deg,${fam?.color||"#1e293b"},#334155)`,padding:"16px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <Av initials={agent.initials} size={36} famille={agent.famille}/>
        <div style={{flex:1}}><div style={{color:"#fff",fontSize:14,fontWeight:700}}>Habilitations · {agent.prenom} {agent.nom}</div></div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:8,width:28,height:28,cursor:"pointer",fontSize:14}}>✕</button>
      </div>
      {suggestedPostes?.length>0&&<div style={{background:"#fef3c7",padding:"8px 16px",borderBottom:"1px solid #fde68a",fontSize:11,color:"#92400e"}}>💡 Détectés : {suggestedPostes.slice(0,5).join(", ")}</div>}
      <div style={{overflowY:"auto",flex:1,padding:"14px 18px",display:"flex",flexDirection:"column",gap:12}}>
        {groupes.map(g=>(<div key={g.titre}>
          <div style={{fontSize:10,fontWeight:800,color:"#94a3b8",letterSpacing:.6,marginBottom:6}}>{g.titre.toUpperCase()}</div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {g.items.map(h=>{const current=hab[h.code];const n=NIV_HAB.find(x=>x.code===current);const isSug=suggestedPostes?.includes(h.label);
              return(<div key={h.code} style={{display:"flex",alignItems:"center",gap:8,background:current?"#f8fafc":isSug?"#fef9c3":"transparent",border:`1px solid ${current?"#e2e8f0":isSug?"#fde68a":"transparent"}`,borderRadius:7,padding:"4px 8px"}}>
                <div style={{flex:1}}><span style={{fontSize:12,fontWeight:600,color:"#1e293b"}}>{h.label}</span>{isSug&&!current&&<span style={{fontSize:9,color:"#92400e",marginLeft:5,background:"#fef3c7",borderRadius:8,padding:"1px 5px"}}>PDF</span>}{current&&<span style={{fontSize:10,fontWeight:700,marginLeft:6,color:n?.textColor}}>{n?.label}</span>}</div>
                <div style={{display:"flex",gap:3}}>
                  {NIV_HAB.map(nv=>(<button key={nv.code} onClick={()=>toggle(h.code,nv.code)} style={{border:`1.5px solid ${current===nv.code?nv.dot:"#e2e8f0"}`,background:current===nv.code?nv.color:"#fff",color:current===nv.code?nv.textColor:"#94a3b8",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>{nv.label}</button>))}
                  {current&&<button onClick={()=>toggle(h.code,current)} style={{border:"1px solid #e2e8f0",background:"#fff",color:"#94a3b8",borderRadius:6,padding:"2px 6px",cursor:"pointer",fontSize:10}}>✕</button>}
                </div>
              </div>);})}
          </div>
        </div>))}
      </div>
      <div style={{padding:"12px 18px",borderTop:"1px solid #e2e8f0",display:"flex",gap:8,flexShrink:0}}>
        <button onClick={()=>onSave(hab)} style={{flex:1,background:"#1e293b",color:"#fff",border:"none",borderRadius:9,padding:"10px 0",cursor:"pointer",fontSize:13,fontWeight:700}}>✓ Enregistrer</button>
        <button onClick={onClose} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:9,padding:"10px 12px",cursor:"pointer",fontSize:13}}>Annuler</button>
      </div>
    </div>
  </div>);
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
function LoginPage({ onLogin, authData, setAuthData }) {
  const [step, setStep] = useState("login"); // "login" | "first_time" | "forgot"
  const [CP, setCP] = useState("");
  const [pin, setPin] = useState(["","","",""]);
  const [pinConfirm, setPinConfirm] = useState(["","","",""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const r0=useRef(),r1=useRef(),r2=useRef(),r3=useRef();
  const c0=useRef(),c1=useRef(),c2=useRef(),c3=useRef();
  const pinRefs=[r0,r1,r2,r3];
  const confRefs=[c0,c1,c2,c3];

  const pinStr = pin.join("");
  const confStr = pinConfirm.join("");
  
  // Focus automatique sur le premier champ PIN au montage
  useEffect(()=>{ pinRefs[0].current?.focus(); },[]);

  const handlePinDigit = (i, v, arr, setArr, refs) => {
    // Prendre seulement le dernier chiffre saisi (cas collage)
    const digit = v.replace(/\D/g, '').slice(-1);
    const next = [...arr]; next[i] = digit; setArr(next);
    if (digit && i < 3) {
      setTimeout(() => refs[i+1].current?.focus(), 10);
    }
    if (!digit && i > 0) {
      setTimeout(() => refs[i-1].current?.focus(), 10);
    }
  };

  const handleLogin = () => {
    setError("");
    setLoading(true);
    setTimeout(() => {
      const mat = CP.trim().toUpperCase();
      // Vérifier que le CP existe dans la liste
      const agent = AGENTS_INIT.find(a =>
        a.immatriculation?.toUpperCase() === mat
      );
      if (!agent) {
        setError("CP non reconnu. Vérifiez votre saisie ou contactez l'administrateur.");
        setLoading(false); return;
      }
      const stored = authData[mat];
      if (!stored || !stored.pinHash) {
        // Première connexion — vider le pin pour repartir proprement
        setPin(["","","",""]);
        setStep("first_time");
        setLoading(false); return;
      }
      // Vérifier PIN
      if (hashPin(mat, pinStr) === stored.pinHash) {
        onLogin({ agent, isAdmin: stored.isAdmin || ADMIN_MATRICULES_DEFAULT.includes(mat) });
      } else {
        setError("Code PIN incorrect.");
      }
      setLoading(false);
    }, 300);
  };

  const handleFirstTime = () => {
    if (pinStr.length < 4) { setError("4 chiffres requis"); return; }
    if (pinStr !== confStr) { setError("Les codes ne correspondent pas"); return; }
    const mat = CP.trim().toUpperCase();
    const isAdmin = ADMIN_MATRICULES_DEFAULT.includes(mat) ||
      Object.values(authData).some(d => d.isAdmin && d.grantedAdmin?.includes(mat));
    const newAuth = {
      ...authData,
      [mat]: {
        pinHash: hashPin(mat, pinStr),
        isAdmin,
        createdAt: new Date().toISOString(),
      }
    };
    setAuthData(newAuth);
    const agent = AGENTS_INIT.find(a => a.immatriculation?.toUpperCase() === mat);
    onLogin({ agent, isAdmin });
  };

  const PinInput = ({arr, setArr, refs, label}) => (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
      <div style={{fontSize:11,color:"#64748b",fontWeight:600}}>{label}</div>
      <div style={{display:"flex",gap:10}}>
        {[0,1,2,3].map(i=>(
          <input key={i} ref={refs[i]} type="password" inputMode="numeric" maxLength={1}
            value={arr[i]}
            onChange={e=>handlePinDigit(i,e.target.value,arr,setArr,refs)}
            onKeyDown={e=>{
              if(e.key==="Enter"&&arr.every(d=>d)) step==="login"?handleLogin():step==="first_time"&&confStr.length===4?handleFirstTime():setStep("confirm");
              if(e.key==="Backspace"&&!arr[i]&&i>0)refs[i-1].current?.focus();
            }}
            style={{width:48,height:56,textAlign:"center",fontSize:24,fontWeight:800,
              border:`2px solid ${error?"#ef4444":arr[i]?"#0891b2":"#e2e8f0"}`,
              borderRadius:10,outline:"none",background:arr[i]?"#f0fdff":"#fff",
              transition:"border-color .15s"}}/>
        ))}
      </div>
    </div>
  );

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
          {step === "login" && <>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:800,color:"#1e293b"}}>Connexion</div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>Entre ton CP et ton code PIN</div>
            </div>

            <div>
              <input value={CP} onChange={e=>{setCP(e.target.value.toUpperCase());setError("");}}
                placeholder="CP SNCF"
                onKeyDown={e=>e.key==="Enter"&&pinRefs[0].current?.focus()}
                style={{width:"100%",border:"2px solid #e2e8f0",borderRadius:10,padding:"11px 14px",fontSize:14,fontFamily:"'DM Mono',monospace",fontWeight:700,outline:"none",letterSpacing:2,textAlign:"center",boxSizing:"border-box"}}/>
            </div>

            <PinInput arr={pin} setArr={setPin} refs={pinRefs} label="CODE PIN (4 chiffres)"/>

            {error && <div style={{background:"#fee2e2",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#991b1b",fontWeight:600,textAlign:"center"}}>{error}</div>}

            <button onClick={handleLogin} disabled={!CP||pinStr.length!==4||loading}
              style={{background:CP&&pinStr.length===4?"#0f4c81":"#e2e8f0",color:CP&&pinStr.length===4?"#fff":"#94a3b8",border:"none",borderRadius:12,padding:"14px 0",cursor:CP&&pinStr.length===4?"pointer":"not-allowed",fontSize:14,fontWeight:800,transition:"all .15s"}}>
              {loading?"Connexion…":"Se connecter →"}
            </button>

            <div style={{textAlign:"center",fontSize:11,color:"#94a3b8"}}>
              Première connexion ? Entre ton CP et ton PIN sera créé.
            </div>
          </>}

          {/* PREMIÈRE CONNEXION */}
          {step === "first_time" && <>
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

            <PinInput arr={pin} setArr={setPin} refs={pinRefs} label="NOUVEAU CODE PIN"/>
            <PinInput arr={pinConfirm} setArr={setPinConfirm} refs={confRefs} label="CONFIRME TON CODE PIN"/>

            {error && <div style={{background:"#fee2e2",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#991b1b",fontWeight:600,textAlign:"center"}}>{error}</div>}

            <button onClick={handleFirstTime} disabled={pinStr.length<4||confStr.length<4}
              style={{background:pinStr.length===4&&confStr.length===4?"#065f46":"#e2e8f0",color:pinStr.length===4&&confStr.length===4?"#fff":"#94a3b8",border:"none",borderRadius:12,padding:"14px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>
              ✓ Créer mon compte
            </button>

            <button onClick={()=>{setStep("login");setPin(["","","","",""]);setPinConfirm(["","","","",""]);setError("");}}
              style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,textAlign:"center"}}>
              ← Retour
            </button>
          </>}

        </div>
      </div>
    </div>
  );
}

// Panneau de gestion des comptes (admin)
function AdminAuthPanel({ authData, setAuthData, agents, onClose }) {
  const [search, setSearch] = useState("");
  const [confirmReset, setConfirmReset] = useState(null);

  const filtered = agents.filter(a =>
    `${a.prenom} ${a.nom}`.toLowerCase().includes(search.toLowerCase()) ||
    (a.immatriculation||"").toLowerCase().includes(search.toLowerCase())
  );

  const toggleAdmin = (mat) => {
    const m = mat.toUpperCase();
    setAuthData(prev => ({
      ...prev,
      [m]: { ...(prev[m]||{}), isAdmin: !prev[m]?.isAdmin }
    }));
  };

  const resetPin = (mat) => {
    const m = mat.toUpperCase();
    setAuthData(prev => {
      const next = {...prev};
      if (next[m]) { delete next[m].pinHash; next[m].resetAt = new Date().toISOString(); }
      return next;
    });
    setConfirmReset(null);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.7)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:560,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,.3)",overflow:"hidden"}}>
        <div style={{background:"linear-gradient(135deg,#7c3aed,#4c1d95)",padding:"16px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:20}}>👑</span>
          <div style={{flex:1,color:"#fff",fontSize:14,fontWeight:800}}>Gestion des comptes — Admin</div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:8,width:28,height:28,cursor:"pointer",fontSize:14}}>✕</button>
        </div>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #f1f5f9",flexShrink:0}}>
          <input placeholder="Rechercher un agent…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:9,padding:"7px 11px",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {filtered.map(ag => {
            const mat = (ag.immatriculation||"").toUpperCase();
            const stored = authData[mat]||{};
            const hasPin = !!stored.pinHash;
            const isAdmin = stored.isAdmin || ADMIN_MATRICULES_DEFAULT.includes(mat);
            return (
              <div key={ag.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderBottom:"1px solid #f8fafc"}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:isAdmin?"#7c3aed":"#0f4c81",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0}}>
                  {ag.initials||ag.prenom[0]}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>{ag.prenom} {ag.nom}</div>
                  <div style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>{mat||"—"} · {ag.grade}</div>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  {/* Statut compte */}
                  <span style={{fontSize:9,background:hasPin?"#d1fae5":"#fee2e2",color:hasPin?"#065f46":"#991b1b",borderRadius:8,padding:"2px 7px",fontWeight:700}}>
                    {hasPin?"✓ Compte":"Pas de compte"}
                  </span>
                  {/* Toggle admin */}
                  <button onClick={()=>toggleAdmin(mat)} style={{fontSize:9,background:isAdmin?"#f5f3ff":"#f1f5f9",color:isAdmin?"#7c3aed":"#94a3b8",border:`1px solid ${isAdmin?"#c4b5fd":"#e2e8f0"}`,borderRadius:8,padding:"3px 8px",cursor:"pointer",fontWeight:700}}>
                    {isAdmin?"👑 Admin":"Rendre admin"}
                  </button>
                  {/* Reset PIN */}
                  {hasPin && (
                    confirmReset===mat
                    ? <div style={{display:"flex",gap:4}}>
                        <button onClick={()=>resetPin(mat)} style={{fontSize:9,background:"#dc2626",color:"#fff",border:"none",borderRadius:7,padding:"3px 8px",cursor:"pointer",fontWeight:700}}>Confirmer</button>
                        <button onClick={()=>setConfirmReset(null)} style={{fontSize:9,background:"#f1f5f9",color:"#475569",border:"none",borderRadius:7,padding:"3px 8px",cursor:"pointer"}}>✕</button>
                      </div>
                    : <button onClick={()=>setConfirmReset(mat)} style={{fontSize:9,background:"#fef3c7",color:"#92400e",border:"1px solid #fde68a",borderRadius:8,padding:"3px 8px",cursor:"pointer",fontWeight:700}}>🔑 Reset PIN</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{padding:"12px 16px",borderTop:"1px solid #e2e8f0",flexShrink:0,fontSize:11,color:"#94a3b8",textAlign:"center"}}>
          {Object.keys(authData).length} compte(s) créé(s) · {Object.values(authData).filter(d=>d.isAdmin).length} admin(s)
        </div>
      </div>
    </div>
  );
}

// ─── APP PRINCIPALE ───────────────────────────────────────────────────────────

export default function App(){
  // ── PERSISTANCE & ÉTATS ───────────────────────────────────────────────────
  const [view,setView]=useState("personal");
  const [agents,setAgents]=usePersist("agents",AGENTS_INIT);
  const [currentAgent,setCurrentAgent]=useState(null);
  const [weekOffset,setWeekOffset]=useState(0);
  const [profileOpen,setProfileOpen]=useState(false);
  const [profileSearch,setProfileSearch]=useState("");
  const [schedule,setSchedule]=usePersist("schedule",{});
  const [agentProfiles,setAgentProfiles]=usePersist("agentProfiles",{});
  const [importDPTarget,setImportDPTarget]=useState(null);
  const [addAgentOpen,setAddAgentOpen]=useState(false);
  const [notifications,setNotifications]=usePersist("notifications",[]);
  const [departDates,setDepartDates]=usePersist("departDates",{});
  // ── AUTH ──────────────────────────────────────────────────────────────────
  const [authData,setAuthData]=usePersist("authData",{});
  const [currentUser,setCurrentUser]=usePersist("currentUser",null);
  const [showAuthAdmin,setShowAuthAdmin]=useState(false);
  const [loginTarget,setLoginTarget]=useState(null);
  const isAdmin=currentUser?.isAdmin||false;

  const handleLogin=(user)=>{
    setCurrentUser(user);
    setCurrentAgent(user.agent);
    setView("personal");
  };
  const handleLogout=()=>{
    setCurrentUser(null);
    setCurrentAgent(null);
    setProfileOpen(false);
  };

  // Nettoyage archives > 3 ans
  useEffect(()=>{ setSchedule(prev=>cleanOldEntries(prev)); },[]);

  // ── SYNC AU FOCUS (multi-appareils) ──────────────────────────────────────────
  // Quand l'agent revient sur l'appli (depuis un autre onglet ou appareil),
  // on recharge ses données depuis Supabase pour refléter les dernières modifications
  useEffect(()=>{
    const handleFocus = () => {
      if(!currentUser?.agent?.id) return;
      const agentId = currentUser.agent.id;
      // Recharger profil
      sbLoadProfile(agentId).then(profile=>{
        if(!profile) return;
        setAgentProfiles(prev=>({...prev,[agentId]:{
          ...(prev[agentId]||{}),
          pinHash:             profile.pin_hash,
          isAdmin:             profile.is_admin,
          roulement:           profile.roulement,
          isReserve:           profile.is_reserve,
          famillesHab:         profile.familles_hab,
          habilitations:       profile.habilitations||{},
          agentColors:         profile.agent_colors||{},
          pauseFigee:          profile.pause_figee||{},
          compteurCorrections: profile.compteur_corrections||{},
          fetesTracking:       profile.fetes_tracking||{},
          pauseFigeeFiaMois:   profile.pause_figee_fia_mois||{},
          pauseFigeeFiaDone:   profile.pause_figee_fia_done||{},
          demandesConges:      profile.demandes_conges||[],
          notificationsAcquittees: profile.notifications_acquittees||[],
        }}));
        // Restaurer acquittements
        if(profile.notifications_acquittees?.length){
          setNotifications(prev=>prev.map(n=>
            profile.notifications_acquittees.includes(n.id)?{...n,acquitte:true}:n
          ));
        }
      });
      // Recharger planning
      sbLoadSchedule(agentId).then(entries=>{
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
    const agentId = currentUser.agent.id;
    // Charger le profil
    sbLoadProfile(agentId).then(profile=>{
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
      // Restaurer les notifications acquittées sur cet appareil
      if(profile.notifications_acquittees?.length){
        setNotifications(prev=>prev.map(n=>
          profile.notifications_acquittees.includes(n.id)
            ? {...n, acquitte:true} : n
        ));
      }
    });
    // Charger le planning
    sbLoadSchedule(agentId).then(entries=>{
      if(!entries||Object.keys(entries).length===0) return;
      setSchedule(prev=>({...prev,...entries}));
    });
  },[currentUser?.agent?.id]); // eslint-disable-line


  // Sauvegarder le profil dans Supabase quand il change
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    const agentId = currentUser.agent.id;
    const profile = agentProfiles[agentId];
    if(profile) sbSaveProfile(agentId, profile);
  },[agentProfiles]);

  // ── RAPPEL CONGÉS PROTOCOLAIRES ─────────────────────────────────────────────
  // Injecte une notif de rappel le 20 janvier (1er rappel) et 15 février (dernier rappel)
  // Identifiée par une clé unique année+type+agent pour éviter les doublons
  useEffect(()=>{
    if(!currentUser?.agent?.id) return;
    const agentId = currentUser.agent.id;
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
    const agentId = currentUser.agent.id;
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
    const agentId = currentUser.agent.id;
    sbLoadSchedule(agentId).then(entries=>{
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
  const activeNotifCount=notifications.filter(n=>!n.acquitte&&(currentAgent?n.agentId===currentAgent.id:true)).length;

  const VIEWS=[
    {k:"personal",l:"📊 Mon planning"},
    {k:"global",  l:"🏢 Vue équipe"},
    {k:"echanges",l:"🔄 Échanges"},
    {k:"cps",     l:"📋 CPS"+(activeNotifCount>0?` (${activeNotifCount})`:"")}
  ];

  return(<div style={{minHeight:"100vh",background:"#ffffff",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;}button:hover{opacity:.85;}`}</style>

    {/* HEADER */}
    <div style={{background:"#fff",borderBottom:"1.5px solid #e2e8f0",position:"sticky",top:0,zIndex:50}}>
      <div style={{maxWidth:1100,margin:"0 auto",display:"flex",alignItems:"center",gap:8,height:52,padding:"0 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginRight:4}}>
          <div style={{width:30,height:30,background:"linear-gradient(135deg,#0f4c81,#1e3a5f)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:15}}>🚄</span>
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#0f4c81",letterSpacing:-.3}}>F2P.PMP</div>
            <div style={{fontSize:8,color:"#94a3b8",letterSpacing:.5,fontFamily:"monospace"}}>PRCI · PAR · PMP</div>
          </div>
        </div>
        <div style={{display:"flex",gap:2,background:"#f1f5f9",borderRadius:9,padding:3}}>
          {VIEWS.map(({k,l})=>(
            <button key={k} onClick={()=>setView(k)} style={{border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",background:view===k?"#fff":"transparent",color:view===k?"#1e293b":"#94a3b8",fontSize:11,fontWeight:view===k?700:400,boxShadow:view===k?"0 1px 4px rgba(0,0,0,.08)":"none",whiteSpace:"nowrap",position:"relative"}}>
              {l}{k==="cps"&&activeNotifCount>0&&<span style={{position:"absolute",top:-2,right:-2,width:7,height:7,borderRadius:"50%",background:"#ef4444"}}/>}
            </button>
          ))}
        </div>
        {isAdmin&&<div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{background:"#fff8e1",border:"1px solid #fde68a",borderRadius:6,padding:"2px 7px",fontSize:9,fontWeight:700,color:"#92400e"}}>👑 Admin</div>
          <button onClick={()=>setShowAuthAdmin(true)} style={{background:"#f5f3ff",border:"1px solid #c4b5fd",borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700,color:"#7c3aed",cursor:"pointer"}}>⚙️ Comptes</button>
        </div>}
        <div style={{flex:1}}/>
        <button onClick={handleLogout} title="Se déconnecter" style={{border:"1.5px solid #fee2e2",borderRadius:9,padding:"5px 9px",background:"#fff",cursor:"pointer",fontSize:11,color:"#ef4444",fontWeight:600}}>🚪 Déco.</button>
        <div style={{position:"relative"}}>
          <button onClick={()=>setProfileOpen(p=>!p)} style={{border:"1.5px solid #e2e8f0",borderRadius:9,padding:"5px 10px",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#1e293b",fontWeight:700}}>
            {currentAgent&&<Av initials={currentAgent.initials} size={18} famille={currentAgent.famille}/>}
            <span>{currentAgent?.prenom||"Profil"}</span>
            {isOwnProfile&&<span style={{fontSize:9,color:"#10b981"}}>🔓</span>}
            <span style={{fontSize:9,opacity:.4}}>▼</span>
          </button>
          {profileOpen&&(<div style={{position:"absolute",top:"calc(100% + 5px)",right:0,width:260,background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:13,boxShadow:"0 8px 30px rgba(0,0,0,.12)",zIndex:100,overflow:"hidden"}}>
            <div style={{padding:"8px 10px",borderBottom:"1px solid #f1f5f9"}}>
              <input autoFocus placeholder="Rechercher…" value={profileSearch} onChange={e=>setProfileSearch(e.target.value)}
                style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 8px",fontSize:11,outline:"none"}}/>
            </div>
            {["PRCI","PAR"].map(fKey=>{
              const rows=profils.filter(a=>a.famille===fKey);if(!rows.length)return null;
              const fam=FAMILLES[fKey];
              return(<div key={fKey}>
                <div style={{padding:"4px 11px",fontSize:8,fontWeight:800,color:"#94a3b8",letterSpacing:.8,background:fam.color+"11",borderBottom:"1px solid #f1f5f9"}}>{fam.label.toUpperCase()}</div>
                <div style={{maxHeight:150,overflowY:"auto"}}>
                  {rows.map(a=>(
                    <button key={a.id} onClick={()=>{
                      if(currentUser&&a.id===currentUser.agent?.id){
                        setCurrentAgent(a);setProfileOpen(false);setProfileSearch("");
                      } else if(isAdmin){
                        setCurrentAgent(a);setProfileOpen(false);setProfileSearch("");
                      } else {
                        setLoginTarget(a);setProfileOpen(false);setProfileSearch("");
                      }
                    }} style={{width:"100%",border:"none",background:currentAgent?.id===a.id?"#eff6ff":"transparent",padding:"6px 11px",cursor:"pointer",display:"flex",alignItems:"center",gap:7,textAlign:"left"}}>
                      <Av initials={a.initials} size={22} famille={a.famille}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,fontWeight:600,color:"#1e293b"}}>{a.prenom} {a.nom}</div>
                        <div style={{fontSize:9,color:"#94a3b8"}}>{a.poste}</div>
                      </div>
                      {currentAgent?.id===a.id&&<span style={{color:fam.accent,fontSize:11}}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>);
            })}
          </div>)}
        </div>
      </div>
    </div>

    {/* CONTENU */}
    <div style={{maxWidth:1100,margin:"0 auto",padding:"14px"}}>
      {view==="global"&&<GlobalView agents={agents} schedule={schedule} setSchedule={setSchedule} currentAgent={currentAgent} weekOffset={weekOffset} setWeekOffset={setWeekOffset}
        onImport={ag=>{setCurrentAgent(ag);setImportDPTarget(ag);}}
        onAddAgent={()=>setAddAgentOpen(true)}
        onRemoveAgent={ag=>{if(window.confirm(`Supprimer ${ag.prenom} ${ag.nom} ?`))setAgents(p=>p.filter(a=>a.id!==ag.id));}}
        isAdmin={isAdmin}/>}
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
        currentUser={currentUser}/>}}
      {view==="echanges"&&<EchangesView agents={agents} schedule={schedule} currentAgent={currentAgent} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles}/>}
      {view==="cps"&&<CpsView agents={agents} schedule={schedule} setSchedule={setSchedule} notifications={notifications} setNotifications={setNotifications} currentAgentId={currentAgent?.id} setAgentProfiles={setAgentProfiles}/>}
    </div>

    {/* MODALS */}
      {importDPTarget&&<ImportDeroulement agent={importDPTarget} onClose={()=>setImportDPTarget(null)} onImport={jours=>handleImportSchedule(importDPTarget.id,jours)}/>}
    {addAgentOpen&&<AddAgentModal onClose={()=>setAddAgentOpen(false)} onAdd={ag=>{setAgents(p=>[...p,ag]);}}/>}
    {profileOpen&&<div onClick={()=>setProfileOpen(false)} style={{position:"fixed",inset:0,zIndex:49}}/>}
    {showAuthAdmin&&<AdminAuthPanel authData={authData} setAuthData={setAuthData} agents={agents} onClose={()=>setShowAuthAdmin(false)}/>}

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