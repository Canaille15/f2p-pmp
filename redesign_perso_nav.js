const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('personalDateJumpRef')) {
  console.log('Deja modifie, rien a faire.');
  process.exit(0);
}

// ETAPE 1 : ajouter la ref et les fonctions de saut, juste apres la declaration de monthOff
const anchor1 = '  const [monthOff,setMonthOff]=useState(0);';
const idx1 = content.indexOf(anchor1);
if (idx1 === -1) { console.log('ERREUR: anchor1 introuvable'); process.exit(1); }
const insertion1 = `
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
  };`;
content = content.slice(0, idx1 + anchor1.length) + insertion1 + content.slice(idx1 + anchor1.length);
console.log('Etape 1 OK - ref et fonctions de saut ajoutees');

// ETAPE 2 : remplacer le bloc nav semaine (precedent/date/Auj./suivant)
const idxSemaineStart = content.indexOf('<button onClick={()=>setWeekOffset(w=>w-1)} style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"5px 9px"');
if (idxSemaineStart === -1) { console.log('ERREUR: nav semaine introuvable'); process.exit(1); }
const idxSemaineEnd = content.indexOf('</button>', content.indexOf('setWeekOffset(w=>w+1)', idxSemaineStart)) + '</button>'.length;
const semaineBlock = content.slice(idxSemaineStart, idxSemaineEnd);

const idxSpanSemaine = semaineBlock.indexOf('<span style={{fontSize:12,fontWeight:600,color:"#475569",flex:1,textAlign:"center"}}>');
const idxSpanSemaineEnd = semaineBlock.indexOf('</span>', idxSpanSemaine) + '</span>'.length;
const spanSemaine = semaineBlock.slice(idxSpanSemaine, idxSpanSemaineEnd).replace('flex:1,textAlign:"center"', 'fontWeight:700');

const newSemaineNav = '<button onClick={()=>setWeekOffset(0)} style={{display:"flex",alignItems:"center",gap:5,border:"1.5px solid #6366f1",background:weekOffset===0?"#f1f5f9":"#eef2ff",color:weekOffset===0?"#94a3b8":"#4f46e5",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>Aujourd\'hui</button>\n        <button onClick={()=>{try{personalDateJumpRef.current.showPicker();}catch(e){personalDateJumpRef.current&&personalDateJumpRef.current.click();}}} style={{display:"flex",alignItems:"center",gap:4,border:"none",background:"none",cursor:"pointer",flex:1}}>\n          ' + spanSemaine + '\n          <span style={{fontSize:11,color:"#94a3b8"}}>\u25BE</span>\n        </button>';

content = content.slice(0, idxSemaineStart) + newSemaineNav + content.slice(idxSemaineEnd);
console.log('Etape 2 OK - nav semaine remplacee');

// ETAPE 3 : remplacer le bloc nav mois (precedent/date/Auj./suivant)
const idxMoisStart = content.indexOf('<button onClick={()=>setMonthOff(m=>m-1)} style={{border:"1.5px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"5px 9px"');
if (idxMoisStart === -1) { console.log('ERREUR: nav mois introuvable'); process.exit(1); }
const idxMoisEnd = content.indexOf('</button>', content.indexOf('setMonthOff(m=>m+1)', idxMoisStart)) + '</button>'.length;
const moisBlock = content.slice(idxMoisStart, idxMoisEnd);

const idxSpanMois = moisBlock.indexOf('<span style={{fontSize:13,fontWeight:700,color:"#1e293b",flex:1,textAlign:"center"}}>');
const idxSpanMoisEnd = moisBlock.indexOf('</span>', idxSpanMois) + '</span>'.length;
const spanMois = moisBlock.slice(idxSpanMois, idxSpanMoisEnd).replace(',flex:1,textAlign:"center"', '');

const newMoisNav = '<button onClick={()=>setMonthOff(0)} style={{display:"flex",alignItems:"center",gap:5,border:"1.5px solid #6366f1",background:monthOff===0?"#f1f5f9":"#eef2ff",color:monthOff===0?"#94a3b8":"#4f46e5",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>Aujourd\'hui</button>\n        <button onClick={()=>{try{personalDateJumpRef.current.showPicker();}catch(e){personalDateJumpRef.current&&personalDateJumpRef.current.click();}}} style={{display:"flex",alignItems:"center",gap:4,border:"none",background:"none",cursor:"pointer",flex:1}}>\n          ' + spanMois + '\n          <span style={{fontSize:11,color:"#94a3b8"}}>\u25BE</span>\n        </button>';

content = content.slice(0, idxMoisStart) + newMoisNav + content.slice(idxMoisEnd);
console.log('Etape 3 OK - nav mois remplacee');

// ETAPE 4 : ajouter le champ date cache (partage par les deux vues), juste avant le commentaire VUE SEMAINE
const idxVueSemaineComment = content.indexOf('VUE SEMAINE');
if (idxVueSemaineComment === -1) { console.log('ERREUR: commentaire VUE SEMAINE introuvable'); process.exit(1); }
const idxCommentStart = content.lastIndexOf('{/*', idxVueSemaineComment);
if (idxCommentStart === -1) { console.log('ERREUR: debut du commentaire introuvable'); process.exit(1); }
const hiddenInput = '<input ref={personalDateJumpRef} type="date" onChange={e=>{if(e.target.value){if(calView==="semaine")jumpToWeekDate(e.target.value);else jumpToMonthDate(e.target.value);}}} style={{position:"absolute",width:0,height:0,opacity:0,pointerEvents:"none",border:"none"}}/>\n    ';
content = content.slice(0, idxCommentStart) + hiddenInput + content.slice(idxCommentStart);
console.log('Etape 4 OK - champ date cache ajoute');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
