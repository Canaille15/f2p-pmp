// ─── RemplissageMasseView.jsx ──────────────────────────────────────────────
// Module "Remplissage rapide" (24/08, demandé par Olivier).
// Étape 1 (livrée) : postes de travail, en bloc autonome.
// Étape 2 (24/08, même jour) : RP, RU et Congés (Accordé/Demandé/Refusé)
// ajoutés au même sélecteur -- "j'aimerais que ce module puisse gerer la
// saisie des poste de travail. et aussi des rp, RU [...] tout au meme
// endroit". RP/RU réutilisent tel quel l'endpoint bulk-fill déjà construit
// (juste un code_equipe fixe, sans poste). Congés est structurellement à
// part : "Demandé"/"Refusé" n'écrivent JAMAIS dans le planning perso (même
// principe que le popup de saisie normal, DayEditPopup/onCongeStatutChange)
// -- seul "Accordé" écrit dans le planning, et l'ÉCRASE volontairement
// (règle déjà établie pour Congés partout ailleurs dans l'appli), d'où le
// paramètre overwrite:true réservé à ce seul cas dans tout ce module.
//
// Étape 3 (25/08, même jour, corrigée en 2 temps après retour terrain) :
// modèle "panier" -- un agent peut passer de Poste de travail à RP, RU ou
// Congés autant de fois qu'il veut, chaque changement met simplement de
// côté (jamais d'écriture serveur) la sélection en cours, et un seul bouton
// final "✅ Tout remplir" écrit tout le lot en une action. Demande d'origine :
// "en saisie multiple [...] pouvoir passer des saisies de poste de travail
// à rp ru ou congés et de faire remplir à la fin". Un premier essai
// (chaque type validé immédiatement au changement) s'est révélé incomplet
// -- ne couvrait que l'intention côté vitesse d'un seul type, pas le vrai
// besoin d'accumuler across les 4 boutons avant de valider une seule fois.
//
// Deux besoins distincts, dans la même fenêtre :
//  A) Remplir plusieurs jours d'un coup — un agent choisit un type de
//     journée (Poste de travail / RP / RU / Congés) puis coche tous les
//     jours concernés sur l'année, même dispersés (même mini-calendrier que
//     RP/RU, copié à l'identique plutôt que factoré, pour ne courir aucun
//     risque sur ces modules déjà éprouvés).
//  B) Effacer le planning sur une période — pour pouvoir recommencer une
//     année déjà partiellement saisie sans que le remplissage en masse ne
//     bute sur des jours déjà occupés. Toujours réversible (sauvegarde
//     complète côté serveur avant suppression, comme l'annulation du dernier
//     import CPS Officiel déjà éprouvée sur ce projet).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import api, { convertirCodePosteVersJsCode } from "../api/client";
import { getPostesPourAgent, HORAIRES_DEFAUT, HORAIRES_POSTE } from "./DayEditPopup";

const VACATIONS = [
  { code:"M",  label:"Matinée" },
  { code:"AM", label:"Soirée" },
  { code:"N",  label:"Nuit" },
  { code:"J",  label:"Journée" },
];

const TYPES_JOURNEE = [
  { code:"poste",  label:"Poste de travail" },
  { code:"rp",     label:"RP" },
  { code:"ru",     label:"RU" },
  { code:"conges", label:"Congés" },
];

const CONGES_STATUTS = [
  { code:"accorde", label:"✓ Accordé" },
  { code:"demande", label:"⏳ Demandé" },
  { code:"refuse",  label:"✕ Refusé" },
];

const MOIS_L = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

// Liseré coloré sur les jours grisés (25/08, demandé par Olivier : "les
// journee grisé pourrais avoir un liseré colore autour de la case. avec la
// couleur par defaut du type de journee deja saisie ou selon le couleur
// personnalisé par l'agent") -- copie DÉLIBÉRÉE (pas un import) de
// App.jsx/DEFAULT_COLORS : App.jsx importe déjà ce module (RemplissageMasseView),
// un import inverse créerait une dépendance circulaire entre les deux fichiers
// -- exactement le bug déjà rencontré sur ce projet le 21/08 (FimPdfView.jsx,
// "Cannot access 'X' before initialization"). La couleur personnalisée de
// l'agent (agentProfiles[agCp]?.agentColors), elle, est déjà disponible sans
// risque : agentProfiles est déjà une prop de ce composant.
const DEFAULT_COLORS = {
  M:"#ff0000", AM:"#ff0000", N:"#ff0000", J:"#ff0000", JF:"#ff82e8",
  RP:"#16a34a", RPP:"#67bf15", RU:"#ffde08", RQ:"#ff00aa", TC:"#7c3aed", TY:"#a855f7", RN:"#4338ca",
  NU:"#64748b", CA:"#f5e900", CP:"#f5e900",
  MA:"#dc2626", ABS:"#b91c1c", VT:"#f59e0b", VM:"#6b7280",
  FOR:"#0dcbff", DISPO:"#059669", NOTE:"#0080ff", GREVE:"#1d51a5",
};

