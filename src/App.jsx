import React from "react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";

// ─── SUPABASE ────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://vrhykmrbdakjycfqbzpt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaHlrbXJiZGFranljZnFiem90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3MzI5NzUsImV4cCI6MjA2NDMxODk3NX0.4X8Fsh49gGZ754yvQy-hNqD8_xS46VzXg2E_Lsz82vM";
async function sbFetch(path, opts={}) {
  if (SUPABASE_URL==="VOTRE_URL_SUPABASE") return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${SUPABASE_ANON_KEY}`,"Content-Type":"application/json","Prefer":"return=representation",...opts.headers},
    ...opts,
  });
  if (!res.ok) return null;
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
  "F1":"1er Janvier","F2":"Lundi de Pâques","F3":"1er Mai","F4":"8 Mai",
  "F5":"Ascension","FV":"Vendredi Saint (Alsace)","F6":"Lundi de Pentecôte",
  "F7":"14 Juillet","F8":"15 Août","F9":"1er Novembre","F0":"11 Novembre",
  "VN":"Noël (Vendredi Saint)",
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
  { code:"M",    label:"Matinée",       heures:"06h10–14h17", color:"#fef3c7", textColor:"#92400e", dot:"#f59e0b", prive:false, compteur:"TRAVAIL" },
  { code:"AM",   label:"Soirée",        heures:"14h05–22h17", color:"#dbeafe", textColor:"#1e40af", dot:"#3b82f6", prive:false, compteur:"TRAVAIL" },
  { code:"N",    label:"Nuit",          heures:"22h15–06h17", color:"#ede9fe", textColor:"#5b21b6", dot:"#8b5cf6", prive:false, compteur:"TRAVAIL" },
  { code:"J",    label:"Journée",       heures:"08h00–17h45", color:"#d1fae5", textColor:"#065f46", dot:"#10b981", prive:false, compteur:"TRAVAIL" },
  { code:"JF",   label:"Journée/F.",    heures:"",            color:"#bbf7d0", textColor:"#14532d", dot:"#22c55e", prive:false, compteur:"TRAVAIL" },
  { code:"RFT",  label:"Renfort",       heures:"Variable",    color:"#fce7f3", textColor:"#9d174d", dot:"#ec4899", prive:false, compteur:"TRAVAIL" },
  { code:"RP",   label:"RP",            heures:"",            color:"#d1fae5", textColor:"#065f46", dot:"#10b981", prive:true,  compteur:"RP"      },
  { code:"RU",   label:"RU",            heures:"",            color:"#fef9c3", textColor:"#713f12", dot:"#eab308", prive:true,  compteur:"RU"      },
  { code:"RQ",   label:"RQ",            heures:"",            color:"#fef9c3", textColor:"#713f12", dot:"#eab308", prive:true,  compteur:"RU"      },
  { code:"TC",   label:"TC",            heures:"",            color:"#dbeafe", textColor:"#1e40af", dot:"#3b82f6", prive:true,  compteur:"TC"      },
  { code:"RN",   label:"RN",            heures:"",            color:"#ede9fe", textColor:"#5b21b6", dot:"#8b5cf6", prive:true,  compteur:"RN"      },
  { code:"CP",   label:"Congé",         heures:"",            color:"#e0f2fe", textColor:"#0369a1", dot:"#0ea5e9", prive:true,  compteur:null      },
  { code:"FOR",  label:"Formation",     heures:"09h00–17h45", color:"#fef9c3", textColor:"#713f12", dot:"#eab308", prive:true,  compteur:null      },
  { code:"ABS",  label:"Absent",        heures:"",            color:"#fee2e2", textColor:"#991b1b", dot:"#ef4444", prive:true,  compteur:null      },
  { code:"FERIE",label:"Férié",         heures:"",            color:"#fce7f3", textColor:"#9d174d", dot:"#ec4899", prive:true,  compteur:null      },
  { code:"NU",   label:"NU",            heures:"",            color:"#f1f5f9", textColor:"#64748b", dot:"#94a3b8", prive:true,  compteur:null      },
  { code:"RPA",  label:"RPA",           heures:"",            color:"#fef0ff", textColor:"#7e22ce", dot:"#a855f7", prive:true,  compteur:null      },
  { code:"DISPO",label:"Disponible",    heures:"",            color:"#ecfdf5", textColor:"#065f46", dot:"#10b981", prive:false, compteur:null      },
  ...Object.keys(CODES_FETES).map(k=>({ code:k, label:k, heures:"", color:"#fdf2f8", textColor:"#9d174d", dot:"#ec4899", prive:true, compteur:"FETE" })),
];
const EQ = Object.fromEntries(EQUIPES.map(e=>[e.code,e]));

const DP_MAP = {
  "PICCL-":"M","PICCLO":"AM","PICCLX":"N",
  "PIADJ-":"M","PIADJO":"AM","PIADJX":"N",
  "PILNE-":"M","PILNEO":"AM","PILNEX":"N",
  "PILNO-":"M","PILNOO":"AM","PILNOX":"N",
  "PIVGD-":"M","PIVGDO":"AM",
  "PILCL-":"M","PILCLO":"AM","PILCLX":"N",
  "PAAC1-":"M","PAAC1O":"AM","PAAC1X":"N",
  "PAAC2-":"M","PAAC2O":"AM","PAAC2X":"N",
  "PAACXX":"N",
  "RP":"RP","RU":"RU","RQ":"RQ","TC":"TC","RN":"RN",
  "CP":"CP","FOR":"FOR","ABS":"ABS","FERIE":"FERIE","NU":"NU","DISPO":"DISPO",
  ...Object.fromEntries(Object.keys(CODES_FETES).map(k=>[k,k])),
  // Codes formation sur poste (suffixe /)
  "PIADJ-/":"M","PICCL-/":"M","PILCL-/":"M","PILNE-/":"M","PILNO-/":"M","PIVGD-/":"M",
  "PIADJO/":"AM","PICCLO/":"AM","PILCLO/":"AM","PILNEO/":"AM","PILNOO/":"AM",
  "PIADJX/":"N","PICCLX/":"N","PILCLX/":"N","PILNEX/":"N","PILNOX/":"N",
  "PAAC1-/":"M","PAAC2-/":"M","PAAC1O/":"AM","PAAC2O/":"AM","PAAC1X/":"N","PAAC2X/":"N",
  "/PAASMJ":"J",
  // Autres codes journée
  "K-PRCI":"J","A-PRCI":"J","F-PAR":"J","AFOPRCI":"J","PPRCI":"J",
  // Codes privés supplémentaires
  "RPA":"RPA","#SD%":"J","#PPRCI":"J",
};

const PERIOD_COLORS = {
  M:    {bg:"#fefce8", bd:"#fde047", hd:"#ca8a04"}, // Jaune doré — bg ivoire, header amber-600
  J:    {bg:"#fff7ed", bd:"#fed7aa", hd:"#ea580c"}, // Orange   — bg pêche, header orange-600
  AM:   {bg:"#f0fdf4", bd:"#86efac", hd:"#16a34a"}, // Vert     — bg vert très clair, header green-600
  N:    {bg:"#eff6ff", bd:"#93c5fd", hd:"#1e3a8a"}, // Bleu marine — bg bleu clair, header blue-900
  DIVERS:{bg:"#fdf4ff",bd:"#e9d5ff",hd:"#7c3aed"},
};;

const NIV_HAB = [
  { code:"EN_COURS", label:"En cours", color:"#fef3c7", textColor:"#92400e", dot:"#f59e0b" },
  { code:"VALIDE",   label:"Validée",  color:"#d1fae5", textColor:"#065f46", dot:"#10b981" },
];
const HAB_PRCI = [
  ...POSTES_PRCI_3x8.map(p=>({code:p.code,label:p.label,type:"3x8",famille:"PRCI"})),
  ...POSTES_JOURNEE.filter(p=>p.famille==="PRCI").map(p=>({code:p.jsCode,label:p.label,type:"J",famille:"PRCI"})),
];
const HAB_PAR = [
  ...POSTES_PAR_3x8.map(p=>({code:p.code,label:p.label,type:"3x8",famille:"PAR"})),
  ...POSTES_JOURNEE.filter(p=>p.famille==="PAR").map(p=>({code:p.jsCode,label:p.label,type:"J",famille:"PAR"})),
];

const DAYS_S=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const DAYS_L=["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const MOIS_L=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function getWeekDates(offset=0){
  const now=new Date();const day=now.getDay();
  const diff=day===0?-6:1-day;
  const mon=new Date(now);mon.setDate(now.getDate()+diff+offset*7);
  return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d.toISOString().slice(0,10);});
}
const TODAY=new Date().toISOString().slice(0,10);
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
function computeCompteurs(schedule, agentId, year) {
  const counts = { TRAVAIL:0, RP:0, RU:0, TC:0, RN:0, FETE:[] };
  Object.entries(schedule).forEach(([k,v])=>{
    if (!k.startsWith(agentId+"-")) return;
    const date=k.slice(agentId.length+1);
    if (!date.startsWith(String(year))) return;
    const code=v?.equipe||v?.jsCode||"";
    const eq=EQ[code];
    if (!eq) return;
    if (eq.compteur==="TRAVAIL" && code!=="NU") counts.TRAVAIL++;
    else if (eq.compteur==="RP") counts.RP++;
    else if (eq.compteur==="RU") counts.RU++;
    else if (eq.compteur==="TC") counts.TC++;
    else if (eq.compteur==="RN") counts.RN++;
    else if (eq.compteur==="FETE") counts.FETE.push({date,code,label:CODES_FETES[code]||code,paye:v?.fetePaye||false});
  });
  return counts;
}

// ─── AGENTS ──────────────────────────────────────────────────────────────────
const AGENTS_INIT = [
  {id:"P01",nom:"BELLISSENT",      prenom:"Christophe",grade:"CP6NIV2",poste:"CCL",          fam:"PRCI"},
  {id:"P02",nom:"CHAHMI",          prenom:"Rochdi",    grade:"CP6NIV2",poste:"CCL",          fam:"PRCI"},
  {id:"P03",immatriculation:"168401861B",nom:"BEFFARAL",        prenom:"Olivier",   grade:"CP6NIV2",poste:"CCL",          fam:"PRCI"},
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
].map(a => ({ ...a, initials: a.prenom[0] + (a.nom.replace(/[\s-]/g, "")[0] || "") }));

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
  const refs=[useRef(),useRef(),useRef(),useRef()];
  useEffect(()=>{refs[0].current?.focus();},[step]);

  const handleDigit=(i,v,arr,setArr)=>{
    if(!/^\d?$/.test(v))return;
    const next=[...arr];next[i]=v;setArr(next);
    if(v&&i<3)refs[i+1].current?.focus();
    if(!v&&i>0)refs[i-1].current?.focus();
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
      <summary style={{background:COMPTEUR_COLORS.FETE.bg,color:COMPTEUR_COLORS.FETE.text,borderRadius:10,padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer",listStyle:"none"}}>
        🩷 {counts.FETE.length} fête{counts.FETE.length>1?"s":""}
      </summary>
      <div style={{background:"#fff",border:"1px solid #fbcfe8",borderRadius:10,padding:"8px 12px",marginTop:4,display:"flex",flexDirection:"column",gap:6,zIndex:10,position:"relative"}}>
        {counts.FETE.map((f,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}>
            <span style={{fontFamily:"monospace",fontWeight:700,color:"#9d174d"}}>{f.code}</span>
            <span style={{flex:1,color:"#475569"}}>{f.label} · {f.date}</span>
            <label style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
              <input type="checkbox" checked={f.paye||false} onChange={e=>onFetePaye&&onFetePaye(agentId,f.date,f.code,e.target.checked)}/>
              <span style={{fontSize:10,color:"#9d174d"}}>Payée</span>
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
function PersonalView({agent,schedule,weekOffset,setWeekOffset,onImportDP,agentProfiles,setAgentProfiles,pinUnlocked,onRequestPin,onFetePaye,isAdmin}){
  const [showHab,setShowHab]=useState(false);
  const [calView,setCalView]=useState("semaine");
  const [monthOff,setMonthOff]=useState(0);
  const [showQuit,setShowQuit]=useState(false);
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
  const counts=useMemo(()=>computeCompteurs(schedule,agent.id,compteurYear),[schedule,agent.id,compteurYear]);
  const nbHab=Object.keys(profile.habilitations||{}).length;
  const nbValid=Object.values(profile.habilitations||{}).filter(v=>v==="VALIDE").length;
  const postesDetectes=[...new Set(Object.entries(schedule).filter(([k])=>k.startsWith(agent.id+"-")).map(([,v])=>v?.poste||v?.jsCode).filter(Boolean))];

  return(<div style={{display:"flex",flexDirection:"column",gap:18}}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

    {/* Profil */}
    <div style={{background:`linear-gradient(135deg,${fam?.color||"#1e293b"},#334155)`,borderRadius:16,padding:"18px 22px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",color:"#fff"}}>
      <Av initials={agent.initials} size={52} famille={agent.famille}/>
      <div style={{flex:1}}>
        <div style={{fontSize:18,fontWeight:800}}>{agent.prenom} {agent.nom}</div>
        <div style={{fontSize:11,opacity:.65}}>{agent.grade} · {agent.poste} · {fam?.label}</div>
        <div style={{fontSize:10,marginTop:2,opacity:.7}}>{hasPin?"🔐 Planning protégé":"🔓 Aucun PIN"}</div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button onClick={()=>onImportDP(agent)} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>📋 Déroulé Prévisionnel</button>
        <button onClick={()=>setShowDemandeConges(true)} style={{background:"rgba(234,88,12,.3)",border:"1px solid rgba(253,186,116,.5)",color:"#fff",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>📝 Demande congés</button>
        <button onClick={()=>setShowQuit(true)} style={{background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.35)",color:"#fca5a5",borderRadius:9,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>🚪 Quitter</button>
        {!hasPin
          ?<button onClick={()=>onRequestPin("set",agent)} style={{background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.4)",color:"#fff",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>🔐 Créer PIN</button>
          :<>
            {!pinUnlocked&&<button onClick={()=>onRequestPin("verify",agent)} style={{background:"rgba(255,200,0,.2)",border:"1px solid rgba(255,200,0,.5)",color:"#fff",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>🔓 Déverrouiller</button>}
            {pinUnlocked&&<button onClick={()=>onRequestPin("change",agent)} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>🔑 Modifier PIN</button>}
          </>
        }
      </div>
    </div>

    {/* Compteurs */}
    {pinUnlocked&&(<div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:"14px 18px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:11,fontWeight:800,color:"#64748b",letterSpacing:.5}}>📊 COMPTEURS {compteurYear}</div>
        <div style={{display:"flex",gap:4}}>
          {[currentYear-1,currentYear,currentYear+1].map(y=><button key={y} onClick={()=>setCompteurYear(y)} style={{border:`1px solid ${compteurYear===y?"#1e293b":"#e2e8f0"}`,background:compteurYear===y?"#1e293b":"#fff",color:compteurYear===y?"#fff":"#475569",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11,fontWeight:compteurYear===y?700:400}}>{y}</button>)}
        </div>
      </div>
      <CompteursBadges counts={counts} year={compteurYear} onFetePaye={onFetePaye} schedule={schedule} agentId={agent.id}/>
    </div>)}

    {/* Roulement + Réserve */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <div style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,padding:"14px 16px"}}>
        <div style={{fontSize:11,fontWeight:800,color:"#64748b",letterSpacing:.5,marginBottom:8}}>🔄 ROULEMENT</div>
        {ROULEMENTS.map(r=>{const sel=profile.roulement===r;return(
          <button key={r} onClick={()=>setProfile({roulement:sel?null:r})} style={{display:"flex",alignItems:"center",gap:7,border:`1.5px solid ${sel?"#0f4c81":"#e2e8f0"}`,background:sel?"#eff6ff":"#f8fafc",color:sel?"#0f4c81":"#475569",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:sel?700:400,textAlign:"left",width:"100%",marginBottom:4}}>
            <span style={{width:12,height:12,borderRadius:"50%",border:`2px solid ${sel?"#0f4c81":"#cbd5e1"}`,background:sel?"#0f4c81":"transparent",flexShrink:0}}/>{r}
          </button>);})}
      </div>
      <div style={{background:"#fff",border:`1.5px solid ${profile.isReserve?"#10b981":"#e2e8f0"}`,borderRadius:14,padding:"14px 16px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:800,color:"#64748b",letterSpacing:.5}}>🛡️ RÉSERVISTE</div>
          <Toggle value={profile.isReserve||false} onChange={v=>setProfile({isReserve:v})}/>
        </div>
        {profile.isReserve?(<>
          {/* Famille(s) habilitée(s) */}
          {(()=>{
            const detected=detectFamillesReserviste(agent.id,schedule);
            const current=profile.famillesHab||null;
            const suggestion=detected&&!current?detected:null;
            const OPTS=[
              {k:"PRCI",l:"PRCI",     color:"#0f4c81",bg:"#eff6ff",bd:"#bfdbfe"},
              {k:"PAR", l:"PAR",      color:"#065f46",bg:"#f0fdf4",bd:"#bbf7d0"},
              {k:"BOTH",l:"PRCI + PAR",color:"#7c3aed",bg:"#faf5ff",bd:"#e9d5ff"},
            ];
            return <div style={{marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                <div style={{fontSize:10,fontWeight:700,color:"#64748b",letterSpacing:.5}}>FAMILLE(S) HABILITÉE(S)</div>
                {suggestion&&<span style={{fontSize:9,background:"#fef3c7",color:"#92400e",borderRadius:6,padding:"1px 7px",fontWeight:700}}>💡 {suggestion==="BOTH"?"PRCI+PAR":suggestion} détecté</span>}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {OPTS.map(o=>{const sel=current===o.k;const isSug=suggestion===o.k;
                  return <button key={o.k} onClick={()=>setProfile({famillesHab:sel?null:o.k})}
                    style={{border:`2px solid ${sel?o.color:isSug?o.bd:"#e2e8f0"}`,
                      background:sel?o.bg:"#f8fafc",color:sel?o.color:"#475569",
                      borderRadius:9,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:sel?800:500,
                      display:"flex",alignItems:"center",gap:4}}>
                    {sel&&<span>✓</span>}{o.l}{isSug&&!sel&&<span style={{fontSize:8,color:"#ca8a04"}}> ↗</span>}
                  </button>;
                })}
              </div>
              {current&&<div style={{fontSize:9,fontWeight:600,marginTop:4,
                color:current==="PRCI"?"#0f4c81":current==="PAR"?"#065f46":"#7c3aed"}}>
                ✓ {current==="BOTH"?"Habilité(e) PRCI et PAR":current==="PRCI"?"Habilité(e) PRCI uniquement":"Habilité(e) PAR uniquement"}
              </div>}
            </div>;
          })()}
          <div style={{fontSize:11,color:"#475569",marginBottom:7}}>{nbHab===0?"Aucune habilitation":`${nbValid} validée(s) · ${nbHab-nbValid} en cours`}</div>
          {nbHab>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:7}}>
            {Object.entries(profile.habilitations||{}).slice(0,4).map(([code,niv])=>{const n=NIV_HAB.find(x=>x.code===niv);const h=[...HAB_PRCI,...HAB_PAR].find(x=>x.code===code);return h?<span key={code} style={{fontSize:9,background:n?.color,color:n?.textColor,borderRadius:8,padding:"2px 6px",fontWeight:700}}>{h.label}</span>:null;})}
            {nbHab>4&&<span style={{fontSize:9,color:"#94a3b8"}}>+{nbHab-4}</span>}
          </div>}
          <button onClick={()=>setShowHab(true)} style={{width:"100%",background:"#064e3b",color:"#fff",border:"none",borderRadius:8,padding:"7px 0",cursor:"pointer",fontSize:11,fontWeight:700}}>⚙️ Habilitations ({nbHab})</button>
        </>):<div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>Active pour gérer tes habilitations.</div>}
      </div>
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
        {[["semaine","📅 Semaine"],["mois","📆 Mois"]].map(([k,l])=>(
          <button key={k} onClick={()=>setCalView(k)} style={{border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",background:calView===k?"#fff":"transparent",color:calView===k?"#1e293b":"#94a3b8",fontSize:12,fontWeight:calView===k?700:400,boxShadow:calView===k?"0 1px 4px rgba(0,0,0,.08)":"none"}}>
            {l}
          </button>
        ))}
      </div>
      {/* Nav selon la vue */}
      {calView==="semaine"?<>
        <button onClick={()=>setWeekOff(w=>w-1)} style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:13}}>‹</button>
        <span style={{fontSize:12,fontWeight:600,color:"#475569",flex:1,textAlign:"center"}}>{weekDates[0]?.slice(8)}/{weekDates[0]?.slice(5,7)} – {weekDates[6]?.slice(8)}/{weekDates[6]?.slice(5,7)}/{weekDates[6]?.slice(0,4)}</span>
        <button onClick={()=>setWeekOff(w=>w+1)} style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:13}}>›</button>
        {weekOff!==0&&<button onClick={()=>setWeekOff(0)} style={{border:"1.5px solid #6366f1",background:"#eef2ff",color:"#4f46e5",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>Auj.</button>}
      </>:<>
        <button onClick={()=>setMonthOff(m=>m-1)} style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:13}}>‹</button>
        <span style={{fontSize:13,fontWeight:700,color:"#1e293b",flex:1,textAlign:"center"}}>{MOIS_L[curMonth]} {curYear}</span>
        <button onClick={()=>setMonthOff(m=>m+1)} style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:13}}>›</button>
        {monthOff!==0&&<button onClick={()=>setMonthOff(0)} style={{border:"1.5px solid #6366f1",background:"#eef2ff",color:"#4f46e5",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>Auj.</button>}
      </>}
    </div>

    {/* ── VUE SEMAINE ── */}
    {calView==="semaine"&&<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
        {weekDates.map((dk,i)=><DayCard key={dk} dk={dk}/>)}
      </div>
      {/* Remplissage rapide semaine */}
      <div style={{background:"#f8fafc",borderRadius:10,padding:"11px 13px",border:"1px solid #e2e8f0"}}>
        <div style={{fontSize:9,fontWeight:800,color:"#94a3b8",marginBottom:7,letterSpacing:.5}}>⚡ REMPLISSAGE RAPIDE — semaine</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {[{c:"M",l:"Matinée"},{c:"AM",l:"Soirée"},{c:"N",l:"Nuit"},{c:"J",l:"Journée"},{c:"RP",l:"RP"},{c:"RU",l:"RU"},{c:"CP",l:"Congé"}].map(({c,l})=>{
            const eq=EQ_COLORS[c];
            return <button key={c} onClick={()=>weekDates.forEach(dk=>setDay(dk,c))}
              style={{border:`1.5px solid ${eq?.dot}`,background:eq?.bg,color:eq?.tc,borderRadius:14,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>{l}</button>;
          })}
          <button onClick={()=>weekDates.forEach(dk=>setDay(dk,null))} style={{border:"1.5px solid #e2e8f0",background:"#fff",color:"#94a3b8",borderRadius:14,padding:"3px 10px",cursor:"pointer",fontSize:10}}>Effacer</button>
        </div>
      </div>
    </>}

    {/* ── VUE MOIS ── */}
    {calView==="mois"&&<>
      {/* Légende couleurs */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {[{c:"M",l:"Mat."},{c:"AM",l:"Soir."},{c:"N",l:"Nuit"},{c:"J",l:"Jour."},{c:"RP",l:"RP"},{c:"RU",l:"RU"},{c:"CP",l:"Congé"},{c:"ABS",l:"Abs."}].map(({c,l})=>{
          const eq=EQ_COLORS[c];
          return <span key={c} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:9,background:eq?.bg,color:eq?.tc,borderRadius:8,padding:"2px 7px",fontWeight:700}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:eq?.dot}}/>{l}
          </span>;
        })}
      </div>

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
            const isToday=dk===TODAY;
            const dayNum=parseInt(dk.slice(8));
            const dow=new Date(dk).getDay();
            const isWE=dow===0||dow===6;
            let bg=isWE?"#f8fafc":"#fff";
            if(en&&eq){
              if(!eq.prive)bg=eq.bg; // vraie couleur équipe
              else if(code==="RP")bg="#dcfce7";
              else if(code==="RU"||code==="RQ")bg="#fef9c3";
              else bg=eq.bg;
            }
            return <div key={dk} style={{background:bg,border:isToday?"2px solid #6366f1":"1px solid #e2e8f0",borderRadius:8,padding:"4px 5px",minHeight:52,cursor:"pointer",position:"relative",boxShadow:isToday?"0 0 0 2px #eef2ff":"none"}}
              onClick={()=>{
                const codes=["","M","AM","N","J","RP","RU","CP","ABS","FOR"];
                const cur=codes.indexOf(code||"");
                const next=codes[(cur+1)%codes.length];
                setDay(dk,next||null);
              }}>
              <div style={{fontSize:10,fontWeight:isToday?800:600,color:isToday?"#6366f1":isWE?"#94a3b8":"#1e293b",marginBottom:2}}>{dayNum}</div>
              {code&&<div style={{fontSize:8,fontWeight:700,color:eq?.tc,background:eq?.bg,borderRadius:4,padding:"1px 4px",display:"inline-block"}}>{eq?.label?.slice(0,4)}</div>}
              {en?.jsCode&&en.jsCode!==code&&<div style={{fontSize:7,color:"#94a3b8",fontFamily:"monospace",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{en.jsCode}</div>}
            </div>;
          })}
        </div>
      </div>

      {/* Info tap */}
      <div style={{fontSize:10,color:"#94a3b8",textAlign:"center"}}>💡 Clique sur un jour pour faire défiler les statuts</div>

      {/* Remplissage rapide mois */}
      <div style={{background:"#f8fafc",borderRadius:10,padding:"11px 13px",border:"1px solid #e2e8f0"}}>
        <div style={{fontSize:9,fontWeight:800,color:"#94a3b8",marginBottom:7,letterSpacing:.5}}>⚡ REMPLISSAGE RAPIDE — mois entier</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {[{c:"M",l:"Matinée"},{c:"AM",l:"Soirée"},{c:"N",l:"Nuit"},{c:"J",l:"Journée"},{c:"RP",l:"RP"}].map(({c,l})=>{
            const eq=EQ_COLORS[c];
            return <button key={c} onClick={()=>monthDates.forEach(dk=>setDay(dk,c))}
              style={{border:`1.5px solid ${eq?.dot}`,background:eq?.bg,color:eq?.tc,borderRadius:14,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700}}>{l}</button>;
          })}
          <button onClick={()=>monthDates.forEach(dk=>setDay(dk,null))} style={{border:"1.5px solid #e2e8f0",background:"#fff",color:"#94a3b8",borderRadius:14,padding:"3px 10px",cursor:"pointer",fontSize:10}}>Effacer le mois</button>
        </div>
      </div>
    </>}
  </div>;
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
        const res = await fetch("https://api.anthropic.com/v1/messages", {
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
- Décompte : CA=Congé Annuel, RP=Repos Périodique, F=Fête, C=Compensateur, SS=Sans Solde, CS=Congé Spécial, RU=Repos Utilisation.
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
            const typeLabels = {CA:"Congé Annuel",RP:"Repos Périodique",F:"Fête",C:"Compensateur",SS:"Sans Solde",CS:"Congé Spécial",RU:"Repos Utilisation"};
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

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App(){
  const [view,setView]=useState("global");
  const [agents,setAgents]=usePersist("agents",AGENTS_INIT);
  const [currentAgent,setCurrentAgent]=useState(null);
  const [weekOffset,setWeekOffset]=useState(0);
  const [profileOpen,setProfileOpen]=useState(false);
  const [profileSearch,setProfileSearch]=useState("");
  const [schedule,setSchedule]=usePersist("schedule",{});
  const [agentProfiles,setAgentProfiles]=usePersist("agentProfiles",{});
  const [pinModal,setPinModal]=useState(null);
  const [unlockedAgents,setUnlockedAgents]=useState({});
  const [importDPTarget,setImportDPTarget]=useState(null);
  const [addAgentOpen,setAddAgentOpen]=useState(false);
  const [notifications,setNotifications]=usePersist("notifications",[]);
  // ── AUTH ───────────────────────────────────────────────────────────────
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
  useEffect(()=>{
    setSchedule(prev=>cleanOldEntries(prev));
  },[]);

  // Redirection si non connecté
  if(!currentUser) return <LoginPage onLogin={handleLogin} authData={authData} setAuthData={setAuthData}/>;

  const handleImportSchedule=useCallback((agentId,jours)=>{
    setSchedule(prev=>{
      const next={...prev};
      jours.forEach(j=>{
        const existing=next[`${agentId}-${j.date}`];
        // Garder la plus récente si impressionAt renseigné
        if(!existing||!existing.impressionAt||(j.impressionAt&&j.impressionAt>existing.impressionAt)){
          next[`${agentId}-${j.date}`]={equipe:j.equipe,horaires:EQ[j.equipe]?.heures||"",poste:j.jsCode||"",jsCode:j.jsCode||"",prive:j.prive||false,impressionAt:j.impressionAt||null};
        }
      });
      return next;
    });
  },[]);

  const handlePinSuccess=(pin)=>{
    if(!pinModal)return;
    if(pinModal.mode==="set"&&pin){
      // Création PIN
      setAgentProfiles(p=>({...p,[pinModal.agent.id]:{...(p[pinModal.agent.id]||{}),pinHash:pin}}));
      setUnlockedAgents(p=>({...p,[pinModal.agent.id]:true}));
    } else if(pinModal.mode==="change"&&pin){
      // Modification PIN (ancien vérifié dans PinModal)
      setAgentProfiles(p=>({...p,[pinModal.agent.id]:{...(p[pinModal.agent.id]||{}),pinHash:pin}}));
      setUnlockedAgents(p=>({...p,[pinModal.agent.id]:true}));
    } else if(pinModal.mode==="reset"&&pin){
      // Réinitialisation Admin : nouveau PIN défini, agent déverrouillé
      setAgentProfiles(p=>({...p,[pinModal.agent.id]:{...(p[pinModal.agent.id]||{}),pinHash:pin}}));
      setUnlockedAgents(p=>({...p,[pinModal.agent.id]:false})); // Force re-saisie par l'agent
    } else if(pinModal.mode==="verify"){
      setUnlockedAgents(p=>({...p,[pinModal.agent.id]:true}));
    }
    setPinModal(null);
  };

  const handleFetePaye=(agentId,date,code,paye)=>{
    setSchedule(prev=>{const next={...prev};const key=`${agentId}-${date}`;if(next[key])next[key]={...next[key],fetePaye:paye};return next;});
  };

  const pinUnlocked=currentAgent?unlockedAgents[currentAgent.id]||false:false;
  const profils=agents.filter(a=>`${a.prenom} ${a.nom}`.toLowerCase().includes(profileSearch.toLowerCase()));
  const activeNotifCount=notifications.filter(n=>!n.acquitte&&(currentAgent?n.agentId===currentAgent.id:true)).length;

  const VIEWS=[
    {k:"global",l:"🏢 Vue globale"},
    {k:"personal",l:"👤 Mon agenda"},
    {k:"echanges",l:"🔄 Échanges"},
    {k:"cps",l:"📋 CPS"+(activeNotifCount>0?` (${activeNotifCount})`:"")},
  ];

  return(<div style={{minHeight:"100vh",background:"#f1f5f9",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');*{box-sizing:border-box;}button:hover{opacity:.85;}`}</style>

    {/* HEADER */}
    <div style={{background:"#fff",borderBottom:"1.5px solid #e2e8f0",position:"sticky",top:0,zIndex:50}}>
      <div style={{maxWidth:1300,margin:"0 auto",display:"flex",alignItems:"center",gap:10,height:54,padding:"0 16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginRight:4}}>
          <div style={{width:32,height:32,background:"linear-gradient(135deg,#0f4c81,#1e3a5f)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:16}}>🚄</span></div>
          <div><div style={{fontSize:13,fontWeight:800,color:"#0f4c81",letterSpacing:-.3}}>PlanniRail</div><div style={{fontSize:8,color:"#94a3b8",letterSpacing:.8,fontFamily:"monospace"}}>PRCI · PAR</div></div>
        </div>
        <div style={{display:"flex",gap:2,background:"#f1f5f9",borderRadius:10,padding:3}}>
          {VIEWS.map(({k,l})=>(<button key={k} onClick={()=>setView(k)} style={{border:"none",borderRadius:8,padding:"5px 11px",cursor:"pointer",background:view===k?"#fff":"transparent",color:view===k?"#1e293b":"#94a3b8",fontSize:11,fontWeight:view===k?700:400,boxShadow:view===k?"0 1px 4px rgba(0,0,0,.08)":"none",whiteSpace:"nowrap",position:"relative"}}>
            {l}{k==="cps"&&activeNotifCount>0&&<span style={{position:"absolute",top:-3,right:-3,width:8,height:8,borderRadius:"50%",background:"#ef4444"}}/>}
          </button>))}
        </div>
        {isAdmin&&<div style={{background:"#fff8e1",border:"1px solid #fde68a",borderRadius:7,padding:"2px 8px",fontSize:10,fontWeight:700,color:"#92400e"}}>👑 Admin</div>}
        <div style={{flex:1}}/>
        <div style={{position:"relative"}}>
          <button onClick={()=>setProfileOpen(p=>!p)} style={{border:"1.5px solid #e2e8f0",borderRadius:10,padding:"5px 11px",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:7,fontSize:11,color:currentAgent?"#1e293b":"#94a3b8",fontWeight:currentAgent?700:400}}>
            {currentAgent?<Av initials={currentAgent.initials} size={20} famille={currentAgent.famille}/>:<span>👤</span>}
            {currentAgent?`${currentAgent.prenom} ${currentAgent.nom}`:"Mon profil"}
            {pinUnlocked&&<span style={{fontSize:9,color:"#10b981"}}>🔓</span>}
            <span style={{fontSize:9,opacity:.4}}>▼</span>
          </button>
          {profileOpen&&(<div style={{position:"absolute",top:"calc(100% + 6px)",right:0,width:280,background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:14,boxShadow:"0 8px 32px rgba(0,0,0,.12)",zIndex:100,overflow:"hidden"}}>
            <div style={{padding:"8px 10px",borderBottom:"1px solid #f1f5f9"}}><input autoFocus placeholder="Rechercher…" value={profileSearch} onChange={e=>setProfileSearch(e.target.value)} style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:8,padding:"5px 8px",fontSize:12,outline:"none"}}/></div>
            {["PRCI","PAR"].map(fKey=>{const rows=profils.filter(a=>a.famille===fKey);if(!rows.length)return null;return(<div key={fKey}><div style={{padding:"4px 12px",fontSize:9,fontWeight:800,color:"#94a3b8",letterSpacing:.8,background:FAMILLES[fKey].color+"11",borderBottom:"1px solid #f1f5f9"}}>{FAMILLES[fKey].label.toUpperCase()}</div><div style={{maxHeight:155,overflowY:"auto"}}>{rows.map(a=>{const ap=agentProfiles[a.id]||{};return(<button key={a.id} onClick={()=>{
                    if(currentUser&&a.id===currentUser.agent?.id){
                      setCurrentAgent(a);setProfileOpen(false);setProfileSearch("");
                    } else if(isAdmin){
                      setCurrentAgent(a);setProfileOpen(false);setProfileSearch("");
                    } else {
                      setLoginTarget(a);setProfileOpen(false);setProfileSearch("");
                    }
                  }} style={{width:"100%",border:"none",background:currentAgent?.id===a.id?"#eff6ff":"transparent",padding:"6px 11px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,textAlign:"left"}}><Av initials={a.initials} size={22} famille={a.famille}/><div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:"#1e293b"}}>{a.prenom} {a.nom}</div><div style={{fontSize:9,color:"#94a3b8"}}>{a.poste}{ap.pinHash?" · 🔐":""}</div></div>{currentAgent?.id===a.id&&<span style={{color:FAMILLES[fKey].accent,fontSize:12}}>✓</span>}</button>);})}</div></div>);
            })}
          </div>)}
        </div>
      </div>
    </div>

    {/* CONTENU */}
    <div style={{maxWidth:1300,margin:"0 auto",padding:"16px"}}>
      {view==="global"&&<GlobalView agents={agents} schedule={schedule} weekOffset={weekOffset} setWeekOffset={setWeekOffset} onImport={ag=>{setCurrentAgent(ag);setImportDPTarget(ag);}} currentAgent={currentAgent} onAddAgent={()=>setAddAgentOpen(true)} onRemoveAgent={ag=>{if(window.confirm(`Supprimer ${ag.prenom} ${ag.nom} ?`))setAgents(p=>p.filter(a=>a.id!==ag.id));}} isAdmin={isAdmin}/>}
      {view==="personal"&&<PersonalView agent={currentAgent} schedule={schedule} weekOffset={weekOffset} setWeekOffset={setWeekOffset} onImportDP={setImportDPTarget} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles} pinUnlocked={pinUnlocked} onRequestPin={(mode,ag)=>setPinModal({mode,agent:ag||currentAgent})} onFetePaye={handleFetePaye} isAdmin={isAdmin}/>}
      {view==="echanges"&&<EchangesView agents={agents} schedule={schedule} currentAgent={currentAgent} agentProfiles={agentProfiles} setAgentProfiles={setAgentProfiles}/>}
      {view==="cps"&&<CpsView agents={agents} schedule={schedule} setSchedule={setSchedule} notifications={notifications} setNotifications={setNotifications}/>}
    </div>

    {pinModal&&<PinModal agent={pinModal.agent} mode={pinModal.mode} currentPin={agentProfiles[pinModal.agent?.id]?.pinHash} onSuccess={handlePinSuccess} onClose={()=>setPinModal(null)}/>}
    {importDPTarget&&<ImportDeroulement agent={importDPTarget} onClose={()=>setImportDPTarget(null)} onImport={jours=>handleImportSchedule(importDPTarget.id,jours)}/>}
    {addAgentOpen&&<AddAgentModal onClose={()=>setAddAgentOpen(false)} onAdd={ag=>{setAgents(p=>[...p,ag]);}}/>}
    {profileOpen&&<div onClick={()=>setProfileOpen(false)} style={{position:"fixed",inset:0,zIndex:49}}/>}
    {showAuthAdmin&&<AdminAuthPanel authData={authData} setAuthData={setAuthData} agents={agents} onClose={()=>setShowAuthAdmin(false)}/>}
  </div>);
}{isAdmin&&<div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{background:"#fff8e1",border:"1px solid #fde68a",borderRadius:6,padding:"2px 7px",fontSize:9,fontWeight:700,color:"#92400e"}}>👑 Admin</div>
          <button onClick={()=>setShowAuthAdmin(true)} style={{background:"#f5f3ff",border:"1px solid #c4b5fd",borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700,color:"#7c3aed",cursor:"pointer"}}>⚙️ Comptes</button>
        </div>}
        <div style={{flex:1}}/>

        {/* Déconnexion */}
        <button onClick={handleLogout} title="Se déconnecter" style={{border:"1.5px solid #fee2e2",borderRadius:9,padding:"5px 10px",background:"#fff",cursor:"pointer",fontSize:11,color:"#ef4444",fontWeight:600}}>
          🚪 Déco.
        </button>
        {/* Sélecteur profil */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setProfileOpen(p=>!p)} style={{border:"1.5px solid #e2e8f0",borderRadius:9,padding:"5px 10px",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:11,color:currentAgent?"#1e293b":"#94a3b8",fontWeight:currentAgent?700:400}}>
            {currentAgent?<Av ini={currentAgent.ini} size={18} fam={currentAgent.fam}/>:<span>👤</span>}
            {currentAgent?`${currentAgent.prenom} ${currentAgent.nom}`:"Mon profil"}
            <span style={{fontSize:9,opacity:.4}}>▼</span>
          </button>
          {profileOpen&&<div style={{position:"absolute",top:"calc(100% + 5px)",right:0,width:260,background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:13,boxShadow:"0 8px 30px rgba(0,0,0,.12)",zIndex:100,overflow:"hidden"}}>
            <div style={{padding:"8px 10px",borderBottom:"1px solid #f1f5f9"}}>
              <input autoFocus placeholder="Rechercher…" value={profileSearch} onChange={e=>setProfileSearch(e.target.value)}
                style={{width:"100%",border:"1.5px solid #e2e8f0",borderRadius:7,padding:"5px 8px",fontSize:11,outline:"none"}}/>
            </div>
            {["PRCI","PAR"].map(fKey=>{
              const rows=profils.filter(a=>a.fam===fKey);if(!rows.length)return null;
              return <div key={fKey}>
                <div style={{padding:"4px 11px",fontSize:8,fontWeight:800,color:"#94a3b8",letterSpacing:.8,background:FAM[fKey].color+"11",borderBottom:"1px solid #f1f5f9"}}>{FAM[fKey].label.toUpperCase()}</div>
                <div style={{maxHeight:150,overflowY:"auto"}}>
                  {rows.map(a=><button key={a.id} onClick={()=>{
                    if(currentUser&&a.id===currentUser.agent?.id){
                      setCurrentAgent(a);setProfileOpen(false);setProfileSearch("");
                    } else if(isAdmin){
                      setCurrentAgent(a);setProfileOpen(false);setProfileSearch("");
                    } else {
                      setLoginTarget(a);setProfileOpen(false);setProfileSearch("");
                    }
                  }} style={{width:"100%",border:"none",background:currentAgent?.id===a.id?"#eff6ff":"transparent",padding:"6px 11px",cursor:"pointer",display:"flex",alignItems:"center",gap:7,textAlign:"left"}}>
                    <Av ini={a.ini} size={22} fam={a.fam}/>
                    <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:"#1e293b"}}>{a.prenom} {a.nom}</div><div style={{fontSize:9,color:"#94a3b8"}}>{a.poste}</div></div>
                    {currentAgent?.id===a.id&&<span style={{color:FAM[fKey].accent,fontSize:11}}>✓</span>}
                  </button>)}
                </div>
              </div>;
            })}
          </div>}
        </div>
      </div>
    </div>

    {/* CONTENU */}
    <div style={{maxWidth:1100,margin:"0 auto",padding:"14px"}}>
      {view==="global"&&<GlobalView agents={agents} schedule={schedule} setSchedule={setSchedule} currentAgent={currentAgent} weekOff={weekOff} setWeekOff={setWeekOff}
          onDeleteSchedule={(ag)=>{
            if(window.confirm(`Supprimer tout le planning de ${ag.prenom} ${ag.nom} ?

Cette action libère sa place (1/90). Son profil reste dans la liste.`)){
              setSchedule(prev=>{const next={...prev};Object.keys(next).filter(k=>k.startsWith(ag.id+"-")).forEach(k=>delete next[k]);return next;});
              setDepartDates(prev=>({...prev,[ag.id]:TODAY}));
            }
          }}
        />}
      {view==="personal"&&<PersonalView agent={currentAgent} schedule={schedule} setSchedule={setSchedule} weekOff={weekOff} setWeekOff={setWeekOff}
          onDepart={(id)=>setDepartDates(prev=>({...prev,[id]:TODAY}))}
          departDates={departDates}/>}
    </div>

    {profileOpen&&<div onClick={()=>setProfileOpen(false)} style={{position:"fixed",inset:0,zIndex:49}}/>}
  </div>;
}

    {showHab&&<HabilitationsModal agent={agent} habilitations={profile.habilitations||{}} suggestedPostes={postesDetectes} onSave={hab=>{setProfile({habilitations:hab});setShowHab(false);}} onClose={()=>setShowHab(false)}/>}
  </div>);
}

// ─── ONGLET CPS ───────────────────────────────────────────────────────────────
function CpsView({agents, schedule, setSchedule, notifications, setNotifications}){
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
        const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
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
      "equipe": "M|AM|N|J",
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

  const acquitter=(id)=>setNotifications(prev=>prev.map(n=>n.id===id?{...n,acquitte:true}:n));
  const activeNotifs=notifications.filter(n=>!n.acquitte);

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
  const [step,setStep]=useState("choice");
  const [aiResult,setAiResult]=useState(null);
  const [error,setError]=useState("");
  const [manualYear,setManualYear]=useState(new Date().getFullYear());
  const [manualMonth,setManualMonth]=useState(new Date().getMonth());
  const [manualDays,setManualDays]=useState({});
  const fam=FAMILLES[agent.famille];

  const allCodes=[
    ...POSTES_PRCI_3x8.flatMap(p=>[{c:p.M,l:`${p.label} M`},{c:p.AM,l:`${p.label} AM`},{c:p.N,l:`${p.label} N`}].filter(x=>x.c)),
    ...POSTES_PAR_3x8.flatMap(p=>[{c:p.M,l:`${p.label} M`},{c:p.AM,l:`${p.label} AM`},{c:p.N,l:`${p.label} N`}].filter(x=>x.c)),
    {c:"RP",l:"RP"},{c:"RU",l:"RU"},{c:"RQ",l:"RQ"},{c:"CP",l:"Congé"},{c:"FOR",l:"Formation"},{c:"ABS",l:"Absent"},
    {c:"FERIE",l:"Férié"},{c:"NU",l:"NU"},{c:"DISPO",l:"Dispo"},
    ...Object.keys(CODES_FETES).map(k=>({c:k,l:CODES_FETES[k]})),
  ];

  const callAI=async(content)=>{
    setStep("loading");
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:4000,messages:[{role:"user",content:[...content,{type:"text",
          text:`Tu analyses un Déroulé Prévisionnel SNCF pour ${agent.prenom} ${agent.nom}.
Extrais TOUTES les affectations jour par jour pour chaque mois visible.
Retourne UNIQUEMENT un JSON valide sans markdown :
{"agent":"NOM PRENOM","annee":2026,"jours":[{"date":"YYYY-MM-DD","jsCode":"PICCL-","equipe":"M","prive":false,"impressionAt":"YYYY-MM-DD HH:MM"}]}
Règles : code finit par - → M, O → AM, X → N. Codes RP/RU/RQ/CP/FOR/ABS/FERIE/NU/F1..F0/VN → prive:true.
Si le document a une date et heure d'impression, utilise-la pour impressionAt.`}]}]})});
      const data=await res.json();
      const raw=data.content?.map(c=>c.text||"").join("")||"";
      const parsed=JSON.parse(raw.replace(/```json|```/g,"").trim());
      setAiResult(parsed);setStep("result");
    }catch(e){setError("Erreur : "+e.message);setStep("result");}
  };

  const handleFile=async(e,isPdf)=>{
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=async()=>{
      const b64=reader.result.split(",")[1];const mt=isPdf?"application/pdf":file.type;
      await callAI([isPdf?{type:"document",source:{type:"base64",media_type:mt,data:b64}}:{type:"image",source:{type:"base64",media_type:mt,data:b64}}]);
    };
    reader.readAsDataURL(file);
  };

  const daysInMonth=new Date(manualYear,manualMonth+1,0).getDate();

  return(<div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.65)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:560,maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,.25)",overflow:"hidden"}}>
      <div style={{background:`linear-gradient(135deg,${fam?.color||"#1e293b"},#334155)`,padding:"16px 20px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        <Av initials={agent.initials} size={38} famille={agent.famille}/>
        <div style={{flex:1}}><div style={{color:"#fff",fontSize:14,fontWeight:700}}>Déroulé Prévisionnel · {agent.prenom} {agent.nom}</div></div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:8,width:28,height:28,cursor:"pointer",fontSize:14}}>✕</button>
      </div>
      <div style={{overflowY:"auto",flex:1,padding:20}}>
        {step==="choice"&&(<div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[{icon:"📷",label:"Photo du Déroulé",sub:"L'IA lit le document photographié",go:"photo"},{icon:"📄",label:"PDF",sub:"Upload PDF — extraction automatique",go:"pdf"},{icon:"✏️",label:"Saisie manuelle",sub:"Mois par mois",go:"manual"}].map(o=>(
            <button key={o.go} onClick={()=>setStep(o.go)} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 15px",border:"1.5px solid #e2e8f0",borderRadius:12,background:"#f8fafc",cursor:"pointer",textAlign:"left"}}>
              <span style={{fontSize:22}}>{o.icon}</span><div><div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{o.label}</div><div style={{fontSize:11,color:"#94a3b8"}}>{o.sub}</div></div>
            </button>))}
          <div style={{background:"#f0fdf4",borderRadius:10,padding:"9px 12px",fontSize:11,color:"#065f46"}}>💡 Journées travail = visibles par tous · RP/RU/Congés = protégés par PIN</div>
        </div>)}

        {(step==="photo"||step==="pdf")&&(<div style={{display:"flex",flexDirection:"column",gap:14,alignItems:"center"}}>
          <label style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,border:"2px dashed #cbd5e1",borderRadius:14,padding:"22px 28px",cursor:"pointer",background:"#f8fafc",width:"100%",boxSizing:"border-box"}}>
            <span style={{fontSize:30}}>{step==="photo"?"📸":"⬆️"}</span>
            <span style={{fontSize:13,fontWeight:600,color:"#475569"}}>{step==="photo"?"Photo ou image":"PDF"}</span>
            <input type="file" accept={step==="pdf"?".pdf":"image/*"} capture={step==="photo"?"environment":undefined} style={{display:"none"}} onChange={e=>handleFile(e,step==="pdf")}/>
          </label>
          <button onClick={()=>setStep("choice")} style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:13}}>← Retour</button>
        </div>)}

        {step==="loading"&&(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"32px 0"}}>
          <div style={{width:44,height:44,border:"4px solid #e2e8f0",borderTopColor:fam?.accent||"#3b82f6",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
          <p style={{fontSize:13,color:"#475569",textAlign:"center",margin:0}}>Extraction de tous les jours du planning…</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>)}

        {step==="result"&&(<div style={{display:"flex",flexDirection:"column",gap:12}}>
          {error?<div style={{background:"#fee2e2",borderRadius:10,padding:12,color:"#991b1b",fontSize:13}}>{error}</div>
          :aiResult?(<>
            <div style={{background:"#d1fae5",borderRadius:10,padding:11,color:"#065f46",fontSize:13,fontWeight:600}}>✅ {aiResult.jours?.length} jours extraits</div>
            <div style={{background:"#f8fafc",borderRadius:10,padding:11,fontSize:12,color:"#475569"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span>🟡 Travail : <strong>{aiResult.jours?.filter(j=>!j.prive).length}</strong></span>
                <span>🔒 Privé : <strong>{aiResult.jours?.filter(j=>j.prive).length}</strong></span>
              </div>
              <div style={{maxHeight:150,overflowY:"auto",display:"flex",flexWrap:"wrap",gap:4}}>
                {aiResult.jours?.slice(0,24).map((j,i)=>{const e=EQ[j.equipe];return(<span key={i} style={{fontSize:9,background:e?.color||"#f1f5f9",color:e?.textColor||"#475569",borderRadius:5,padding:"1px 5px",fontFamily:"monospace"}}>{j.date.slice(5)} {j.jsCode}</span>);})}
              </div>
            </div>
            <button onClick={()=>{onImport(aiResult.jours);onClose();}} style={{background:"#1e293b",color:"#fff",border:"none",borderRadius:10,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:700}}>✓ Importer {aiResult.jours?.length} jours</button>
          </>):null}
          <button onClick={()=>setStep("choice")} style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:13}}>← Retour</button>
        </div>)}

        {step==="manual"&&(<div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",gap:8}}>
            <select value={manualYear} onChange={e=>setManualYear(Number(e.target.value))} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"6px 9px",fontSize:13,outline:"none"}}>
              {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
            </select>
            <select value={manualMonth} onChange={e=>setManualMonth(Number(e.target.value))} style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"6px 9px",fontSize:13,outline:"none",flex:1}}>
              {MOIS_L.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
            {DAYS_S.map(d=><div key={d} style={{textAlign:"center",fontSize:9,fontWeight:700,color:"#94a3b8",padding:"3px 0"}}>{d}</div>)}
            {Array.from({length:(new Date(manualYear,manualMonth,1).getDay()||7)-1},(_,i)=><div key={`e${i}`}/>)}
            {Array.from({length:daysInMonth},(_,i)=>{
              const d=i+1;const code=manualDays[d];const e=code?EQ[DP_MAP[code]||code]:null;
              return(<div key={d} onClick={()=>{const codes=allCodes.map(x=>x.c);const cur=codes.indexOf(code);setManualDays(p=>({...p,[d]:allCodes[(cur+1)%allCodes.length].c}));}} style={{background:e?.color||"#f8fafc",border:"1px solid rgba(0,0,0,.06)",borderRadius:5,padding:"3px 2px",textAlign:"center",cursor:"pointer",userSelect:"none"}}>
                <div style={{fontSize:10,fontWeight:700,color:e?.textColor||"#64748b"}}>{d}</div>
                <div style={{fontSize:7,color:e?.textColor||"#94a3b8",fontFamily:"monospace",overflow:"hidden",whiteSpace:"nowrap"}}>{code||""}</div>
              </div>);
            })}
          </div>
          <p style={{fontSize:10,color:"#94a3b8",margin:0}}>Clique sur un jour pour faire défiler les codes.</p>
          <button onClick={()=>{
            const jours=Object.entries(manualDays).map(([d,jsCode])=>{const eq=DP_MAP[jsCode]||jsCode;const prive=["RP","RU","RQ","TC","RN","CP","FOR","ABS","FERIE","NU",...Object.keys(CODES_FETES)].includes(eq);return{date:dKey(manualYear,manualMonth+1,parseInt(d)),jsCode,equipe:eq,prive};}).filter(j=>j.jsCode);
            onImport(jours);onClose();
          }} style={{background:"#1e293b",color:"#fff",border:"none",borderRadius:10,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:700}}>✓ Enregistrer {Object.keys(manualDays).length} jours</button>
          <button onClick={()=>setStep("choice")} style={{border:"none",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:13}}>← Retour</button>
        </div>)}
      </div>
    </div>
  </div>);
}

