// ─── AstreinteView.jsx ──────────────────────────────────────────────────────
// Module "Astreinte" (20/09, demandé par Olivier), affiché tout en bas de
// CPS Officiel UNIQUEMENT (jamais dans Planning Prévisionnel, jamais dans le
// planning perso) — une ligne complètement indépendante du reste de la page,
// alimentée à 100% en saisie manuelle, jamais par l'import PDF/OCR.
//
// Petit annuaire dédié (~10 noms/prénoms, table astreinte_agent) SANS aucun
// lien CP — ce ne sont pas forcément des agents de l'appli, "on met juste
// des noms" (Olivier). Stockage PAR JOUR (table astreinte_jour, une ligne
// par date) plutôt que par semaine, pour permettre les échanges fractionnés
// décrits par Olivier ("il peut y avoir des échanges [...] il faut pouvoir
// modifier une journée ou plusieurs") — modifier un jour précis se fait tout
// simplement en naviguant sur ce jour (mêmes onglets Lu/Ma/.../Di que le
// reste de CPS Officiel) puis en rééditant sa case, sans UI dédiée
// supplémentaire.
//
// Semaine d'astreinte = vendredi -> jeudi suivant (7 jours), simplification
// actée avec Olivier pour la bascule du vendredi ("le vendredi de bascule
// affiche directement le nouvel agent, jamais de case à cheval entre deux
// personnes") : le calcul est rejoué ici uniquement pour l'AFFICHAGE (dates
// de la semaine dans le popup) -- le calcul qui fait foi reste côté serveur
// (astreinteController.setSemaine), jamais fait confiance à une liste de
// dates construite côté client pour l'écriture elle-même.
//
// Renommer/supprimer un agent du petit annuaire (option confirmée par
// Olivier, "plus simple, cohérent avec juste des noms, pas d'historique") :
// un renommage se répercute immédiatement sur toutes les dates déjà
// assignées (FK vers le même id) ; une suppression fait retomber ces dates à
// "Non renseigné" (ON DELETE SET NULL côté DB), jamais d'erreur bloquante.

import { useEffect, useState } from "react";
import api from "../api/client";

const JOURS_L = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const MOIS_ABBR = ["jan","fév","mar","avr","mai","juin","juil","août","sep","oct","nov","déc"];