function joursDuMois(year, monthNum) {
  return new Date(year, monthNum, 0).getDate();
}
function offsetLundi(year, monthNum) {
  const dow = new Date(year, monthNum-1, 1).getDay();
  return dow===0 ? 6 : dow-1;
}
function fmtDateCourt(dk) {
  return new Date(dk+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"2-digit",month:"short",year:"numeric"});
}

export default function RemplissageMasseModal({ agent, agentProfiles, setAgentProfiles, schedule, setSchedule, onClose }) {
  const agCp = agent?.immatriculation || agent?.cp || agent?.id;

  // ── Section A : remplissage en masse ──────────────────────────────────
  // 25/08 (Olivier, précisé après un premier essai "aussi rapide que
  // maintenant" jugé insuffisant) : "ce que je t'avais demandé c'etait
  // justement en saisie multiple de pouvoir passe des saisie des poste de
  // travail a rp ru ou conges et de faire remplir a la fin" -- confirmé
  // valable pour les 4 boutons, pas seulement à l'intérieur de "Poste de
  // travail". Vrai modèle "panier" : chaque changement de type/vacation/
  // poste/statut congés met de côté (sans écrire en base) la sélection en
  // cours dans `panier`, et un seul bouton final "✅ Tout remplir" écrit
  // tout le lot en une seule action utilisateur -- plus aucune écriture
  // intermédiaire au fil des changements.
  const [typeJournee, setTypeJournee] = useState("poste");
  const [vacation, setVacation] = useState("M");
  const [posteCode, setPosteCode] = useState("");
  const [congeStatut, setCongeStatut] = useState("");
  const postesDispo = getPostesPourAgent(agent, agentProfiles, vacation);

  const [miniMonth, setMiniMonth] = useState(()=>{
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  });
  const [joursSelect, setJoursSelect] = useState([]);
  const [fillBusy, setFillBusy] = useState(false);
  const [fillMsg, setFillMsg] = useState(null); // {ok:bool, text}
  // Le lot en attente : une entrée par vague mise de côté (type + config +
  // dates), jamais encore écrite en base -- purement local tant que
  // "✅ Tout remplir" n'a pas été cliqué.
  const [panier, setPanier] = useState([]); // [{id,type,label,dates,write}]
  // Historique des vagues réellement écrites cette session (après un "Tout
  // remplir" réussi) -- rappel visuel de ce qui est déjà en base, distinct
  // du panier (encore en attente).
  const [sessionWaves, setSessionWaves] = useState([]);

  // Construit l'entrée correspondant à la sélection EN COURS (jamais celle
  // déjà dans le panier) -- retourne null si rien à mettre de côté.
  const construireEntreeCourante = () => {
    if (joursSelect.length===0) return null;
    const id = Date.now()+Math.random();
    const dates = [...joursSelect];
    if (typeJournee==="poste") {
      if (!posteCode) return null;
      const jsCode = convertirCodePosteVersJsCode(posteCode, vacation);
      const horaires = (jsCode && HORAIRES_POSTE[jsCode]) || HORAIRES_DEFAUT[vacation] || null;
      const label = `${VACATIONS.find(v=>v.code===vacation)?.label||vacation} · ${postesDispo.find(p=>p.code===posteCode)?.label||posteCode}`;
      return { id, type:"poste", label, dates, write:{ kind:"planning", codeEquipe:vacation, codePoste:posteCode, jsCode, horaires, overwrite:false } };
    }
    if (typeJournee==="rp") return { id, type:"rp", label:"RP", dates, write:{ kind:"planning", codeEquipe:"RP", codePoste:null, jsCode:null, horaires:null, overwrite:false } };
    if (typeJournee==="ru") return { id, type:"ru", label:"RU", dates, write:{ kind:"planning", codeEquipe:"RU", codePoste:null, jsCode:null, horaires:null, overwrite:false } };
    // conges
    if (!congeStatut) return null;
    if (congeStatut==="accorde") return { id, type:"conges", label:"Congés (Accordé)", dates, write:{ kind:"planning", codeEquipe:"CA", codePoste:null, jsCode:null, horaires:null, overwrite:true } };
    return { id, type:"conges", label:`Congés (${congeStatut==="demande"?"Demandé":"Refusé"})`, dates, write:{ kind:"conges", statut:congeStatut } };
  };

  // Met de côté la sélection en cours dans le panier (aucune écriture
  // réseau) et vide la sélection -- appelé automatiquement à chaque
  // changement de type/vacation/poste/statut, jamais besoin d'y penser.
  const ajouterAuLot = () => {
    const entree = construireEntreeCourante();
    if (!entree) return;
    setPanier(prev => [...prev, entree]);
    setJoursSelect([]); setFillMsg(null);
  };
  const retirerDuLot = (id) => setPanier(prev => prev.filter(e=>e.id!==id));

  const changerType = (t) => {
    if (fillBusy) return;
    ajouterAuLot();
    setTypeJournee(t); setPosteCode(""); setCongeStatut(""); setJoursSelect([]); setFillMsg(null);
  };
  const choisirVacation = (code) => {
    if (fillBusy) return;
    if (code!==vacation) ajouterAuLot();
    setVacation(code); setPosteCode("");
  };
  const choisirPoste = (code) => {
    if (fillBusy) return;
    const nouveau = posteCode===code ? "" : code;
    if (nouveau!==posteCode) ajouterAuLot();
    setPosteCode(nouveau);
  };
  const choisirCongeStatut = (code) => {
    if (fillBusy) return;
    const nouveau = congeStatut===code ? "" : code;
    if (nouveau!==congeStatut) ajouterAuLot();
    setCongeStatut(nouveau);
  };

  const [miniYear, miniMonthNum] = miniMonth.split("-").map(Number);
  const miniDaysInMonth = joursDuMois(miniYear, miniMonthNum);
  const miniOffset = offsetLundi(miniYear, miniMonthNum);
  const changerMiniMois = (delta) => {
    let m = miniMonthNum + delta, y = miniYear;
    if (m<1) { m=12; y--; } else if (m>12) { m=1; y++; }
    setMiniMonth(`${y}-${String(m).padStart(2,"0")}`);
  };

  // Congés : aucun des 3 statuts (Accordé/Demandé/Refusé) ne suit la règle
  // habituelle "on saute les jours déjà occupés" -- Accordé écrase toujours
  // volontairement (règle déjà établie ailleurs dans l'appli pour Congés),
  // Demandé/Refusé ne touchent jamais au planning donc le contenu existant
  // n'a aucune importance. Tous les jours restent donc sélectionnables.
  const griserSiOccupe = typeJournee !== "conges";
  // Palette personnalisée de l'agent (25/08, pour le liseré des jours
  // grisés) -- même clé que schedule (agCp), déjà disponible via la prop
  // agentProfiles.
  const agentColors = agentProfiles?.[agCp]?.agentColors || {};
  // Dates déjà mises de côté dans une AUTRE vague du panier -- grisées elles
  // aussi (peu importe le type actuellement affiché) pour ne jamais pouvoir
  // sélectionner deux fois le même jour dans deux vagues différentes.
  const panierDates = new Set(panier.flatMap(e=>e.dates));

  const toggleJourSelect = (dk, occupe) => {
    if (occupe) return;
    setFillMsg(null);
    setJoursSelect(prev => prev.includes(dk) ? prev.filter(x=>x!==dk) : [...prev, dk].sort());
  };

  // Prêt à afficher le calendrier : un poste doit être choisi pour "Poste de
  // travail", un statut pour "Congés" -- RP/RU n'ont besoin de rien de plus.
  const pretPourCalendrier =
    typeJournee==="poste" ? !!posteCode :
    typeJournee==="conges" ? !!congeStatut :
    true;

  // Écriture réelle d'UNE entrée du panier -- appelée en boucle par
  // remplirTout(), jamais directement depuis un bouton (plus aucune
  // écriture immédiate au fil de la saisie, tout passe par le lot).
  const ecrireEntree = async (entree) => {
    if (entree.write.kind==="conges") {
      // Demandé/Refusé : n'écrit jamais dans le planning perso (même
      // principe que le popup de saisie normal, onCongeStatutChange) --
      // pur ajout côté profil, aucun appel serveur planning nécessaire.
      const todayIso = new Date().toISOString().slice(0,10);
      setAgentProfiles(prev => {
        const currMap = prev[agent.id]?.congesDemandes || {};
        const nextMap = {...currMap};
        entree.dates.forEach(dk => {
          const v = schedule[`${agCp}-${dk}`];
          const jourEtaitVide = !(v && (v.equipe || v.equipe2));
          const curr = currMap[dk];
          nextMap[dk] = entree.write.statut==="demande"
            ? { statut:"demande", dateDemande: curr?.dateDemande || todayIso, jourEtaitVide }
            : { statut:"refuse", dateDemande: curr?.dateDemande||null, dateRefus: todayIso, jourEtaitVide };
        });
        return {...prev, [agent.id]:{...(prev[agent.id]||{}), congesDemandes: nextMap}};
      });
      return { ok:true, appliques:entree.dates.length, ignores:0 };
    }
    const { codeEquipe, codePoste, jsCode, horaires, overwrite } = entree.write;
    try {
      const res = await api.planning.bulkFill(agCp, { dates: entree.dates, codeEquipe, codePoste, horaires, overwrite });
      setSchedule(prev => {
        const next = {...prev};
        (res.appliques||[]).forEach(d => {
          next[`${agCp}-${d}`] = { equipe: codeEquipe, jsCode: jsCode || codePoste, horaires, prive: !["M","AM","N","J","CA"].includes(codeEquipe) };
        });
        return next;
      });
      return { ok:true, appliques:res.nb_appliques, ignores:res.ignores?.length||0 };
    } catch(e) {
      return { ok:false, error: e.message || "Erreur réseau" };
    }
  };

  // Bouton final unique : ajoute la sélection en cours au lot (si elle
  // n'y est pas déjà), vérifie qu'aucune date ne se retrouve dans 2 vagues
  // différentes (Olivier, tout premier message : "il faut verifier pour
  // eviter d'ecraser des jours deja saisie"), puis écrit tout le lot en
  // une seule action utilisateur.
  const remplirTout = async () => {
    setFillMsg(null);
    const derniere = construireEntreeCourante();
    const aTraiter = derniere ? [...panier, derniere] : [...panier];
    if (aTraiter.length===0) return;

    const parDate = {};
    aTraiter.forEach(e => e.dates.forEach(d => { (parDate[d] = parDate[d]||[]).push(e.label); }));
    const conflits = Object.entries(parDate).filter(([,labels])=>labels.length>1);
    if (conflits.length>0) {
      const detail = conflits.slice(0,3).map(([d,labels])=>`${fmtDateCourt(d)} (${labels.join(" + ")})`).join(", ");
      setFillMsg({ ok:false, text:`⚠️ ${conflits.length} jour${conflits.length>1?"s":""} en double entre plusieurs vagues du lot -- ${detail}${conflits.length>3?"…":""}. Retire le doublon d'une des vagues avant de continuer.` });
      return;
    }

    setFillBusy(true);
    let totalAppliques = 0, totalIgnores = 0;
    const nouvellesWaves = [];
    const echecs = [];
    for (const entree of aTraiter) {
      const res = await ecrireEntree(entree);
      if (res.ok) {
        totalAppliques += res.appliques;
        totalIgnores += res.ignores||0;
        if (res.appliques>0) nouvellesWaves.push({ id:Date.now()+Math.random(), label:entree.label, count:res.appliques });
      } else {
        echecs.push(entree);
      }
    }
    if (nouvellesWaves.length>0) setSessionWaves(prev => [...prev, ...nouvellesWaves]);
    setPanier(echecs); // les vagues échouées (réseau) restent dans le lot pour réessai
    setJoursSelect([]);
    setFillBusy(false);

    if (echecs.length>0) {
      setFillMsg({ ok:false, text:`⚠️ ${totalAppliques} jour${totalAppliques>1?"s":""} rempli${totalAppliques>1?"s":""}, mais ${echecs.length} vague${echecs.length>1?"s":""} en échec (réseau) -- reste${echecs.length>1?"nt":""} dans le lot, réessaie.` });
    } else {
      setFillMsg({ ok:true, text:`✓ ${totalAppliques} jour${totalAppliques>1?"s":""} rempli${totalAppliques>1?"s":""} au total${totalIgnores>0?` · ${totalIgnores} déjà occupé${totalIgnores>1?"s":""} (ignoré${totalIgnores>1?"s":""})`:""}.` });
    }
  };

  // ── Section B : effacement en masse ────────────────────────────────────
  const anneeCourante = new Date().getFullYear();
  const [clearFrom, setClearFrom] = useState(`${anneeCourante}-01-01`);
  const [clearTo, setClearTo] = useState(`${anneeCourante}-12-31`);
  const [clearConfirm, setClearConfirm] = useState(null); // {count}
  const [clearBusy, setClearBusy] = useState(false);
  const [clearMsg, setClearMsg] = useState(null);
  const [lastBatch, setLastBatch] = useState(null); // {batchId, nb, removed:{key:entry}}

  // Un jour est "affecté" par l'effacement s'il porte autre chose qu'une
  // note perso -- poste/RP/RU/Congés (equipe/equipe2), descente de nuit
  // seule (finNuit), grève ou formation. La note perso, elle, n'est jamais
  // comptée ici : elle survit toujours à l'effacement (voir bulkClear côté
  // serveur, 24/08), donc un jour qui n'a QUE ça ne doit ni apparaître dans
  // l'aperçu ni être retiré de l'affichage local après confirmation.
  const estAffecte = (v) => !!(v && (v.equipe || v.equipe2 || v.finNuit || v.greve || v.formation));

  const compterJoursOccupes = () => {
    let n = 0;
    Object.entries(schedule||{}).forEach(([k,v]) => {
      if (!k.startsWith(agCp+"-")) return;
      const dk = k.slice(agCp.length+1);
      if (dk<clearFrom || dk>clearTo) return;
      if (estAffecte(v)) n++;
    });
    return n;
  };

  const demanderEffacement = () => {
    setClearMsg(null);
    if (!clearFrom || !clearTo) { setClearMsg({ok:false,text:"Choisis les 2 dates."}); return; }
    if (clearTo<clearFrom) { setClearMsg({ok:false,text:"La date de fin doit être après la date de début."}); return; }
    const n = compterJoursOccupes();
    if (n===0) { setClearMsg({ok:false,text:"Aucun jour saisi dans cette période."}); return; }
    setClearConfirm({ count:n });
  };

  const confirmerEffacement = async () => {
    setClearBusy(true); setClearMsg(null);
    // Sauvegarde locale de ce qui va disparaître, pour une annulation
    // instantanée côté UI sans attendre un rechargement complet — la vraie
    // source de vérité pour l'annulation reste le backend (bulkClearUndo),
    // ceci n'est qu'un raccourci d'affichage.
    const removed = {};
    Object.entries(schedule||{}).forEach(([k,v]) => {
      if (!k.startsWith(agCp+"-")) return;
      const dk = k.slice(agCp.length+1);
      if (dk<clearFrom || dk>clearTo) return;
      if (estAffecte(v)) removed[k] = v;
    });
    try {
      const res = await api.planning.bulkClear(agCp, clearFrom, clearTo);
      setSchedule(prev => {
        const next = {...prev};
        Object.keys(removed).forEach(k => {
          // Une note perso survit à l'effacement (backend, 24/08) — le jour
          // n'est jamais totalement retiré de l'affichage local s'il en
          // portait une, seul son contenu de travail est vidé.
          if (removed[k].notePerso) next[k] = { notePerso: removed[k].notePerso };
          else delete next[k];
        });
        return next;
      });
      setLastBatch({ batchId: res.batch_id, nb: res.nb_effaces, removed });
      setClearConfirm(null);
      setClearMsg({ ok:true, text:`✓ ${res.nb_effaces} jour${res.nb_effaces>1?"s":""} effacé${res.nb_effaces>1?"s":""}.` });
    } catch(e) {
      setClearMsg({ ok:false, text: e.message || "Erreur lors de l'effacement. Réessaie." });
    } finally {
      setClearBusy(false);
    }
  };

  const annulerEffacement = async () => {
    if (!lastBatch) return;
    setClearBusy(true);
    try {
      await api.planning.bulkClearUndo(agCp, lastBatch.batchId);
      setSchedule(prev => ({ ...prev, ...lastBatch.removed }));
      setClearMsg({ ok:true, text:"✓ Effacement annulé — le planning est revenu comme avant." });
      setLastBatch(null);
    } catch(e) {
      setClearMsg({ ok:false, text: e.message || "Erreur lors de l'annulation. Réessaie." });
    } finally {
      setClearBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:520,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
        <div style={{background:"linear-gradient(135deg,#0f4c81,#1e3a5f)",padding:"18px 20px",display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",position:"sticky",top:0}}>
          <div style={{color:"#fff",fontSize:16,fontWeight:800}}>🗂️ Remplissage rapide</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer",opacity:.8}}>✕</button>
        </div>

        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:18}}>

          {/* ── Section A ── */}
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#1e293b",marginBottom:2}}>Remplir plusieurs jours</div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Choisis un type de journée, coche les jours concernés, puis change de type autant de fois que tu veux (Poste, RP, RU, Congés) — rien n'est écrit tant que tu n'as pas cliqué "✅ Tout remplir".</div>

            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {TYPES_JOURNEE.map(t => (
                <button key={t.code} onClick={()=>changerType(t.code)} disabled={fillBusy}
                  style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:fillBusy?"default":"pointer",fontSize:12,fontWeight:700,opacity:fillBusy?.5:1,
                    background:typeJournee===t.code?"#0369a1":"#e0f2fe",color:typeJournee===t.code?"#fff":"#0369a1"}}>
                  {t.label}
                </button>
              ))}
            </div>

            {typeJournee==="poste" && (<>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                {VACATIONS.map(v => (
                  <button key={v.code} onClick={()=>choisirVacation(v.code)} disabled={fillBusy}
                    style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:fillBusy?"default":"pointer",fontSize:12,fontWeight:700,opacity:fillBusy?.5:1,
                      background:vacation===v.code?"#0f4c81":"#f1f5f9",color:vacation===v.code?"#fff":"#334155"}}>
                    {v.label}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                {postesDispo.length===0
                  ? <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Aucun poste habilité pour cette vacation.</div>
                  : postesDispo.map(p => (
                    <button key={p.code} onClick={()=>choisirPoste(p.code)} disabled={fillBusy}
                      style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:fillBusy?"default":"pointer",fontSize:12,fontWeight:700,opacity:fillBusy?.5:1,
                        background:posteCode===p.code?"#1e293b":"#f1f5f9",color:posteCode===p.code?"#fff":"#334155"}}>
                      {p.label}
                    </button>
                  ))
                }
              </div>
            </>)}

            {typeJournee==="conges" && (
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                {CONGES_STATUTS.map(s => (
                  <button key={s.code} onClick={()=>choisirCongeStatut(s.code)} disabled={fillBusy}
                    style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:fillBusy?"default":"pointer",fontSize:12,fontWeight:700,opacity:fillBusy?.5:1,
                      background:congeStatut===s.code?"#eab308":"#fef9c3",color:congeStatut===s.code?"#fff":"#854d0e"}}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {typeJournee==="conges" && congeStatut==="accorde" && (
              <div style={{fontSize:10,fontWeight:600,color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:7,padding:"6px 9px",marginBottom:10}}>
                ⚠️ Accordé écrase le contenu existant des jours cochés (même règle que la saisie normale d'un congé).
              </div>
            )}
            {typeJournee==="conges" && (congeStatut==="demande"||congeStatut==="refuse") && (
              <div style={{fontSize:10,fontWeight:600,color:"#0369a1",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:7,padding:"6px 9px",marginBottom:10}}>
                ℹ️ N'écrit rien dans le planning — retrouve le suivi dans le module Congés.
              </div>
            )}

            {pretPourCalendrier && (<>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <button onClick={()=>changerMiniMois(-1)} style={{border:"none",background:"none",cursor:"pointer",fontSize:16,color:"#0f4c81",padding:"2px 8px",fontWeight:700}}>‹</button>
                <span style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>{MOIS_L[miniMonthNum-1]} {miniYear}</span>
                <button onClick={()=>changerMiniMois(1)} style={{border:"none",background:"none",cursor:"pointer",fontSize:16,color:"#0f4c81",padding:"2px 8px",fontWeight:700}}>›</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
                {["L","M","M","J","V","S","D"].map((j,i)=>(
                  <div key={i} style={{fontSize:9,fontWeight:700,color:"#94a3b8",textAlign:"center"}}>{j}</div>
                ))}
                {Array.from({length:miniOffset}).map((_,i)=><div key={"o"+i}/>)}
                {Array.from({length:miniDaysInMonth}).map((_,i)=>{
                  const day = i+1;
                  const dk = `${miniYear}-${String(miniMonthNum).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                  const v = schedule[`${agCp}-${dk}`];
                  const occupeReel = !!(v && (v.equipe || v.equipe2));
                  const occupeDb = occupeReel && griserSiOccupe;
                  const enAttenteLot = panierDates.has(dk);
                  const occupe = occupeDb || enAttenteLot;
                  const isSel = joursSelect.includes(dk);
                  // 25/08 (Olivier) : un jour grisé garde un liseré coloré
                  // rappelant ce qui l'occupe déjà -- couleur personnalisée
                  // de l'agent en priorité, sinon la couleur par défaut du
                  // type de journée (equipe, ou equipe2 pour le cas rare
                  // "nuit seule"/"congé seule" où equipe est vide). Un jour
                  // déjà mis de côté dans une autre vague du lot (pas encore
                  // en base) a son propre style ambre, distinct du gris "déjà
                  // en base", pour qu'on comprenne pourquoi il est bloqué.
                  const codeDeja = v?.equipe || v?.equipe2 || null;
                  const couleurDeja = codeDeja ? (agentColors[codeDeja] || DEFAULT_COLORS[codeDeja] || "#e2e8f0") : "#e2e8f0";
                  return (
                    <button key={dk} onClick={()=>toggleJourSelect(dk,occupe)} disabled={occupe||fillBusy}
                      title={occupeDb ? "Jour déjà rempli — vide-le d'abord dans le planning si tu veux le remplir ici" : enAttenteLot ? "Jour déjà dans une autre vague du lot — retire-le de cette vague si tu veux le remplir ici" : occupeReel && !griserSiOccupe ? "Jour déjà occupé — reste sélectionnable pour Congés" : undefined}
                      style={{aspectRatio:"1",border:`1.5px solid ${isSel?"#0f4c81":occupeDb?couleurDeja:enAttenteLot?"#f59e0b":occupeReel?"#fde68a":"#cbd5e1"}`,
                        borderRadius:6,background:isSel?"#0f4c81":occupeDb?"#f1f5f9":enAttenteLot?"#fffbeb":"#fff",
                        color:isSel?"#fff":occupeDb?"#cbd5e1":enAttenteLot?"#b45309":"#334155",opacity:fillBusy&&!occupe?.5:1,
                        fontSize:11,fontWeight:700,cursor:(occupe||fillBusy)?"default":"pointer",
                        display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
                      {day}
                    </button>
                  );
                })}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8,gap:8}}>
                <span style={{fontSize:11,fontWeight:600,color:"#475569"}}>{joursSelect.length} jour{joursSelect.length>1?"s":""} sélectionné{joursSelect.length>1?"s":""}</span>
                <button onClick={ajouterAuLot} disabled={joursSelect.length===0||fillBusy}
                  style={{background:(joursSelect.length===0||fillBusy)?"#cbd5e1":"#e0f2fe",color:(joursSelect.length===0||fillBusy)?"#fff":"#0369a1",border:"none",borderRadius:8,padding:"7px 14px",cursor:(joursSelect.length===0||fillBusy)?"default":"pointer",fontSize:12,fontWeight:700}}>
                  + Ajouter cette vague au lot
                </button>
              </div>
            </>)}

            {/* Le lot en attente -- rien n'est encore écrit en base, chaque
                vague reste modifiable/retirable jusqu'au clic final. */}
            {panier.length>0 && (
              <div style={{marginTop:10,paddingTop:10,borderTop:"1px dashed #fde68a"}}>
                <div style={{fontSize:10,fontWeight:700,color:"#b45309",marginBottom:5}}>🧺 Lot en attente ({panier.reduce((s,e)=>s+e.dates.length,0)} jour{panier.reduce((s,e)=>s+e.dates.length,0)>1?"s":""})</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {panier.map(e => (
                    <span key={e.id} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:10,fontWeight:600,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"3px 4px 3px 7px"}}>
                      {e.label} — {e.dates.length}j
                      <button onClick={()=>retirerDuLot(e.id)} disabled={fillBusy} style={{background:"none",border:"none",cursor:fillBusy?"default":"pointer",color:"#b45309",fontSize:12,fontWeight:800,padding:"0 2px",lineHeight:1}}>✕</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(panier.length>0 || joursSelect.length>0) && (
              <button onClick={remplirTout} disabled={fillBusy}
                style={{marginTop:10,width:"100%",background:fillBusy?"#cbd5e1":"#16a34a",color:"#fff",border:"none",borderRadius:8,padding:"10px 14px",cursor:fillBusy?"default":"pointer",fontSize:13,fontWeight:800}}>
                {fillBusy?"⏳ Écriture en cours...":`✅ Tout remplir (${panier.reduce((s,e)=>s+e.dates.length,0)+joursSelect.length} jour${panier.reduce((s,e)=>s+e.dates.length,0)+joursSelect.length>1?"s":""})`}
              </button>
            )}
            {fillMsg && <div style={{fontSize:11,fontWeight:600,color:fillMsg.ok?"#16a34a":"#dc2626",marginTop:8}}>{fillMsg.text}</div>}

            {/* Historique des vagues réellement écrites cette session (après
                un "Tout remplir" réussi) -- distinct du panier ci-dessus,
                qui lui n'est jamais encore en base. */}
            {sessionWaves.length>0 && (
              <div style={{marginTop:10,paddingTop:10,borderTop:"1px dashed #e2e8f0"}}>
                <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:5}}>✓ Vagues déjà appliquées cette session</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {sessionWaves.map(w => (
                    <span key={w.id} style={{fontSize:10,fontWeight:600,color:"#166534",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:6,padding:"3px 7px"}}>
                      {w.label} — {w.count}j
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Section B ── */}
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:16}}>
            <div style={{fontSize:13,fontWeight:800,color:"#991b1b",marginBottom:2}}>⚠️ Effacer le planning</div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Pour recommencer une période déjà saisie. Toujours annulable juste après. Les notes perso ne sont jamais effacées.</div>

            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              <input type="date" value={clearFrom} onChange={e=>{setClearFrom(e.target.value);setClearMsg(null);}}
                style={{flex:1,minWidth:120,padding:"7px 9px",border:"1.5px solid #fecaca",borderRadius:8,fontSize:12}}/>
              <input type="date" value={clearTo} onChange={e=>{setClearTo(e.target.value);setClearMsg(null);}}
                style={{flex:1,minWidth:120,padding:"7px 9px",border:"1.5px solid #fecaca",borderRadius:8,fontSize:12}}/>
            </div>

            {!clearConfirm ? (
              <button onClick={demanderEffacement} disabled={clearBusy}
                style={{background:"#fff",color:"#991b1b",border:"1.5px solid #fca5a5",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                Effacer cette période
              </button>
            ) : (
              <div style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:12,fontWeight:800,color:"#991b1b",marginBottom:8}}>
                  ⚠️ {clearConfirm.count} jour{clearConfirm.count>1?"s":""} seront effacés, du {fmtDateCourt(clearFrom)} au {fmtDateCourt(clearTo)}.
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setClearConfirm(null)} disabled={clearBusy}
                    style={{flex:1,background:"#fff",border:"1px solid #cbd5e1",borderRadius:8,padding:"8px",cursor:"pointer",fontSize:12,fontWeight:700,color:"#334155"}}>Annuler</button>
                  <button onClick={confirmerEffacement} disabled={clearBusy}
                    style={{flex:1,background:"#dc2626",color:"#fff",border:"none",borderRadius:8,padding:"8px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                    {clearBusy?"⏳...":"Poursuivre"}
                  </button>
                </div>
              </div>
            )}

            {clearMsg && <div style={{fontSize:11,fontWeight:600,color:clearMsg.ok?"#16a34a":"#dc2626",marginTop:8}}>{clearMsg.text}</div>}

            {lastBatch && (
              <button onClick={annulerEffacement} disabled={clearBusy}
                style={{marginTop:8,background:"none",border:"1px solid #cbd5e1",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#475569"}}>
                ↩️ Annuler cet effacement
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