// ─── HABILITATIONS ────────────────────────────────────────────────────────────
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
      try{const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,messages:[{role:"user",content:[isPdf?{type:"document",source:{type:"base64",media_type:mt,data:b64}}:{type:"image",source:{type:"base64",media_type:mt,data:b64}},{type:"text",text:`Extrais les infos agent. Retourne UNIQUEMENT JSON: {"prenom":"...","nom":"...","grade":"...","poste":"...","famille":"PRCI ou PAR"}`}]}]})});
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
// Matricules admin par défaut (à personnaliser)
const ADMIN_MATRICULES_DEFAULT = ["168401861B"]; // BEFFARAL Olivier — premier admin

// Hash simple pour PIN (en prod utiliser bcrypt via Supabase Edge Function)
function hashPin(matricule, pin) {
  // Combine matricule + pin pour un hash unique par agent
  const str = `${matricule}-${pin}-f2ppmp2026`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).padStart(8, '0');
}

// Trouver un agent par matricule dans AGENTS_INIT
function findAgentByMatricule(matricule) {
  return AGENTS_INIT.find(a =>
    a.immatriculation === matricule ||
    a.immatriculation?.toUpperCase() === matricule?.toUpperCase()
  );
}

// Page de connexion
function LoginPage({ onLogin, authData, setAuthData }) {
  const [step, setStep] = useState("login"); // "login" | "first_time" | "forgot"
  const [matricule, setMatricule] = useState("");
  const [pin, setPin] = useState(["","","","",""]);
  const [pinConfirm, setPinConfirm] = useState(["","","","",""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pinRefs = [useRef(),useRef(),useRef(),useRef(),useRef()];
  const confRefs = [useRef(),useRef(),useRef(),useRef(),useRef()];

  const pinStr = pin.join("");
  const confStr = pinConfirm.join("");

  const handlePinDigit = (i, v, arr, setArr, refs) => {
    if (!/^\d?$/.test(v)) return;
    const next = [...arr]; next[i] = v; setArr(next);
    if (v && i < 4) refs[i+1].current?.focus();
    if (!v && i > 0) refs[i-1].current?.focus();
  };

  const handleLogin = () => {
    setError("");
    setLoading(true);
    setTimeout(() => {
      const mat = matricule.trim().toUpperCase();
      // Vérifier que le matricule existe dans la liste
      const agent = AGENTS_INIT.find(a =>
        a.immatriculation?.toUpperCase() === mat
      );
      if (!agent) {
        setError("Matricule non reconnu. Vérifiez votre saisie ou contactez l'administrateur.");
        setLoading(false); return;
      }
      const stored = authData[mat];
      if (!stored || !stored.pinHash) {
        // Première connexion
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
    if (pinStr.length < 5) { setError("5 chiffres requis"); return; }
    if (pinStr !== confStr) { setError("Les codes ne correspondent pas"); return; }
    const mat = matricule.trim().toUpperCase();
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
        {[0,1,2,3,4].map(i=>(
          <input key={i} ref={refs[i]} type="password" inputMode="numeric" maxLength={1}
            value={arr[i]}
            onChange={e=>handlePinDigit(i,e.target.value,arr,setArr,refs)}
            onKeyDown={e=>{
              if(e.key==="Enter"&&arr.every(d=>d)) step==="login"?handleLogin():step==="first_time"&&confStr.length===5?handleFirstTime():setStep("confirm");
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
              <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>Entre ton matricule et ton code PIN</div>
            </div>

            <div>
              <label style={{fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:6,letterSpacing:.5}}>MATRICULE S.N.C.F.</label>
              <input value={matricule} onChange={e=>{setMatricule(e.target.value.toUpperCase());setError("");}}
                placeholder="Ex: 168401861B"
                onKeyDown={e=>e.key==="Enter"&&pinRefs[0].current?.focus()}
                style={{width:"100%",border:"2px solid #e2e8f0",borderRadius:10,padding:"11px 14px",fontSize:14,fontFamily:"'DM Mono',monospace",fontWeight:700,outline:"none",letterSpacing:2,textAlign:"center",boxSizing:"border-box"}}/>
            </div>

            <PinInput arr={pin} setArr={setPin} refs={pinRefs} label="CODE PIN (5 chiffres)"/>

            {error && <div style={{background:"#fee2e2",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#991b1b",fontWeight:600,textAlign:"center"}}>{error}</div>}

            <button onClick={handleLogin} disabled={!matricule||pinStr.length<5||loading}
              style={{background:matricule&&pinStr.length===5?"#0f4c81":"#e2e8f0",color:matricule&&pinStr.length===5?"#fff":"#94a3b8",border:"none",borderRadius:12,padding:"14px 0",cursor:matricule&&pinStr.length===5?"pointer":"not-allowed",fontSize:14,fontWeight:800,transition:"all .15s"}}>
              {loading?"Connexion…":"Se connecter →"}
            </button>

            <div style={{textAlign:"center",fontSize:11,color:"#94a3b8"}}>
              Première connexion ? Entre ton matricule et ton PIN sera créé.
            </div>
          </>}

          {/* PREMIÈRE CONNEXION */}
          {step === "first_time" && <>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:16,fontWeight:800,color:"#1e293b"}}>Première connexion</div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>Matricule : <strong style={{color:"#0f4c81",fontFamily:"monospace"}}>{matricule}</strong></div>
              {AGENTS_INIT.find(a=>a.immatriculation?.toUpperCase()===matricule.trim().toUpperCase())&&(
                <div style={{fontSize:12,color:"#065f46",marginTop:4,fontWeight:600}}>
                  ✓ {AGENTS_INIT.find(a=>a.immatriculation?.toUpperCase()===matricule.trim().toUpperCase())?.prenom} {AGENTS_INIT.find(a=>a.immatriculation?.toUpperCase()===matricule.trim().toUpperCase())?.nom}
                </div>
              )}
            </div>

            <div style={{background:"#eff6ff",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#1e40af"}}>
              🔐 Choisis un code PIN à <strong>5 chiffres</strong>. Il protégera ton planning personnel (RP, congés…). Note-le quelque part.
            </div>

            <PinInput arr={pin} setArr={setPin} refs={pinRefs} label="NOUVEAU CODE PIN"/>
            <PinInput arr={pinConfirm} setArr={setPinConfirm} refs={confRefs} label="CONFIRME TON CODE PIN"/>

            {error && <div style={{background:"#fee2e2",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#991b1b",fontWeight:600,textAlign:"center"}}>{error}</div>}

            <button onClick={handleFirstTime} disabled={pinStr.length<5||confStr.length<5}
              style={{background:pinStr.length===5&&confStr.length===5?"#065f46":"#e2e8f0",color:pinStr.length===5&&confStr.length===5?"#fff":"#94a3b8",border:"none",borderRadius:12,padding:"14px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>
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
export default App; 
