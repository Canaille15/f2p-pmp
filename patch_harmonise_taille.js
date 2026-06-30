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

{
  const target = '<button onClick={()=>setWeekOffset(0)} style={{display:"flex",alignItems:"center",gap:5,border:"1.5px solid #6366f1",background:weekOffset===0?"#f1f5f9":"#eef2ff",color:weekOffset===0?"#475569":"#4f46e5",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:"clamp(12px,1.3vw,15px)",fontWeight:700}}>Aujourd\'hui</button>';
  const replacement = target.replace('clamp(12px,1.3vw,15px)', 'clamp(12px,1.4vw,15px)');
  const r = mustReplaceOnce(content, target, replacement, 'taille harmonisée — Aujourd\'hui (Semaine perso)');
  content = r.str; ok = ok && r.ok;
}

{
  const target = '<button onClick={()=>{setMonthOff(0);window.dispatchEvent(new CustomEvent("f2ppmp:scrolltoday"));}} style={{display:"flex",alignItems:"center",gap:5,border:"1.5px solid #6366f1",background:monthOff===0?"#f1f5f9":"#eef2ff",color:monthOff===0?"#475569":"#4f46e5",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:"clamp(12px,1.3vw,15px)",fontWeight:700,flexShrink:0}}>Aujourd\'hui</button>';
  const replacement = target.replace('clamp(12px,1.3vw,15px)', 'clamp(12px,1.4vw,15px)');
  const r = mustReplaceOnce(content, target, replacement, 'taille harmonisée — Aujourd\'hui (Mois/Planning perso)');
  content = r.str; ok = ok && r.ok;
}

if (!ok) {
  console.error('\nAU MOINS UN REMPLACEMENT A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApp.jsx mis à jour avec succès.');