function fmtCourt(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
}
function fmtLong(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return `${JOURS_L[d.getDay()]} ${d.getDate()} ${MOIS_ABBR[d.getMonth()]}`;
}
// Vendredi de la semaine d'astreinte contenant dateStr (même calcul que
// astreinteController.vendrediDeLaSemaine, rejoué ici purement pour
// l'affichage -- voir commentaire d'en-tête).
function vendrediDeLaSemaine(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay(); // 0=dim ... 5=ven, 6=sam
  const diff = (dow - 5 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}
function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function AstreinteEditPopup({ dateKey, roster, currentId, isVendredi, onClose, onSaved }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(currentId || null);
  const [busy, setBusy] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [newNom, setNewNom] = useState("");
  const [newPrenom, setNewPrenom] = useState("");
  const [manageBusy, setManageBusy] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const [renameNom, setRenameNom] = useState("");
  const [renamePrenom, setRenamePrenom] = useState("");

  const vendredi = vendrediDeLaSemaine(dateKey);
  const jeudi = new Date(vendredi); jeudi.setDate(jeudi.getDate()+6);
  const venIso = toIso(vendredi), jeuIso = toIso(jeudi);

  const q = search.trim().toLowerCase();
  const filtres = q
    ? roster.filter(a => a.prenom.toLowerCase().startsWith(q) || a.nom.toLowerCase().startsWith(q))
    : roster;

  const appliquer = async (mode) => {
    setBusy(true);
    try {
      if (mode === "jour") await api.astreinte.setJour(dateKey, selectedId);
      else await api.astreinte.setSemaine(dateKey, selectedId);
      onSaved();
      onClose();
    } catch (e) {
      alert("Erreur réseau, réessaie : " + e.message);
    } finally { setBusy(false); }
  };

  const ajouterAgent = async () => {
    const nom = newNom.trim(), prenom = newPrenom.trim();
    if (!nom || !prenom) return;
    setManageBusy(true);
    try {
      await api.astreinte.createAgent(nom, prenom);
      setNewNom(""); setNewPrenom("");
      onSaved(); // ne ferme jamais le popup (onSaved != la validation "jour"/"semaine" ci-dessus)
    } catch (e) {
      alert("Erreur réseau, réessaie : " + e.message);
    } finally { setManageBusy(false); }
  };

  const validerRenommage = async (id) => {
    const nom = renameNom.trim(), prenom = renamePrenom.trim();
    if (!nom || !prenom) return;
    setManageBusy(true);
    try {
      await api.astreinte.updateAgent(id, nom, prenom);
      setRenameId(null);
      onSaved();
    } catch (e) {
      alert("Erreur réseau, réessaie : " + e.message);
    } finally { setManageBusy(false); }
  };

  const supprimerAgent = async (id) => {
    if (!window.confirm("Retirer cette personne de la liste d'astreinte ?\nLes journées déjà assignées à cette personne redeviendront \"Non renseigné\"."))return;
    setManageBusy(true);
    try {
      await api.astreinte.deleteAgent(id);
      if (selectedId === id) setSelectedId(null);
      onSaved();
    } catch (e) {
      alert("Erreur réseau, réessaie : " + e.message);
    } finally { setManageBusy(false); }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:14,padding:18,width:"100%",maxWidth:420,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
          <div style={{fontSize:15,fontWeight:800,color:"#3730a3"}}>📟 Astreinte T</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#94a3b8"}}>✕</button>
        </div>
        <div style={{fontSize:12,color:"#64748b",marginBottom:isVendredi?4:14,textTransform:"capitalize"}}>{fmtLong(dateKey)}</div>
        {isVendredi && (
          <div style={{fontSize:11,color:"#4338ca",background:"#eef2ff",border:"1px solid #c7d2fe",borderRadius:7,padding:"5px 8px",marginBottom:10,lineHeight:1.4}}>
            Vendredi = jour de bascule à 12h00 — le choix ci-dessous est le <strong>successeur</strong> (à partir de 12h00). Celui qui termine à 12h00 reste celui déjà posé la veille (jeudi).
          </div>
        )}

        <input
          value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder="Tape le début du prénom ou du nom…"
          style={{width:"100%",boxSizing:"border-box",padding:"9px 12px",borderRadius:9,border:"1.5px solid #e2e8f0",fontSize:13,marginBottom:8}}
        />

        <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:180,overflowY:"auto",marginBottom:10}}>
          <button
            onClick={()=>setSelectedId(null)}
            style={{textAlign:"left",padding:"8px 10px",borderRadius:8,border:selectedId===null?"2px solid #4338ca":"1.5px solid #e2e8f0",background:selectedId===null?"#eef2ff":"#fff",cursor:"pointer",fontSize:12,color:"#64748b",fontStyle:"italic"}}
          >— Non renseigné —</button>
          {filtres.length===0 && <div style={{fontSize:12,color:"#94a3b8",padding:"6px 4px"}}>Aucun nom ne correspond.</div>}
          {filtres.map(a=>(
            <button
              key={a.id}
              onClick={()=>setSelectedId(a.id)}
              style={{textAlign:"left",padding:"8px 10px",borderRadius:8,border:selectedId===a.id?"2px solid #4338ca":"1.5px solid #e2e8f0",background:selectedId===a.id?"#eef2ff":"#fff",cursor:"pointer",fontSize:13,fontWeight:600,color:"#1e293b"}}
            >{a.prenom} {a.nom}</button>
          ))}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14}}>
          <button disabled={busy} onClick={()=>appliquer("jour")} style={{padding:"9px 12px",borderRadius:9,border:"none",background:"#4338ca",color:"#fff",fontWeight:700,fontSize:13,cursor:busy?"default":"pointer",opacity:busy?.6:1}}>
            ✓ Appliquer à ce jour uniquement
          </button>
          <button disabled={busy} onClick={()=>appliquer("semaine")} style={{padding:"9px 12px",borderRadius:9,border:"1.5px solid #4338ca",background:"#fff",color:"#4338ca",fontWeight:700,fontSize:13,cursor:busy?"default":"pointer",opacity:busy?.6:1}}>
            ✓ Appliquer à toute la semaine ({fmtCourt(venIso)} → {fmtCourt(jeuIso)})
          </button>
        </div>

        <button onClick={()=>setShowManage(s=>!s)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"#64748b",padding:0,marginBottom:showManage?10:0}}>
          {showManage?"▾":"▸"} ⚙️ Gérer la liste des agents d'astreinte
        </button>

        {showManage && (
          <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:9,padding:10}}>
            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
              {roster.map(a=>(
                <div key={a.id} style={{display:"flex",alignItems:"center",gap:6}}>
                  {renameId===a.id ? (
                    <>
                      <input value={renamePrenom} onChange={e=>setRenamePrenom(e.target.value)} placeholder="Prénom" style={{flex:1,minWidth:0,padding:"5px 7px",borderRadius:6,border:"1.5px solid #e2e8f0",fontSize:12}}/>
                      <input value={renameNom} onChange={e=>setRenameNom(e.target.value)} placeholder="Nom" style={{flex:1,minWidth:0,padding:"5px 7px",borderRadius:6,border:"1.5px solid #e2e8f0",fontSize:12}}/>
                      <button disabled={manageBusy} onClick={()=>validerRenommage(a.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#16a34a"}}>✓</button>
                      <button onClick={()=>setRenameId(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#94a3b8"}}>✕</button>
                    </>
                  ) : (
                    <>
                      <div style={{flex:1,fontSize:12,color:"#1e293b"}}>{a.prenom} {a.nom}</div>
                      <button onClick={()=>{setRenameId(a.id);setRenamePrenom(a.prenom);setRenameNom(a.nom);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:"#64748b",opacity:.7}}>✎</button>
                      <button disabled={manageBusy} onClick={()=>supprimerAgent(a.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:"#ef4444",opacity:.7}}>🗑</button>
                    </>
                  )}
                </div>
              ))}
              {roster.length===0 && <div style={{fontSize:12,color:"#94a3b8",fontStyle:"italic"}}>Liste vide pour l'instant.</div>}
            </div>
            <div style={{display:"flex",gap:5}}>
              <input value={newPrenom} onChange={e=>setNewPrenom(e.target.value)} placeholder="Prénom" style={{flex:1,minWidth:0,padding:"6px 8px",borderRadius:6,border:"1.5px solid #e2e8f0",fontSize:12}}/>
              <input value={newNom} onChange={e=>setNewNom(e.target.value)} placeholder="Nom" style={{flex:1,minWidth:0,padding:"6px 8px",borderRadius:6,border:"1.5px solid #e2e8f0",fontSize:12}}/>
              <button disabled={manageBusy||!newNom.trim()||!newPrenom.trim()} onClick={ajouterAgent} style={{padding:"6px 10px",borderRadius:6,border:"none",background:"#4338ca",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",opacity:(manageBusy||!newNom.trim()||!newPrenom.trim())?.5:1}}>+ Ajouter</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Mini-carte réutilisée pour un agent (couleur/étiquette configurables) ou
// son état vide -- factorisée pour ne jamais désynchroniser le rendu normal
// et le rendu vendredi (2 cartes) ci-dessous.
function AstreinteBadge({ agent, videLabel, initialsColor }) {
  return agent ? (
    <div style={{display:"flex",alignItems:"center",gap:6,background:"#eef2ff",border:"1.5px solid #c7d2fe",borderRadius:9,padding:"4px 9px"}}>
      <div style={{width:18,height:18,borderRadius:"50%",background:initialsColor,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,flexShrink:0}}>
        {agent.prenom[0]}{agent.nom[0]}
      </div>
      <div style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{agent.prenom} {agent.nom}</div>
    </div>
  ) : (
    <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic",padding:"4px 9px"}}>{videLabel}</div>
  );
}

export default function AstreinteRow({ dateKey, swipeHandlers }) {
  const [roster, setRoster] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [editing, setEditing] = useState(false);

  const chargerRoster = () => api.astreinte.getAgents().then(setRoster).catch(()=>{});
  const chargerSchedule = () => api.astreinte.getSchedule().then(setSchedule).catch(()=>{});

  useEffect(() => { chargerRoster(); chargerSchedule(); }, []);

  // Vendredi = jour de bascule (20/09, Olivier -- "le changement d'astreinte
  // se fait le vendredi a 12h00 [...] j'aimerais que pour le vendredi il
  // soit noté jusqu'à 12h00 et dans la case de droite le successeur à
  // partir de 12h00") : ce jour précis affiche 2 personnes au lieu d'une --
  // le SORTANT (dernier jour de son astreinte = la veille, jeudi, déjà
  // stockée là) et l'ENTRANT (le nouveau, stocké sur le vendredi lui-même --
  // c'est la valeur que ce composant édite normalement pour cette date,
  // rien de nouveau côté stockage/backend, purement un enrichissement
  // d'affichage). Un vendredi sans entrant renseigné affiche "Non
  // communiqué" plutôt que "Non renseigné" -- distinction demandée
  // explicitement par Olivier pour ce cas précis.
  const dateObj = new Date(dateKey + "T12:00:00");
  const isVendredi = dateObj.getDay() === 5;
  let sortant = null;
  if (isVendredi) {
    const veille = new Date(dateObj); veille.setDate(veille.getDate() - 1);
    sortant = schedule[toIso(veille)];
  }
  const entrant = schedule[dateKey]; // {astreinteAgentId, nom, prenom} | undefined

  return (
    <>
      {/* onTouchStart/onTouchEnd (20/09, Olivier -- "il faut qu'on puisse
          swipe vers droite et gauche depuis la case astreinte") : reprend
          tel quel le même swipeDay (useSwipeHandlers, App.jsx) déjà utilisé
          pour changer de jour depuis le reste de CPS Officiel -- attaché ici
          directement à la carte, jamais au popup d'édition (rendu comme un
          frère du DOM, jamais un enfant de cette div, donc un swipe pendant
          que le popup est ouvert ne peut structurellement jamais faire
          changer le jour affiché en arrière-plan pendant qu'on l'édite). */}
      <div onTouchStart={swipeHandlers?.onTouchStart} onTouchEnd={swipeHandlers?.onTouchEnd} style={{border:"1.5px solid #c7d2fe",borderRadius:14,overflow:"hidden",background:"#fff"}}>
        <div style={{background:"linear-gradient(135deg,#3730a3,#4338ca)",padding:"9px 18px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{color:"#fff",fontSize:14,fontWeight:800}}>📟 Astreinte</span>
          <span style={{fontSize:10,color:"#e0e7ff",fontStyle:"italic"}}>Saisie manuelle uniquement — jamais alimentée par l'import PDF</span>
        </div>
        <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{width:110,flexShrink:0}}>
            <span style={{fontFamily:"monospace",fontSize:10,fontWeight:800,color:"#fff",background:"#4338ca",borderRadius:5,padding:"2px 7px"}}>ASTREINTE T</span>
          </div>
          <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            {isVendredi ? (
              <>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  <span style={{fontSize:9,color:"#64748b",fontWeight:700}}>Jusqu'à 12h00</span>
                  <AstreinteBadge agent={sortant} videLabel="Non renseigné" initialsColor="#818cf8"/>
                </div>
                <span style={{color:"#c7d2fe",fontSize:16}}>→</span>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  <span style={{fontSize:9,color:"#64748b",fontWeight:700}}>À partir de 12h00</span>
                  <AstreinteBadge agent={entrant} videLabel="Non communiqué" initialsColor="#4338ca"/>
                </div>
              </>
            ) : (
              <AstreinteBadge agent={entrant} videLabel="Non renseigné" initialsColor="#4338ca"/>
            )}
            <button onClick={()=>setEditing(true)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1}}>✎</button>
          </div>
        </div>
      </div>
      {editing && (
        <AstreinteEditPopup
          dateKey={dateKey}
          roster={roster}
          currentId={entrant?.astreinteAgentId || null}
          isVendredi={isVendredi}
          onClose={()=>setEditing(false)}
          onSaved={()=>{ chargerRoster(); chargerSchedule(); }}
        />
      )}
    </>
  );
}
