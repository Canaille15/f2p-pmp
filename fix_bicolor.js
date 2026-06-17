const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');
const startMarker = 'return <div key={dk} style={{background:bg,border:isToday?"2px solid #6366f1"';
const endMarker = '{en?.jsCode&&en.jsCode!==code&&<div style={{fontSize:7,color:"#94a3b8",fontFamily:"monospace",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{en.jsCode}</div>}';
const startIdx = c.indexOf(startMarker);
const endIdx = c.indexOf(endMarker);
if (startIdx === -1) { console.log('ERREUR: debut non trouve'); process.exit(1); }
if (endIdx === -1) { console.log('ERREUR: fin non trouve'); process.exit(1); }
const endIdxFinal = endIdx + endMarker.length;
const newCode = `// Cases bicolores/tricolores
            const hasFinNuit = !!(en?.finNuit && showData);
            const hasDebutNuit = !!(en?.equipe2 && showData);
            const isSandwich = hasFinNuit && hasDebutNuit;
            const couleurNuit = getColor("N");
            const tcNuit = getTc("N");
            const posteLabel=(()=>{
              if(!en?.jsCode||en.jsCode===code) return null;
              const pm=[...POSTES_PRCI_3x8,...POSTES_PAR_3x8].find(p=>p.M===en.jsCode||p.AM===en.jsCode||p.N===en.jsCode);
              if(pm) return pm.label;
              const pj=POSTES_JOURNEE.find(p=>p.jsCode===en.jsCode);
              if(pj) return pj.label.slice(0,8);
              return en.jsCode.slice(0,6);
            })();
            return <div key={dk} style={{
                border:isToday?"2px solid #6366f1":"1px solid #e2e8f0",
                borderRadius:8, minHeight:52, cursor:"pointer",
                position:"relative", overflow:"hidden",
                display:"flex", flexDirection:"column",
                boxShadow:isToday?"0 0 0 2px #eef2ff":"none",
              }}
              onClick={()=>{
                if(codeActif==="EFFACER"){ setDay(dk,null);
                } else if(codeActif){ setDay(dk,code===codeActif?null:codeActif);
                } else {
                  const codes=["","M","AM","N","J","RP","RU","NU","CA","MA","VT","FOR","DISPO"];
                  const cur=codes.indexOf(code||"");
                  const next=codes[(cur+1)%codes.length];
                  setDay(dk,next||null);
                }
              }}>
              <div style={{position:"absolute",top:3,left:5,fontSize:10,fontWeight:isToday?800:600,
                color:isToday?"#6366f1":isWE?"#94a3b8":"#1e293b",zIndex:3,lineHeight:1.4}}>{dayNum}</div>
              {isSandwich&&<>
                <div style={{flex:1,background:couleurNuit,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:7,fontWeight:700,color:tcNuit}}>fin N</span>
                </div>
                <div style={{flex:1,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:6,color:"#cbd5e1"}}>libre</span>
                </div>
                <div style={{flex:1,background:couleurNuit,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:7,fontWeight:700,color:tcNuit}}>deb N</span>
                </div>
              </>}
              {hasFinNuit&&!isSandwich&&!code&&<>
                <div style={{flex:1,background:couleurNuit,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:7,fontWeight:700,color:tcNuit}}>fin N</span>
                </div>
                <div style={{flex:2,background:"#fff"}}/>
              </>}
              {hasDebutNuit&&!isSandwich&&<>
                <div style={{flex:2,background:code&&showData?getColor(code):"#f8fafc",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingTop:14,paddingBottom:2}}>
                  {code&&showData&&<>
                    <span style={{fontSize:8,fontWeight:800,color:getTc(code)}}>
                      {CODES_FETES[code]?("F "+code):(EQ_COLORS[code]?.label||code)?.slice(0,4)}
                    </span>
                    {posteLabel&&<span style={{fontSize:6,color:getTc(code),opacity:.8,marginTop:1}}>{posteLabel}</span>}
                  </>}
                </div>
                <div style={{flex:1,background:couleurNuit,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:7,fontWeight:700,color:tcNuit}}>deb N</span>
                </div>
              </>}
              {!isSandwich&&!hasDebutNuit&&!(hasFinNuit&&!code)&&<>
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
const result = c.slice(0, startIdx) + newCode + c.slice(endIdxFinal);
fs.writeFileSync(f, result, 'utf8');
console.log('OK - cases bicolores appliquees');
