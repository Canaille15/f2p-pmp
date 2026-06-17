const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

// 1. Ajouter l'état pour le popup dans PersonalView
const stateMarker = "const [calView,setCalView]=useState(\"mois\");";
const stateNew = `const [calView,setCalView]=useState("mois");
  const [dayPopup,setDayPopup]=useState(null); // {dk, entry}`;
c = c.replace(stateMarker, stateNew);

// 2. Remplacer le onClick des cases et le design
const oldCellStart = '            // Cases bicolores/tricolores';
const oldCellEnd = `              {!isSandwich&&!hasDebutNuit&&!(hasFinNuit&&!code)&&<>
                <div style={{flex:1,background:code&&showData?getColor(code):"transparent",
                  display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",
                  padding:"4px 3px",marginTop:14}}>
                  {code&&showData&&<>
                    <div style={{fontSize:8,fontWeight:800,color:getTc(code),textAlign:"center",lineHeight:1.3}}>
                      {CODES_FETES[code]?("F "+code):(EQ_COLORS[code]?.label||code)?.slice(0,4)}
                    </div>
                    {posteLabel&&<div style={{fontSize:6,color:getTc(code),opacity:.8,marginTop:1,textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>{posteLabel}</div>}
                  </>}
                  {hasFinNuit&&showData&&<div style={{fontSize:6,fontWeight:700,color:tcNuit,background:couleurNuit,borderRadius:3,padding:"1px 3px",marginTop:2}}>fin N</div>}
                </div>
              </>}`;

const newCell = `            // Cases style Google Agenda
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
              onClick={()=>{
                if(codeActif==="EFFACER"){ setDay(dk,null); return; }
                if(codeActif){ setDay(dk,code===codeActif?null:codeActif); return; }
                setDayPopup({dk, entry:en||null});
              }}
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

              {/* Fin de nuit (haut de case) */}
              {hasFinNuit&&<div style={{
                background:couleurNuit, color:tcNuit,
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", alignItems:"center", gap:3,
              }}>
                <span>↓</span><span>{(EQ_COLORS["N"]?.label||"Nuit").slice(0,4)}</span>
              </div>}

              {/* Période principale */}
              {code&&showData&&<div style={{
                background:getColor(code), color:getTc(code),
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", flexDirection:"column",
              }}>
                <span>{CODES_FETES[code]?("🩷 "+code):(EQ_COLORS[code]?.label||code)?.slice(0,5)}</span>
                {posteLabel&&<span style={{fontSize:8,opacity:.85,fontWeight:500}}>{posteLabel}</span>}
              </div>}

              {/* Début de nuit (bas de case) */}
              {hasDebutNuit&&<div style={{
                background:couleurNuit, color:tcNuit,
                borderRadius:5, padding:"2px 5px",
                fontSize:9, fontWeight:700, lineHeight:1.4,
                display:"flex", alignItems:"center", gap:3,
              }}>
                <span>{(EQ_COLORS["N"]?.label||"Nuit").slice(0,4)}</span><span>↓</span>
              </div>}`;

const startIdx = c.indexOf(oldCellStart);
const endIdx = c.indexOf(oldCellEnd);

if (startIdx === -1) { console.log('ERREUR: debut cases non trouve'); process.exit(1); }
if (endIdx === -1) { console.log('ERREUR: fin cases non trouve'); process.exit(1); }

c = c.slice(0, startIdx) + newCell + c.slice(endIdx + oldCellEnd.length);

// 3. Ajouter le DayEditPopup après la vue mois
const popupMarker = '{showHab&&<HabilitationsModal';
const popupNew = `{dayPopup&&<DayEditPopup
      date={dayPopup.dk}
      entry={dayPopup.entry}
      agent={agent}
      agentProfiles={agentProfiles}
      onSave={(newEntry)=>{
        const agCp=agent.immatriculation||agent.cp||agent.id;
        setDay(dayPopup.dk, newEntry.equipe);
        if(newEntry.equipe2) {
          const tomorrow=new Date(dayPopup.dk);
          tomorrow.setDate(tomorrow.getDate()+1);
          const tomorrowStr=tomorrow.toISOString().slice(0,10);
          setSchedule(prev=>({...prev,[agCp+'-'+tomorrowStr]:{...(prev[agCp+'-'+tomorrowStr]||{}),finNuit:true}}));
        }
        setDayPopup(null);
      }}
      onDelete={()=>{ setDay(dayPopup.dk,null); setDayPopup(null); }}
      onClose={()=>setDayPopup(null)}
    />}
    {showHab&&<HabilitationsModal`;

c = c.replace(popupMarker, popupNew);

fs.writeFileSync(f, c, 'utf8');
console.log('OK - cases Google Agenda + popup connecte');
