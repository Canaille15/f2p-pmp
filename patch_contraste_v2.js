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

// 0. Débordement : on adoucit les tailles max posées juste avant (vue Mois + Semaine)
{
  const target = 'fontSize:"clamp(13px,2.4vw,24px)"';
  const replacement = 'fontSize:"clamp(13px,1.8vw,18px)"';
  const count = content.split(target).length - 1;
  if (count === 1) { content = content.split(target).join(replacement); console.log('OK : taille max réduite (vue Mois, anti-débordement)'); }
  else { console.error('ATTENTION : taille max vue Mois trouvée ' + count + ' fois (attendu 1).'); ok = false; }
}
{
  const target = 'clamp(11px,1.8vw,18px)';
  const replacement = 'clamp(11px,1.4vw,15px)';
  const count = content.split(target).length - 1;
  if (count === 2) { content = content.split(target).join(replacement); console.log('OK : taille max réduite (vue Semaine, anti-débordement, 2 occurrences)'); }
  else { console.error('ATTENTION : taille max vue Semaine trouvée ' + count + ' fois (attendu 2).'); ok = false; }
}

// 1. Toggle Mois/Semaine/Planning : plus grand + plus contrasté
{
  const target = '<button key={k} onClick={()=>setCalView(k)} style={{border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",background:calView===k?"#fff":"transparent",color:calView===k?"#1e293b":"#94a3b8",fontSize:12,fontWeight:calView===k?700:400,boxShadow:calView===k?"0 1px 4px rgba(0,0,0,.08)":"none"}}>';
  const replacement = '<button key={k} onClick={()=>setCalView(k)} style={{border:"none",borderRadius:8,padding:"7px 16px",cursor:"pointer",background:calView===k?"#fff":"transparent",color:calView===k?"#1e293b":"#475569",fontSize:"clamp(12px,1.4vw,15px)",fontWeight:calView===k?700:600,boxShadow:calView===k?"0 1px 4px rgba(0,0,0,.08)":"none"}}>';
  const r = mustReplaceOnce(content, target, replacement, 'toggle Mois/Semaine/Planning agrandi + contraste');
  content = r.str; ok = ok && r.ok;
}

// 2. Bouton Aujourd'hui — vue Semaine (Mon Planning)
{
  const target = '<button onClick={()=>setWeekOffset(0)} style={{display:"flex",alignItems:"center",gap:5,border:"1.5px solid #6366f1",background:weekOffset===0?"#f1f5f9":"#eef2ff",color:weekOffset===0?"#94a3b8":"#4f46e5",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>Aujourd\'hui</button>';
  const replacement = '<button onClick={()=>setWeekOffset(0)} style={{display:"flex",alignItems:"center",gap:5,border:"1.5px solid #6366f1",background:weekOffset===0?"#f1f5f9":"#eef2ff",color:weekOffset===0?"#475569":"#4f46e5",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:"clamp(12px,1.3vw,15px)",fontWeight:700}}>Aujourd\'hui</button>';
  const r = mustReplaceOnce(content, target, replacement, 'bouton Aujourd\'hui (vue Semaine perso) agrandi + contraste');
  content = r.str; ok = ok && r.ok;
}

// 3. Bouton Aujourd'hui — vue Mois/Planning (Mon Planning)
{
  const target = '<button onClick={()=>{setMonthOff(0);window.dispatchEvent(new CustomEvent("f2ppmp:scrolltoday"));}} style={{display:"flex",alignItems:"center",gap:5,border:"1.5px solid #6366f1",background:monthOff===0?"#f1f5f9":"#eef2ff",color:monthOff===0?"#94a3b8":"#4f46e5",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>Aujourd\'hui</button>';
  const replacement = '<button onClick={()=>{setMonthOff(0);window.dispatchEvent(new CustomEvent("f2ppmp:scrolltoday"));}} style={{display:"flex",alignItems:"center",gap:5,border:"1.5px solid #6366f1",background:monthOff===0?"#f1f5f9":"#eef2ff",color:monthOff===0?"#475569":"#4f46e5",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:"clamp(12px,1.3vw,15px)",fontWeight:700,flexShrink:0}}>Aujourd\'hui</button>';
  const r = mustReplaceOnce(content, target, replacement, 'bouton Aujourd\'hui (vue Mois/Planning perso) agrandi + contraste');
  content = r.str; ok = ok && r.ok;
}

// 4. Bouton Aujourd'hui — CPS Officiel / Prévisionnel (GlobalView)
{
  const target = '<button onClick={goToToday} style={{display:"flex",alignItems:"center",gap:6,border:"none",background:weekOffset===0?"#f1f5f9":"#E6F1FB",color:weekOffset===0?"#94a3b8":"#0C447C",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>📅 Aujourd\'hui</button>';
  const replacement = '<button onClick={goToToday} style={{display:"flex",alignItems:"center",gap:6,border:"none",background:weekOffset===0?"#f1f5f9":"#E6F1FB",color:weekOffset===0?"#475569":"#0C447C",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:"clamp(12px,1.4vw,15px)",fontWeight:700}}>📅 Aujourd\'hui</button>';
  const r = mustReplaceOnce(content, target, replacement, 'bouton Aujourd\'hui (CPS Officiel/Prévisionnel) agrandi + contraste');
  content = r.str; ok = ok && r.ok;
}

// 5. Bandeau des 3 onglets du haut : texte responsive (plus grand sur ordi)
{
  const target = 'fontSize:11,fontWeight:actif?800:600,';
  const replacement = 'fontSize:"clamp(11px,1.6vw,15px)",fontWeight:actif?800:600,';
  const r = mustReplaceOnce(content, target, replacement, 'bandeau des 3 onglets : texte responsive');
  content = r.str; ok = ok && r.ok;
}

// 6. Label "POSTES HABILITÉS" et sous-texte : plus contrastés
{
  const target = '<div style={{fontSize:9,fontWeight:700,color:"#64748b",marginBottom:4,letterSpacing:.5}}>';
  const replacement = '<div style={{fontSize:12,fontWeight:700,color:"#1e293b",marginBottom:5,letterSpacing:.5}}>';
  const r = mustReplaceOnce(content, target, replacement, 'label "POSTES HABILITÉS" plus contrasté');
  content = r.str; ok = ok && r.ok;
}
{
  const target = '<span style={{fontSize:8,opacity:.7,lineHeight:1,fontWeight:400}}>';
  const replacement = '<span style={{fontSize:10,opacity:.9,lineHeight:1,fontWeight:600}}>';
  const r = mustReplaceOnce(content, target, replacement, 'sous-texte des badges postes habilités plus contrasté');
  content = r.str; ok = ok && r.ok;
}

if (!ok) {
  console.error('\nAU MOINS UN REMPLACEMENT A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApp.jsx mis à jour avec succès.');
