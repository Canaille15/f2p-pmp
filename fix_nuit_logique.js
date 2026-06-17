const fs = require('fs');

// ── 1. App.jsx — réécrire l'affichage des cases ──────────────────────────────
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldCells = `            // Cases style Google Agenda
            const hasFinNuit = !!(en?.finNuit && showData);
            const hasDebutNuit = !!(en?.equipe2 && showData);
            const couleurNuit = getColor("N");
            const tcNuit = getTc("N");
            const getPosteLabel = (jsCode) => {
              if(!jsCode||jsCode===code) return null;
              const pm=[...POSTES_PRCI_3x8,...POSTES_PAR_3x8].find(p=>p.M===jsCode||p.AM===jsCode||p.N===jsCode);
              if(pm) return pm.label;
              const pj=POSTES_JOURNEE.find(p=>p.jsCode===jsCode);
              if(pj) return pj.label.slice(0,8);
              return jsCode.slice(0,6);
            };
            const posteLabel = getPosteLabel(en?.jsCode);

            return <div key={dk}
              onClick={()=>{ setDayPopup({dk, entry:en||null}); }}
              style={{
                background:"#fff",
                border:isToday?"2px solid #6366f1":"1px solid #e8edf2",
                borderRadius:10, minHeight:64, cursor:"pointer",
                position:"relative",
                boxShadow:isToday?"0 0 0 3px #eef2ff":"0 1px 3px rgba(0,0,0,.04)",
                padding:"4px 5px 5px",
                display:"flex", flexDirection:"column", gap:2,
              }}>
              {/* Numéro du jour */}
              <div style={{fontSize:11,fontWeight:isToday?800:500,
                color:isToday?"#6366f1":isWE?"#94a3b8":"#374151",
                lineHeight:1.3, marginBottom:1}}>{dayNum}</div>

              {/* Fin de nuit (haut de case) - meme style que nuit */}
              {hasFinNuit&&<div style={{
                background:couleurNuit, color:tcNuit,
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>{(EQ_COLORS["N"]?.label||"Nuit").slice(0,4)}</span>
                {en?.jsCode&&en.jsCode!==code&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{en.jsCode}</span>}
              </div>}

              {/* Période principale - ne pas afficher si c'est juste une fin de nuit */}
              {code&&showData&&!(hasFinNuit&&code==="N"&&!en?.equipe2)&&<div style={{
                background:getColor(code), color:getTc(code),
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>{CODES_FETES[code]?("🩷 "+code):(EQ_COLORS[code]?.label||code)?.slice(0,5)}</span>
                {posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}
              </div>}

              {/* Début de nuit (bas de case) - meme style que nuit */}
              {hasDebutNuit&&<div style={{
                background:couleurNuit, color:tcNuit,
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>{(EQ_COLORS["N"]?.label||"Nuit").slice(0,4)}</span>
                {en?.jsCode2&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{en.jsCode2}</span>}
              </div>}`;

const newCells = `            // ── Cases logique nuit simplifiée ──
            // Règles:
            // - Case avec nuit soir : badge journée haut + badge Nuit+poste bas
            // - Case nuit suivante (finNuit+equipe2) : haut blanc + badge Nuit+poste bas
            // - Case après dernière nuit (finNuit seul) : entièrement blanche
            const hasDebutNuit = !!(en?.equipe2 === "N" && showData);
            const isNuitSuivante = !!(en?.finNuit && en?.equipe2 === "N" && showData);
            const isDescente = !!(en?.finNuit && !en?.equipe2 && showData);
            const couleurNuit = getColor("N");
            const tcNuit = getTc("N");
            const posteNuitLabel = en?.jsCode2 || null;
            const posteLabel = en?.jsCode && !["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","DISPO","NU","TC","TY","RN","JF"].includes(en.jsCode) ? en.jsCode : null;

            return <div key={dk}
              onClick={()=>{ setDayPopup({dk, entry:en||null}); }}
              style={{
                background:"#fff",
                border:isToday?"2px solid #6366f1":"1px solid #e8edf2",
                borderRadius:10, minHeight:64, cursor:"pointer",
                position:"relative",
                boxShadow:isToday?"0 0 0 3px #eef2ff":"0 1px 3px rgba(0,0,0,.04)",
                padding:"4px 5px 5px",
                display:"flex", flexDirection:"column", gap:2,
              }}>
              {/* Numéro du jour */}
              <div style={{fontSize:11,fontWeight:isToday?800:500,
                color:isToday?"#6366f1":isWE?"#94a3b8":"#374151",
                lineHeight:1.3, marginBottom:1}}>{dayNum}</div>

              {/* Case entièrement blanche = descente de nuit (rien à afficher) */}
              {isDescente&&null}

              {/* Case nuit suivante : haut blanc + nuit bas */}
              {isNuitSuivante&&<div style={{
                background:couleurNuit, color:tcNuit,
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>Nuit</span>
                {posteNuitLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteNuitLabel}</span>}
              </div>}

              {/* Période principale journée (si pas nuit suivante) */}
              {!isNuitSuivante&&!isDescente&&code&&showData&&<div style={{
                background:getColor(code), color:getTc(code),
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>{CODES_FETES[code]?("🩷 "+code):(EQ_COLORS[code]?.label||code)?.slice(0,5)}</span>
                {posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}
              </div>}

              {/* Début de nuit ce soir (bas de case) */}
              {hasDebutNuit&&!isNuitSuivante&&<div style={{
                background:couleurNuit, color:tcNuit,
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>Nuit</span>
                {posteNuitLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteNuitLabel}</span>}
              </div>}`;

