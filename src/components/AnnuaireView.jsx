// ─── AnnuaireView.jsx ──────────────────────────────────────────────────────
// Extrait d'App.jsx le 20/09 (nettoyage/perf, code-splitting) — aucun
// changement de logique, copie exacte. Agents (auto-gérés) / UO (postes
// fixes ou liés à CPS Officiel en lecture seule, titulaire dynamique selon
// l'heure) / Accès rapide. Notice complète : NOTICE_ANNUAIRE.md.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import api from "../api/client";
import { POSTES_PRCI_3x8, POSTES_PAR_3x8, POSTES_JOURNEE, EQ, findAlea } from "../App";

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
  // 18/09 -- findAlea (jamais un .find() local sans filtre) : un non_tenu
  // CIBLE sur un seul agent (doublon formation, voir Point 3/SelecteurCible)
  // ne doit jamais faire croire que TOUT le poste est non tenu -- le
  // titulaire peut tres bien etre present ce jour-la (formation != poste non
  // tenu, signale par Olivier le 18/09 : sans agentId, findAlea ne retombe
  // que sur un alea "tout le poste", jamais un alea cible sur un agent precis).
  const alea=findAlea(cpsAleas, jsCode, dateKey, uoRow.cps_famille);
  if(alea&&alea.type==="non_tenu") return {statut:"non_tenu",noms:[]};
  if(alea&&alea.type!=="message"){
    const trouves=(alea.agents_concernes||[]).map(id=>(agents||[]).find(a=>a.id===id)).filter(Boolean);
    if(trouves.length) return {statut:"trouve",noms:trouves.map(a=>`${a.prenom} ${a.nom}`)};
  }
  // Doublon formation (04/09, marqueur "/" SNCF) : jamais l'agent en
  // formation comme titulaire si le vrai titulaire occupe aussi ce
  // poste/date -- sinon la fiche pouvait afficher le stagiaire a la place
  // du titulaire reel.
  const candidats=(agents||[]).filter(a=>{
    const en=(cpsSchedule||{})[`${a.id}-${dateKey}`];
    return en&&(en.jsCode===jsCode||(posteLabel&&en.poste===posteLabel))&&!EQ[en.equipe]?.prive;
  });
  const trouve=candidats.find(a=>!(cpsSchedule||{})[`${a.id}-${dateKey}`]?.enFormation)||candidats[0];
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
export default function AnnuaireView({currentAgent,isAdmin,agents,cpsSchedule,cpsAleas}){
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
  const champStyle={width:"100%",padding:"11px 13px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:15,color:"#1e293b",background:"#fff"};
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
