const fs = require('fs');
const path = './src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

function mustReplaceOnce(str, target, replacement, label) {
  const count = str.split(target).length - 1;
  if (count !== 1) {
    console.error('ATTENTION : "' + label + '" trouvé ' + count + ' fois (attendu 1). Ignoré par sécurité.');
    return { str, ok: false };
  }
  console.log('OK : ' + label);
  return { str: str.split(target).join(replacement), ok: true };
}

let ok = true;

// 1. Déclaration du ref + effets de scroll, juste après la signature de VuePlanning
{
  const target = 'function VuePlanning({dates, agent, schedule, getColor, getTc, isOwnProfile, onDayClick}){\r\n';
  const replacement = target +
    '  const todayRowRef = useRef(null);\r\n' +
    '  useEffect(()=>{ todayRowRef.current?.scrollIntoView({block:"center"}); },[dates]);\r\n' +
    '  useEffect(()=>{\r\n' +
    '    const handler=()=>todayRowRef.current?.scrollIntoView({block:"center",behavior:"smooth"});\r\n' +
    '    window.addEventListener("f2ppmp:scrolltoday",handler);\r\n' +
    '    return ()=>window.removeEventListener("f2ppmp:scrolltoday",handler);\r\n' +
    '  },[]);\r\n';
  const r = mustReplaceOnce(content, target, replacement, 'ajout du ref + effets de scroll dans VuePlanning');
  content = r.str; ok = ok && r.ok;
}

// 2. Ref posé sur la ligne du jour (uniquement si c'est aujourd'hui)
{
  const target = '              <div onClick={()=>onDayClick&&onDayClick(l.dk, schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]||null)} style={{\r\n';
  const replacement = '              <div ref={l.isToday?todayRowRef:null} onClick={()=>onDayClick&&onDayClick(l.dk, schedule[`${agent.immatriculation||agent.cp||agent.id}-${l.dk}`]||null)} style={{\r\n';
  const r = mustReplaceOnce(content, target, replacement, 'ref sur la ligne du jour courant');
  content = r.str; ok = ok && r.ok;
}

// 3. Le bouton "Aujourd'hui" déclenche aussi le scroll (utile même si le mois était déjà le bon)
{
  const target = '<button onClick={()=>setMonthOff(0)} style={{display:"flex",alignItems:"center",gap:5,border:"1.5px solid #6366f1",background:monthOff===0?"#f1f5f9":"#eef2ff",color:monthOff===0?"#94a3b8":"#4f46e5",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>Aujourd\'hui</button>';
  const replacement = '<button onClick={()=>{setMonthOff(0);window.dispatchEvent(new CustomEvent("f2ppmp:scrolltoday"));}} style={{display:"flex",alignItems:"center",gap:5,border:"1.5px solid #6366f1",background:monthOff===0?"#f1f5f9":"#eef2ff",color:monthOff===0?"#94a3b8":"#4f46e5",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>Aujourd\'hui</button>';
  const r = mustReplaceOnce(content, target, replacement, 'bouton Aujourd\'hui déclenche aussi le scroll');
  content = r.str; ok = ok && r.ok;
}

if (!ok) {
  console.error('\nAU MOINS UN REMPLACEMENT A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApp.jsx mis à jour avec succès.');