if (c.includes(oldCells)) {
    c = c.replace(oldCells, newCells);
    console.log('OK - cases nuit reecrites');
} else {
    console.log('ERREUR - cellules non trouvees');
}

// ── 2. onSave — corriger propagation nuit sur J+1 ────────────────────────────
// Quand on sauvegarde une nuit, J+1 doit avoir finNuit:true ET equipe2 si nuit suivante
// Pour l'instant garder la logique existante mais corriger le jsCode du J+1
const oldTomorrow = `            const tomorrowEntry = {
              ...prevTomorrow,
              finNuit: true,
              equipe: prevTomorrow.equipe || null,
              jsCode: prevTomorrow.jsCode || null,
            };`;
const newTomorrow = `            const tomorrowEntry = {
              ...prevTomorrow,
              finNuit: true,
              equipe: prevTomorrow.equipe || null,
              jsCode: prevTomorrow.jsCode || null,
              jsCode2: prevTomorrow.jsCode2 || null,
            };`;

if (c.includes(oldTomorrow)) {
    c = c.replace(oldTomorrow, newTomorrow);
    console.log('OK - tomorrowEntry corrige');
}

fs.writeFileSync('src/App.jsx', c, 'utf8');

// ── 3. DayEditPopup — 3 boutons séparés ──────────────────────────────────────
let d = fs.readFileSync('src/components/DayEditPopup.jsx', 'utf8');

const oldActions = `        <div style={{
          padding:"14px 20px", borderTop:"1px solid #e2e8f0",
          display:"flex", gap:8, flexShrink:0, background:"#fff",
        }}>
          <button onClick={onDelete} style={{
            padding:"10px 14px", background:"#fef2f2", color:"#dc2626",
            border:"none", borderRadius:10, cursor:"pointer",
            fontSize:12, fontWeight:700,
          }}>🗑 Effacer</button>
          <button onClick={onClose} style={{
            flex:1, padding:"10px", background:"#f1f5f9", color:"#64748b",
            border:"none", borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:600,
          }}>Annuler</button>
          <button onClick={sauvegarder} disabled={!canSave} style={{
            flex:2, padding:"10px",
            background: canSave ? "#1e293b" : "#e2e8f0",
            color: canSave ? "#fff" : "#94a3b8",
            border:"none", borderRadius:10,
            cursor: canSave ? "pointer" : "default",
            fontSize:13, fontWeight:700,
          }}>✓ Enregistrer</button>
        </div>`;

const hasNuit = `!!entry?.equipe2`;
const newActions = `        {/* Boutons suppression séparés si case a plusieurs éléments */}
        {(entry?.equipe || entry?.equipe2 || entry?.finNuit) && (
          <div style={{ padding:"8px 20px 0", display:"flex", gap:6, flexShrink:0 }}>
            {entry?.equipe && <button onClick={()=>onDelete('journee')} style={{
              flex:1, padding:"7px 8px", background:"#fef2f2", color:"#dc2626",
              border:"1px solid #fecaca", borderRadius:8, cursor:"pointer",
              fontSize:11, fontWeight:700,
            }}>🗑 Journée</button>}
            {entry?.equipe2 && <button onClick={()=>onDelete('nuit')} style={{
              flex:1, padding:"7px 8px", background:"#1e293b", color:"#fff",
              border:"none", borderRadius:8, cursor:"pointer",
              fontSize:11, fontWeight:700,
            }}>🌙 Nuit</button>}
            {(entry?.equipe && entry?.equipe2) && <button onClick={()=>onDelete('tout')} style={{
              flex:1, padding:"7px 8px", background:"#fef2f2", color:"#dc2626",
              border:"1px solid #fecaca", borderRadius:8, cursor:"pointer",
              fontSize:11, fontWeight:700,
            }}>🗑 Tout</button>}
          </div>
        )}
        <div style={{
          padding:"14px 20px", borderTop:"1px solid #e2e8f0",
          display:"flex", gap:8, flexShrink:0, background:"#fff",
        }}>
          <button onClick={onClose} style={{
            flex:1, padding:"10px", background:"#f1f5f9", color:"#64748b",
            border:"none", borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:600,
          }}>Annuler</button>
          <button onClick={sauvegarder} disabled={!canSave} style={{
            flex:2, padding:"10px",
            background: canSave ? "#1e293b" : "#e2e8f0",
            color: canSave ? "#fff" : "#94a3b8",
            border:"none", borderRadius:10,
            cursor: canSave ? "pointer" : "default",
            fontSize:13, fontWeight:700,
          }}>✓ Enregistrer</button>
        </div>`;

if (d.includes(oldActions)) {
    d = d.replace(oldActions, newActions);
    console.log('OK - 3 boutons suppression');
} else {
    console.log('ERREUR - boutons non trouves');
}

fs.writeFileSync('src/components/DayEditPopup.jsx', d, 'utf8');
console.log('Termine');
