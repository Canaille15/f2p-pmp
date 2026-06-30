const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const startMarker = 'if(ag)return(<div key={si} style={{display:"flex",alignItems:"center",gap:6,background:isForm?"#f0fdf4":isMe?"#fafdf0":"rgba(255,255,255,.8)",border:`1.5px solid ${isForm?"#22c55e":isMe?(fam?.accent||"#6366f1"):"rgba(0,0,0,.07)"}`,borderRadius:9,padding:"4px 9px"}}>';
const idxStart = content.indexOf(startMarker);
if (idxStart === -1) { console.log('ERREUR: startMarker introuvable'); process.exit(1); }

const buttonMarker = 'setAleaTarget({jsCode:row.jsCode,famille:row.famille,nomOfficiel:`${ag.prenom} ${ag.nom}`})';
const idxButton = content.indexOf(buttonMarker, idxStart);
if (idxButton === -1) { console.log('ERREUR: buttonMarker introuvable'); process.exit(1); }

const closeDivMarker = '</div>);';
const idxCloseDiv = content.indexOf(closeDivMarker, idxButton);
if (idxCloseDiv === -1) { console.log('ERREUR: closeDivMarker introuvable'); process.exit(1); }
const idxEnd = idxCloseDiv + closeDivMarker.length;

const originalBlock = content.slice(idxStart, idxEnd);
console.log('Bloc original capture (longueur ' + originalBlock.length + ' caracteres) - OK');

const ROND = '\u25CF';      // ●
const CROIX = '\u2715';     // ✕
const REFRESH = '\u{1F504}'; // 🔄
const CALENDAR = '\u{1F4C5}'; // 📅

const previsionnelBranch =
'if(ag&&isPrevisionnel){\n' +
'                      const sig=findPrevisionnelSignalement(previsionnelSignalements,ag.id,dateKey);\n' +
'                      if(sig){\n' +
'                        const nomsRemplacants=(sig.agents_remplacants||[]).map(r=>`${r.prenom} ${r.nom}`).join(", ");\n' +
'                        return(<div key={si} style={{display:"flex",flexDirection:"column",gap:3,background:"#f5f3ff",border:"1.5px solid #c4b5fd",borderRadius:9,padding:"5px 9px"}}>\n' +
'                          <div style={{display:"flex",alignItems:"center",gap:6}}>\n' +
'                            <Av initials={ag.initials} size={18} famille={ag.famille}/>\n' +
'                            <div style={{fontSize:11,fontWeight:600,color:"#94a3b8",textDecoration:"line-through"}}>{ag.prenom} {ag.nom}</div>\n' +
'                          </div>\n' +
'                          <div style={{fontSize:11,fontWeight:700,color:"#6d28d9",paddingLeft:24}}>{nomsRemplacants||"?"}</div>\n' +
'                          <div style={{display:"flex",alignItems:"center",gap:6,paddingLeft:24}}><div style={{fontSize:9,color:"#7c3aed"}}>' + CALENDAR + ' Signalement</div><button onClick={()=>annulerPrevisionnelSignalement(sig.id,setPrevisionnelSignalements)} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#7c3aed",opacity:.6,marginLeft:"auto"}}>' + CROIX + '</button></div>\n' +
'                        </div>);\n' +
'                      }\n' +
'                      return(<div key={si} style={{display:"flex",alignItems:"center",gap:6,background:isMe?"#fafdf0":"rgba(255,255,255,.8)",border:`1.5px solid ${isMe?(fam?.accent||"#6366f1"):"rgba(0,0,0,.07)"}`,borderRadius:9,padding:"4px 9px"}}>\n' +
'                        <Av initials={ag.initials} size={22} famille={ag.famille}/>\n' +
'                        <div>\n' +
'                          <div style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{ag.prenom} {ag.nom}{isMe&&<span style={{fontSize:8,color:fam?.accent||"#6366f1",marginLeft:3}}>' + ROND + '</span>}</div>\n' +
'                          <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>{ag.grade}</div>\n' +
'                        </div>\n' +
'                        <button onClick={()=>setPrevisionnelTarget({agentId:ag.id,nomTitulaire:`${ag.prenom} ${ag.nom}`})} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:.5,padding:1,marginLeft:"auto"}}>' + REFRESH + '</button>\n' +
'                      </div>);\n' +
'                    }\n' +
'                    ';

content = content.slice(0, idxStart) + previsionnelBranch + originalBlock + content.slice(idxEnd);
console.log('Etape 2 OK - branche previsionnel inseree avant le bloc original (capture verbatim)');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - relancer wire_step3_4.js pour la suite');
